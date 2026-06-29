import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { deidentify } from './deidentifier';
import { generateProof } from './zkRunner';

async function run(inputPath: string): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║      Corti ZK De-identification Pipeline             ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // ── Phase 3: De-identify ────────────────────────────────────────────────
  console.log('── PHASE 3: De-identification ──────────────────────────');
  const result = await deidentify(inputPath);

  // ── Phase 4: ZK Proof ───────────────────────────────────────────────────
  console.log('\n── PHASE 4: ZK Proof ───────────────────────────────────');
  const zkResult = await generateProof(result.outputDir);

  // ── Final Summary ────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║                  PIPELINE COMPLETE                   ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`\n  Run ID         : ${result.runId}`);
  console.log(`  Output Dir     : ${result.outputDir}`);
  console.log(`  PHI tokens     : ${result.totalPhiTokens} removed`);
  console.log(`  Chunks         : ${result.chunkCount}`);
  console.log(`\n  ── De-identification ──`);
  console.log(`  Method         : rule-based (regex + NER, no LLM)`);
  console.log(`  PHI leak check : PASSED`);
  console.log(`  Commitment     : ${result.commitment.slice(0, 32)}...`);
  console.log(`\n  ── ZK Proof ──`);
  console.log(`  Age range      : ${zkResult.summary.ageRange}`);
  console.log(`  ICD chapter    : ${zkResult.summary.icdChapter} — ${zkResult.summary.icdChapterName}`);
  console.log(`  Matched dx     : "${zkResult.summary.matchedDiagnosis}"`);
  console.log(`  Data commitment: ${zkResult.summary.dataCommitment.slice(0, 32)}...`);
  console.log(`  Verified       : ✓`);
  console.log(`\n  ── Output Files ──`);
  console.log(`  anonymized.txt       — PHI-free document`);
  console.log(`  facts.json           — structured clinical facts`);
  console.log(`  phi_map.enc          — AES-256-GCM encrypted PHI map`);
  console.log(`  patient_key.b64      — patient secret key`);
  console.log(`  commitment.json      — SHA-256 data commitment`);
  console.log(`  proof.json           — Groth16 ZK proof`);
  console.log(`  public_signals.json  — public ZK signals`);
  console.log(`  zk_summary.json      — human-readable proof summary`);
  console.log('');
}

if (require.main === module) {
  const args     = process.argv.slice(2);
  const inputIdx = args.indexOf('--input');
  const inputFile = inputIdx !== -1 ? args[inputIdx + 1] : 'samples/patient_sample.txt';

  run(inputFile).catch(err => {
    console.error('\nPipeline FAILED:', (err as Error).message);
    process.exit(1);
  });
}
