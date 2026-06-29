import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

import type { PhiMap, ClinicalFacts, EncryptedPhiMap } from './deidentifier';

export interface ReidentifyResult {
  restoredText: string;
  phiMap: PhiMap;
  commitmentValid: boolean;
}

function decryptPhiMap(enc: EncryptedPhiMap, key: Buffer): PhiMap {
  const iv = Buffer.from(enc.iv, 'base64');
  const tag = Buffer.from(enc.tag, 'base64');
  const ciphertext = Buffer.from(enc.ciphertext, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString('utf-8')) as PhiMap;
}

function verifyCommitment(facts: ClinicalFacts, key: Buffer, storedCommitment: string): boolean {
  const computed = crypto.createHash('sha256').update(JSON.stringify(facts)).update(key).digest('hex');
  return computed === storedCommitment;
}

function restoreText(anonymizedText: string, phiMap: PhiMap): string {
  let restored = anonymizedText;
  for (const [codename, original] of Object.entries(phiMap)) {
    // Escape special regex chars in the codename
    const escaped = codename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    restored = restored.replace(new RegExp(escaped, 'g'), original);
  }
  return restored;
}

export async function reidentify(outputDir: string, patientKeyB64: string): Promise<ReidentifyResult> {
  const resolved = path.resolve(process.cwd(), outputDir);

  const anonymizedText = fs.readFileSync(path.join(resolved, 'anonymized.txt'), 'utf-8');
  const encryptedPhiMap = JSON.parse(fs.readFileSync(path.join(resolved, 'phi_map.enc'), 'utf-8')) as EncryptedPhiMap;
  const facts = JSON.parse(fs.readFileSync(path.join(resolved, 'facts.json'), 'utf-8')) as ClinicalFacts;
  const { commitment: storedCommitment } = JSON.parse(
    fs.readFileSync(path.join(resolved, 'commitment.json'), 'utf-8')
  ) as { commitment: string };

  const key = Buffer.from(patientKeyB64, 'base64');

  console.log('\n[reidentify] Decrypting PHI map...');
  let phiMap: PhiMap;
  try {
    phiMap = decryptPhiMap(encryptedPhiMap, key);
  } catch {
    throw new Error('Decryption failed — wrong patient key or tampered data');
  }
  console.log(`[reidentify] Decrypted ${Object.keys(phiMap).length} PHI tokens`);

  console.log('[reidentify] Verifying commitment...');
  const commitmentValid = verifyCommitment(facts, key, storedCommitment);
  console.log(`[reidentify] Commitment: ${commitmentValid ? 'VALID ✓' : 'INVALID ✗'}`);

  const restoredText = restoreText(anonymizedText, phiMap);
  return { restoredText, phiMap, commitmentValid };
}

// Smoke test
if (require.main === module) {
  const args = process.argv.slice(2);
  const dirIdx = args.indexOf('--output-dir');
  const keyIdx = args.indexOf('--key');

  if (dirIdx === -1 || keyIdx === -1) {
    console.error('Usage: npx ts-node src/reidentify.ts --output-dir ./output/<runId> --key <base64-key>');
    console.error('\nOr read the key from the output dir:');
    console.error('  KEY=$(cat ./output/<runId>/patient_key.b64)');
    console.error('  npx ts-node src/reidentify.ts --output-dir ./output/<runId> --key $KEY');
    process.exit(1);
  }

  const outputDir = args[dirIdx + 1];
  const patientKey = args[keyIdx + 1];

  (async () => {
    console.log('=== Phase 3 Re-identification Smoke Test ===\n');
    console.log(`Output dir : ${outputDir}`);
    console.log(`Key        : ${patientKey.slice(0, 20)}...\n`);

    const result = await reidentify(outputDir, patientKey);

    console.log('\n==========================================');
    console.log('RESTORED TEXT:');
    console.log('==========================================');
    console.log(result.restoredText);

    console.log('\n==========================================');
    console.log('RESULT:');
    console.log('==========================================');
    console.log(`  Commitment valid : ${result.commitmentValid ? 'YES ✓' : 'NO ✗'}`);
    console.log(`  PHI tokens restored : ${Object.keys(result.phiMap).length}`);

    if (!result.commitmentValid) {
      console.error('\n[WARN] Commitment mismatch — data may have been tampered with');
    }

    console.log('\n=== Re-identification PASSED ===');
  })().catch((err) => {
    console.error('\nFAILED:', (err as Error).message);
    process.exit(1);
  });
}
