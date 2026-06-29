import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
// snarkjs ships no TypeScript types
// eslint-disable-next-line @typescript-eslint/no-var-requires
const snarkjs = require('snarkjs') as {
  groth16: {
    fullProve(input: Record<string, string>, wasm: string, zkey: string): Promise<{ proof: object; publicSignals: string[] }>;
    verify(vkey: object, publicSignals: string[], proof: object): Promise<boolean>;
  };
};
import { ClinicalFacts } from './deidentifier';

const BN128_PRIME = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

// ICD-10 chapter keyword mapping — ordered by clinical acuity (most acute first).
// The first chapter that matches any diagnosis in the list wins.
const ICD_CHAPTERS: Array<{ chapter: number; name: string; keywords: string[] }> = [
  { chapter: 9,  name: 'Circulatory System',              keywords: ['nstemi', 'stemi', 'angina', 'myocardial infarction', 'heart failure', 'cardiac', 'coronary', 'atrial fibrillation', 'arrhythmia', 'ischemia', 'cardiovascular', 'infarct', 'stroke', 'ischaemic stroke', 'cerebral infarction', 'mca occlusion', 'thrombectomy', 'thrombolysis', 'alteplase'] },
  { chapter: 10, name: 'Respiratory System',              keywords: ['asthma', 'copd', 'bronchitis', 'pulmonary', 'pleural', 'pneumothorax', 'respiratory failure'] },
  { chapter: 2,  name: 'Neoplasms',                       keywords: ['cancer', 'tumor', 'carcinoma', 'neoplasm', 'malignant', 'lymphoma', 'leukemia', 'nsclc', 'adenocarcinoma', 'lung cancer'] },
  { chapter: 1,  name: 'Infectious and Parasitic',        keywords: ['infection', 'sepsis', 'tuberculosis', 'covid', 'hiv', 'bacteraemia'] },
  { chapter: 6,  name: 'Nervous System',                  keywords: ['seizure', 'epilepsy', 'tonic-clonic', 'parkinson', 'multiple sclerosis', 'migraine', 'neuropathy', 'encephalopathy', 'pres', 'meningitis'] },
  { chapter: 5,  name: 'Mental and Behavioural',          keywords: ['depression', 'anxiety', 'schizophrenia', 'bipolar', 'dementia', 'psychosis'] },
  { chapter: 4,  name: 'Endocrine/Nutritional/Metabolic', keywords: ['diabetic ketoacidosis', 'dka', 'diabetes mellitus', 'diabetes', 'thyroid', 'hyperlipidemia', 'metabolic syndrome', 'obesity', 'hypercholesterolemia', 'hyperosmolar', 'hyperglycaemia', 'hyperglycemia'] },
  { chapter: 14, name: 'Genitourinary System',            keywords: ['renal failure', 'acute kidney', 'nephropathy', 'urinary', 'prostate', 'bladder'] },
  { chapter: 11, name: 'Digestive System',                keywords: ['gastritis', 'ulcer', 'colitis', 'crohn', 'hepatitis', 'cirrhosis', 'pancreatitis', 'cholangitis', 'cholelithiasis', 'biliary', 'cholecystitis', 'ercp'] },
  { chapter: 13, name: 'Musculoskeletal',                 keywords: ['arthritis', 'osteoporosis', 'fracture', 'scoliosis', 'rheumatoid'] },
  { chapter: 3,  name: 'Blood Diseases',                  keywords: ['anemia', 'thrombocytopenia', 'coagulation', 'haemophilia'] },
  { chapter: 18, name: 'Symptoms/Signs (unspecified)',     keywords: ['chest pain', 'shortness of breath', 'fatigue', 'fever', 'dyspnea'] },
];

// Normalise a diagnosis entry to a plain string regardless of what shape the LLM returned.
function dxToString(d: unknown): string {
  if (typeof d === 'string') return d;
  if (d && typeof d === 'object') {
    const o = d as Record<string, unknown>;
    return String(o['name'] ?? o['diagnosis'] ?? o['condition'] ?? JSON.stringify(d));
  }
  return String(d);
}

// Returns the ICD chapter of the most clinically specific matched diagnosis.
function getDiagnosisChapter(diagnoses: unknown[]): { chapter: number; name: string; matchedDx: string } {
  const strs = diagnoses.map(dxToString);
  const lower = strs.map(s => s.toLowerCase());

  // Diagnoses-first: the primary (first) diagnosis takes precedence.
  // Iterating chapters first would let a secondary comorbidity (e.g. asthma)
  // beat the primary diagnosis (e.g. DKA) if its chapter ranks higher.
  for (let i = 0; i < lower.length; i++) {
    for (const entry of ICD_CHAPTERS) {
      if (entry.chapter === 18) continue;
      if (entry.keywords.some(kw => lower[i].includes(kw))) {
        return { chapter: entry.chapter, name: entry.name, matchedDx: strs[i] };
      }
    }
  }
  return { chapter: 18, name: 'Symptoms/Signs (unspecified)', matchedDx: strs[0] ?? 'unknown' };
}

// Reduce arbitrary bytes to a BN128 field element
function toFieldElement(buf: Buffer): bigint {
  return BigInt('0x' + crypto.createHash('sha256').update(buf).digest('hex')) % BN128_PRIME;
}

export interface ZkResult {
  proof: object;
  publicSignals: string[];
  summary: {
    ageRange: string;
    icdChapter: number;
    icdChapterName: string;
    matchedDiagnosis: string;
    dataCommitment: string;
    verified: boolean;
    provingSystem: string;
    constraintCount: number;
    timestamp: string;
  };
}

export async function generateProof(outputDir: string): Promise<ZkResult> {
  const wasmPath  = path.resolve('src/circuits/build/patient_js/patient.wasm');
  const zkeyPath  = path.resolve('src/circuits/build/patient_final.zkey');
  const vkeyPath  = path.resolve('src/circuits/build/verification_key.json');

  for (const p of [wasmPath, zkeyPath, vkeyPath]) {
    if (!fs.existsSync(p)) throw new Error(`Circuit artifact missing: ${p}\nRun: bash scripts/build-circuit.sh`);
  }

  const facts     = JSON.parse(fs.readFileSync(path.join(outputDir, 'facts.json'), 'utf-8')) as ClinicalFacts;
  const patientKey = fs.readFileSync(path.join(outputDir, 'patient_key.b64'), 'utf-8').trim();

  // Encode inputs as field elements
  const patientKeyBuf = Buffer.from(patientKey, 'base64');
  const factsBuf      = Buffer.from(JSON.stringify(facts));
  const patientKeyFp  = toFieldElement(patientKeyBuf).toString();
  const factsFp       = toFieldElement(factsBuf).toString();

  const ageYears       = facts.ageYears ?? 0;
  const ageBracketLow  = Math.floor(ageYears / 10) * 10;
  const { chapter, name: icdName, matchedDx } = getDiagnosisChapter((facts.diagnoses ?? []) as unknown[]);

  const circuitInput = {
    ageYears:        ageYears.toString(),
    ageBracketLow:   ageBracketLow.toString(),
    diagnosisChapter: chapter.toString(),
    patientKeyFp,
    factsFp,
  };

  console.log(`\n[zkRunner] Generating Groth16 proof...`);
  console.log(`  Age input    : ${ageYears} → bracket [${ageBracketLow}, ${ageBracketLow + 9}]`);
  console.log(`  ICD chapter  : ${chapter} (${icdName})`);
  console.log(`  Matched dx   : "${matchedDx}"`);

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(circuitInput, wasmPath, zkeyPath);

  const vkey    = JSON.parse(fs.readFileSync(vkeyPath, 'utf-8'));
  const verified = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  if (!verified) throw new Error('Proof verification failed — circuit constraints not satisfied');

  const [sigAgeLow, sigAgeHigh, sigChapter, sigCommitment] = publicSignals;

  const summary = {
    ageRange:        `${sigAgeLow}-${sigAgeHigh}`,
    icdChapter:      parseInt(sigChapter),
    icdChapterName:  icdName,
    matchedDiagnosis: matchedDx,
    dataCommitment:  sigCommitment,
    verified:        true,
    provingSystem:   'groth16',
    constraintCount: 279,
    timestamp:       new Date().toISOString(),
  };

  fs.writeFileSync(path.join(outputDir, 'proof.json'),          JSON.stringify(proof, null, 2));
  fs.writeFileSync(path.join(outputDir, 'public_signals.json'), JSON.stringify(publicSignals, null, 2));
  fs.writeFileSync(path.join(outputDir, 'zk_summary.json'),     JSON.stringify(summary, null, 2));

  console.log(`  Public signals:`);
  console.log(`    ageRangeLow      : ${sigAgeLow}`);
  console.log(`    ageRangeHigh     : ${sigAgeHigh}`);
  console.log(`    icdChapter       : ${sigChapter}`);
  console.log(`    dataCommitment   : ${sigCommitment.slice(0, 20)}...`);
  console.log(`  Proof verified   : ✓`);

  return { proof, publicSignals, summary };
}

// Standalone smoke test
if (require.main === module) {
  const args        = process.argv.slice(2);
  const dirIdx      = args.indexOf('--output-dir');
  const outputDir   = dirIdx !== -1 ? args[dirIdx + 1] : null;

  if (!outputDir) {
    console.error('Usage: npx ts-node src/zkRunner.ts --output-dir output/<runId>');
    process.exit(1);
  }

  (async () => {
    console.log('=== Phase 4 ZK Proof Smoke Test ===\n');
    const result = await generateProof(outputDir);
    console.log('\n==========================================');
    console.log('ZK SUMMARY:');
    console.log('==========================================');
    console.log(JSON.stringify(result.summary, null, 2));
    console.log('\n=== Smoke test PASSED ===');
  })().catch(err => {
    console.error('Smoke test FAILED:', (err as Error).message);
    process.exit(1);
  });
}
