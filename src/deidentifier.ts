import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { CortiClientWrapper } from './corti';
import { readDocument } from './pdfReader';
import { loadConfig } from './config';
import { detectAndReplace } from './phiDetector';

export interface PhiMap {
  [codename: string]: string;
}

export interface ClinicalFacts {
  diagnoses: string[];
  vitals: {
    bloodPressure?: string | null;
    heartRate?: number | null;
    oxygenSaturation?: number | null;
    temperature?: number | null;
    weight?: number | null;
    height?: number | null;
  };
  medications: Array<string | { name?: string; dose?: string | null; frequency?: string | null; status?: string | null }>;
  labValues: Record<string, string>;
  ageYears?: number | null;
  ageRange?: string | null;
  sex?: string | null;
  chiefComplaint?: string | null;
}

export interface EncryptedPhiMap {
  iv: string;
  tag: string;
  ciphertext: string;
  algorithm: string;
}

export interface DeidentifyResult {
  runId: string;
  outputDir: string;
  anonymizedText: string;
  phiMap: PhiMap;
  facts: ClinicalFacts;
  patientKey: string;
  encryptedPhiMap: EncryptedPhiMap;
  commitment: string;
  chunkCount: number;
  totalPhiTokens: number;
}


const FACTS_PROMPT = (anonymizedText: string) =>
  `Extract structured clinical facts from this anonymized clinical note. Return ONLY a JSON code block with no extra text.

<note>
${anonymizedText}
</note>

\`\`\`json
{
  "diagnoses": [],
  "vitals": {
    "bloodPressure": null,
    "heartRate": null,
    "oxygenSaturation": null,
    "temperature": null,
    "weight": null,
    "height": null
  },
  "medications": [],
  "labValues": {},
  "ageYears": null,
  "ageRange": null,
  "sex": null,
  "chiefComplaint": null
}
\`\`\`

Fill every field found in the note. Use null for anything not mentioned. ageRange should be a 10-year bracket like "40-50".`;

function parseJsonBlock(response: string): unknown {
  const jsonMatch = response.match(/```json\s*([\s\S]*?)```/);
  if (jsonMatch) return JSON.parse(jsonMatch[1]);

  // Fallback: find raw JSON object
  const start = response.indexOf('{');
  const end = response.lastIndexOf('}');
  if (start !== -1 && end !== -1) return JSON.parse(response.slice(start, end + 1));

  throw new Error(`No JSON block found in response:\n${response.slice(0, 200)}`);
}


function encryptPhiMap(phiMap: PhiMap, key: Buffer): EncryptedPhiMap {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = JSON.stringify(phiMap, null, 2);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    algorithm: 'aes-256-gcm',
  };
}

function computeCommitment(facts: ClinicalFacts, key: Buffer): string {
  // SHA-256(JSON(facts) || key) — Phase 4 replaces with Poseidon hash in ZK circuit
  return crypto.createHash('sha256').update(JSON.stringify(facts)).update(key).digest('hex');
}

function saveOutputs(dir: string, result: DeidentifyResult): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'anonymized.txt'), result.anonymizedText, 'utf-8');
  fs.writeFileSync(path.join(dir, 'facts.json'), JSON.stringify(result.facts, null, 2), 'utf-8');
  fs.writeFileSync(path.join(dir, 'phi_map.enc'), JSON.stringify(result.encryptedPhiMap, null, 2), 'utf-8');
  fs.writeFileSync(path.join(dir, 'patient_key.b64'), result.patientKey, 'utf-8');
  fs.writeFileSync(
    path.join(dir, 'commitment.json'),
    JSON.stringify({ commitment: result.commitment, algorithm: 'sha256-stub' }, null, 2),
    'utf-8'
  );
}

export async function deidentify(inputPath: string): Promise<DeidentifyResult> {
  const config = loadConfig();
  const corti = new CortiClientWrapper();

  console.log(`\n[deidentifier] Reading: ${inputPath}`);
  const doc = await readDocument(inputPath);
  console.log(`[deidentifier] ${doc.charCount} chars, ${doc.chunkCount} chunk(s)\n`);

  const mergedPhiMap: PhiMap = {};
  const anonymizedChunks: string[] = [];

  for (const chunk of doc.chunks) {
    console.log(`[deidentifier] De-identifying chunk ${chunk.index + 1}/${doc.chunkCount}...`);

    const { anonymizedText: clean, phiMap: fullMap } = detectAndReplace(chunk.text);

    Object.assign(mergedPhiMap, fullMap);
    anonymizedChunks.push(clean);
    console.log(`  PHI tokens: ${Object.keys(fullMap).length} | Method: rule-based (regex + NER)`);
  }

  const anonymizedText = anonymizedChunks.join('\n\n---\n\n');

  console.log(`\n[deidentifier] Extracting clinical facts...`);
  const factsMsg = await corti.sendMessage(FACTS_PROMPT(anonymizedText));
  const facts = parseJsonBlock(factsMsg.text) as ClinicalFacts;
  const dxNames = facts.diagnoses?.map((d) => (typeof d === 'string' ? d : (d as { name?: string }).name ?? JSON.stringify(d))) ?? [];
  console.log(`  Diagnoses   : ${dxNames.join(', ') || 'none'}`);
  const medNames = facts.medications?.map((m) => (typeof m === 'string' ? m : (m as { name?: string }).name ?? JSON.stringify(m))) ?? [];
  console.log(`  Medications : ${medNames.join(', ') || 'none'}`);
  console.log(`  Age         : ${facts.ageYears ?? 'unknown'} (range: ${facts.ageRange ?? 'unknown'})`);
  console.log(`  Credits     : ${factsMsg.credits}`);

  const patientKey = crypto.randomBytes(32);
  const encryptedPhiMap = encryptPhiMap(mergedPhiMap, patientKey);
  const commitment = computeCommitment(facts, patientKey);

  const runId = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outputDir = path.resolve(process.cwd(), config.output.directory, runId);

  const result: DeidentifyResult = {
    runId,
    outputDir,
    anonymizedText,
    phiMap: mergedPhiMap,
    facts,
    patientKey: patientKey.toString('base64'),
    encryptedPhiMap,
    commitment,
    chunkCount: doc.chunkCount,
    totalPhiTokens: Object.keys(mergedPhiMap).length,
  };

  saveOutputs(outputDir, result);

  console.log(`\n[deidentifier] Outputs saved to: ${outputDir}`);
  console.log(`  anonymized.txt   — PHI-free document`);
  console.log(`  facts.json       — structured clinical facts`);
  console.log(`  phi_map.enc      — AES-256-GCM encrypted PHI map (patient-only)`);
  console.log(`  patient_key.b64  — patient secret [STUB — never store server-side in prod]`);
  console.log(`  commitment.json  — SHA-256 commitment (Phase 4 replaces with Poseidon)`);

  return result;
}

// Smoke test
if (require.main === module) {
  const args = process.argv.slice(2);
  const inputIdx = args.indexOf('--input');
  const inputFile = inputIdx !== -1 ? args[inputIdx + 1] : 'samples/patient_sample.txt';

  (async () => {
    console.log('=== Phase 3 De-identification Smoke Test ===\n');
    console.log(`Input: ${inputFile}\n`);

    const result = await deidentify(inputFile);

    console.log('\n==========================================');
    console.log('ANONYMIZED TEXT:');
    console.log('==========================================');
    console.log(result.anonymizedText);

    console.log('\n==========================================');
    console.log('PHI MAP (decrypted — for verification only):');
    console.log('==========================================');
    console.log(JSON.stringify(result.phiMap, null, 2));

    console.log('\n==========================================');
    console.log('CLINICAL FACTS:');
    console.log('==========================================');
    console.log(JSON.stringify(result.facts, null, 2));

    console.log('\n==========================================');
    console.log('SUMMARY:');
    console.log('==========================================');
    console.log(`  Run ID         : ${result.runId}`);
    console.log(`  Output Dir     : ${result.outputDir}`);
    console.log(`  PHI tokens     : ${result.totalPhiTokens}`);
    console.log(`  Commitment     : ${result.commitment.slice(0, 32)}...`);
    console.log(`  Patient key    : ${result.patientKey.slice(0, 20)}... (base64)`);

    // Verify no raw PHI leaked into anonymized text
    const phiValues = Object.values(result.phiMap);
    const leaks = phiValues.filter((v) => result.anonymizedText.includes(v));
    if (leaks.length > 0) {
      console.error(`\n[FAIL] PHI LEAK DETECTED: ${leaks.join(', ')}`);
      process.exit(1);
    }
    console.log(`\n  PHI leak check : PASSED (0 leaks)`);
    console.log('\n=== Smoke test PASSED ===');
  })().catch((err) => {
    console.error('\nSmoke test FAILED:', (err as Error).message);
    process.exit(1);
  });
}
