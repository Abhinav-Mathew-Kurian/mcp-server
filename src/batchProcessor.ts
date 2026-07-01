import * as fs from 'fs';
import * as path from 'path';
import pLimit from 'p-limit';
import { deidentify, DeidentifyResult } from './deidentifier';
import { generateProof, ZkResult } from './zkRunner';
import { parseFileToText } from './fileParser';
import { loadConfig } from './config';

export interface BatchNote {
  id: string;
  text?: string;
  filePath?: string;
}

export interface BatchNoteResult {
  id: string;
  status: 'success' | 'failed';
  error?: string;
  runId?: string;
  outputDir?: string;
  anonymizedText?: string;
  facts?: DeidentifyResult['facts'];
  zkSummary?: ZkResult['summary'];
  totalPhiTokens?: number;
  durationMs?: number;
}

export interface BatchResult {
  batchId: string;
  batchDir: string;
  startedAt: string;
  completedAt: string;
  totalNotes: number;
  succeeded: number;
  failed: number;
  durationMs: number;
  icdDistribution: Record<string, number>;
  totalPhiTokens: number;
  results: BatchNoteResult[];
}

export async function runBatch(
  notes: BatchNote[],
  options: { concurrency?: number; skipZk?: boolean } = {}
): Promise<BatchResult> {
  const config = loadConfig();
  const concurrency = options.concurrency ?? 3;
  const skipZk = options.skipZk ?? false;

  const batchId = `batch_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
  const batchDir = path.resolve(process.cwd(), config.output.directory, batchId);
  fs.mkdirSync(batchDir, { recursive: true });

  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  console.log(`\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║         Corti Batch Pipeline — ${notes.length} notes`.padEnd(55) + `║`);
  console.log(`╚══════════════════════════════════════════════════════╝`);
  console.log(`  Batch ID    : ${batchId}`);
  console.log(`  Concurrency : ${concurrency} notes at a time`);
  console.log(`  ZK proofs   : ${skipZk ? 'skipped' : 'enabled'}\n`);

  const limit = pLimit(concurrency);
  let completed = 0;

  const results = await Promise.all(
    notes.map(note =>
      limit(async (): Promise<BatchNoteResult> => {
        const noteStart = Date.now();
        console.log(`[${note.id}] Starting...`);

        try {
          // Resolve text — either provided directly or parsed from file
          let text = note.text;
          if (!text && note.filePath) {
            console.log(`[${note.id}] Parsing file: ${note.filePath}`);
            text = await parseFileToText(note.filePath);
          }
          if (!text) throw new Error('No text or filePath provided for note');

          // Write temp input file for deidentifier
          const tempInput = path.join(batchDir, `${note.id}_input.txt`);
          fs.writeFileSync(tempInput, text, 'utf-8');

          // Run de-identification pipeline
          const deidResult = await deidentify(tempInput);

          // Move outputs into batch subdirectory
          const noteDir = path.join(batchDir, note.id);
          fs.mkdirSync(noteDir, { recursive: true });
          for (const file of fs.readdirSync(deidResult.outputDir)) {
            fs.renameSync(
              path.join(deidResult.outputDir, file),
              path.join(noteDir, file)
            );
          }
          fs.rmdirSync(deidResult.outputDir);

          // Clean up temp input
          fs.unlinkSync(tempInput);

          // Run ZK proof
          let zkSummary: ZkResult['summary'] | undefined;
          if (!skipZk) {
            const zkResult = await generateProof(noteDir);
            zkSummary = zkResult.summary;
          }

          completed++;
          const durationMs = Date.now() - noteStart;
          console.log(`[${note.id}] ✓ Done (${(durationMs / 1000).toFixed(1)}s) — ${completed}/${notes.length} complete`);

          return {
            id: note.id,
            status: 'success',
            runId: deidResult.runId,
            outputDir: noteDir,
            anonymizedText: deidResult.anonymizedText,
            facts: deidResult.facts,
            zkSummary,
            totalPhiTokens: deidResult.totalPhiTokens,
            durationMs,
          };

        } catch (err) {
          completed++;
          const durationMs = Date.now() - noteStart;
          const message = (err as Error).message;
          console.error(`[${note.id}] ✗ Failed: ${message}`);

          return {
            id: note.id,
            status: 'failed',
            error: message,
            durationMs,
          };
        }
      })
    )
  );

  const completedAt = new Date().toISOString();
  const durationMs = Date.now() - startMs;

  const succeeded = results.filter(r => r.status === 'success').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const totalPhiTokens = results.reduce((sum, r) => sum + (r.totalPhiTokens ?? 0), 0);

  // ICD chapter distribution
  const icdDistribution: Record<string, number> = {};
  for (const r of results) {
    if (r.zkSummary) {
      const label = `Ch ${r.zkSummary.icdChapter} — ${r.zkSummary.icdChapterName}`;
      icdDistribution[label] = (icdDistribution[label] ?? 0) + 1;
    }
  }

  const batchResult: BatchResult = {
    batchId,
    batchDir,
    startedAt,
    completedAt,
    totalNotes: notes.length,
    succeeded,
    failed,
    durationMs,
    icdDistribution,
    totalPhiTokens,
    results,
  };

  // Save batch summary
  fs.writeFileSync(
    path.join(batchDir, 'batch_summary.json'),
    JSON.stringify(batchResult, null, 2),
    'utf-8'
  );

  // Human-readable report
  const report = buildReport(batchResult);
  fs.writeFileSync(path.join(batchDir, 'batch_report.txt'), report, 'utf-8');

  console.log('\n' + report);

  return batchResult;
}

function buildReport(b: BatchResult): string {
  const lines: string[] = [];
  lines.push('╔══════════════════════════════════════════════════════╗');
  lines.push('║                 BATCH PIPELINE REPORT                ║');
  lines.push('╚══════════════════════════════════════════════════════╝');
  lines.push('');
  lines.push(`  Batch ID        : ${b.batchId}`);
  lines.push(`  Started         : ${b.startedAt}`);
  lines.push(`  Completed       : ${b.completedAt}`);
  lines.push(`  Total runtime   : ${(b.durationMs / 1000).toFixed(1)}s`);
  lines.push('');
  lines.push(`  Notes processed : ${b.totalNotes}`);
  lines.push(`  Succeeded       : ${b.succeeded}`);
  lines.push(`  Failed          : ${b.failed}`);
  lines.push(`  PHI tokens      : ${b.totalPhiTokens} total removed`);
  lines.push(`  ZK proofs       : ${b.results.filter(r => r.zkSummary?.verified).length} verified`);
  lines.push('');

  if (Object.keys(b.icdDistribution).length > 0) {
    lines.push('  ICD Chapter Distribution:');
    for (const [label, count] of Object.entries(b.icdDistribution)) {
      lines.push(`    ${label.padEnd(40)}: ${count} note${count > 1 ? 's' : ''}`);
    }
    lines.push('');
  }

  lines.push('  Results:');
  for (const r of b.results) {
    if (r.status === 'success') {
      const icd = r.zkSummary ? `Ch${r.zkSummary.icdChapter}` : 'no ZK';
      lines.push(`    ✓ ${r.id.padEnd(20)} ${icd.padEnd(6)} ${r.totalPhiTokens} PHI tokens  ${(r.durationMs! / 1000).toFixed(1)}s`);
    } else {
      lines.push(`    ✗ ${r.id.padEnd(20)} FAILED: ${r.error}`);
    }
  }

  lines.push('');
  lines.push(`  Output dir : ${b.batchDir}`);
  lines.push('');

  return lines.join('\n');
}
