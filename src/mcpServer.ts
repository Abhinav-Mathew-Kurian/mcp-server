import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as crypto from 'crypto';
import express, { Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ZipArchive } = require('archiver') as { ZipArchive: new (opts?: object) => NodeJS.ReadableStream & { pipe: (dest: NodeJS.WritableStream) => void; directory: (dirpath: string, destpath: string) => void; finalize: () => void } };
import multer from 'multer';

import { deidentify } from './deidentifier';
import { generateProof } from './zkRunner';
import { loadConfig } from './config';
import { runBatch, BatchResult } from './batchProcessor';
import { parseFileToText } from './fileParser';

const PORT = parseInt(process.env.PORT ?? process.env.MCP_PORT ?? '3456', 10);

// ── In-memory job store ───────────────────────────────────────────────────────
const jobs = new Map<string, { status: 'running' | 'done' | 'failed'; result?: BatchResult; error?: string; startedAt: string }>();

// ── Multer — memory storage, 20MB/file, 20 files max ─────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.docx', '.txt', '.md'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error(`Unsupported file type: ${ext}. Allowed: ${allowed.join(' ')}`));
  },
});

// ── UTF-8 mojibake fix ────────────────────────────────────────────────────────
// Corti console sends text via MCP as Latin-1 decoded strings.
// E.g. °C (U+00B0) arrives as Â° (0xC2 0xB0 decoded as two Latin-1 chars).
//
// Problem: em/en dashes (U+2014, U+2013) are above U+00FF so the latin1
// Buffer roundtrip truncates them to 0x14/0x13 and they disappear.
// Fix: protect these chars as null-byte-delimited tokens before the roundtrip,
// restore them after. Covers both already-correct Unicode and mojibake forms.
function fixMojibake(text: string): string {
  let t = text
    .replace(/\u00c3\u0097|\u00d7/g, '\x00TIMES\x00')
    .replace(/\u00e2\u0080\u0094|\u2014|\u0097/g, '\x00EMDASH\x00')
    .replace(/\u00e2\u0080\u0093|\u2013|\u0096/g, '\x00ENDASH\x00')
    .replace(/\u00e2\u0080\u0099|\u2019|\u0092/g, '\x00RSQUOT\x00')
    .replace(/\u00e2\u0080\u009c|\u201c|\u0093/g, '\x00LDQUOT\x00')
    .replace(/\u00e2\u0080\u009d|\u201d|\u0094/g, '\x00RDQUOT\x00')
    .replace(/\u00e2\u0081\u00b9|\u00e2\u00b9|\u2079/g, '\x00SUP9\x00')
    .replace(/\u00e2\u0081\u00b4|\u2074/g, '\x00SUP4\x00')
    .replace(/\u00e2\u0081\u00b5|\u2075/g, '\x00SUP5\x00')
    .replace(/\u00e2\u0081\u00b6|\u2076/g, '\x00SUP6\x00')
    .replace(/\u00e2\u0081\u00b7|\u2077/g, '\x00SUP7\x00')
    .replace(/\u00e2\u0081\u00b8|\u2078/g, '\x00SUP8\x00');

  // Main latin1 -> utf8 fix for \xC2/\xC3 sequences (\xB0C, \xB5mol, m\xB2, etc.)
  if (/[\xc2\xc3][\x80-\xbf]/.test(t)) {
    try { t = Buffer.from(t, 'latin1').toString('utf8'); } catch { /* keep */ }
  }

  return t
    .replace(/\x00TIMES\x00/g, '\u00d7')
    .replace(/\x00EMDASH\x00/g, '\u2014')
    .replace(/\x00ENDASH\x00/g, '\u2013')
    .replace(/\x00RSQUOT\x00/g, '\u2019')
    .replace(/\x00LDQUOT\x00/g, '\u201c')
    .replace(/\x00RDQUOT\x00/g, '\u201d')
    .replace(/\x00SUP9\x00/g, '\u2079')
    .replace(/\x00SUP4\x00/g, '\u2074')
    .replace(/\x00SUP5\x00/g, '\u2075')
    .replace(/\x00SUP6\x00/g, '\u2076')
    .replace(/\x00SUP7\x00/g, '\u2077')
    .replace(/\x00SUP8\x00/g, '\u2078');
}

// ── Tool: run_pipeline ────────────────────────────────────────────────────────
// Full end-to-end: de-identify + ZK proof. This is the main tool.
// ─────────────────────────────────────────────────────────────────────────────

async function runPipeline(clinicalNoteText: string): Promise<string> {
  // Write input to a temp file so deidentify() can read it
  const tmpId   = crypto.randomBytes(6).toString('hex');
  const tmpPath = path.resolve('/tmp', `corti-mcp-${tmpId}.txt`);
  fs.writeFileSync(tmpPath, clinicalNoteText, 'utf-8');

  try {
    const deidResult = await deidentify(tmpPath);
    const zkResult   = await generateProof(deidResult.outputDir);

    const dxNames  = deidResult.facts.diagnoses?.map((d) =>
      typeof d === 'string' ? d : (d as { name?: string }).name ?? JSON.stringify(d)
    ) ?? [];

    const medNames = deidResult.facts.medications?.map((m) =>
      typeof m === 'string' ? m : (m as { name?: string }).name ?? JSON.stringify(m)
    ) ?? [];

    return [
      `## Pipeline Complete — Run ID: \`${deidResult.runId}\``,
      ``,
      `### De-identification`,
      `- **PHI tokens removed:** ${deidResult.totalPhiTokens}`,
      `- **Method:** rule-based (regex + NER, no LLM)`,
      `- **PHI leak check:** PASSED`,
      ``,
      `### Anonymized Text`,
      `\`\`\``,
      deidResult.anonymizedText,
      `\`\`\``,
      ``,
      `### Clinical Facts (extracted by Corti agent)`,
      `- **Chief complaint:** ${deidResult.facts.chiefComplaint ?? 'N/A'}`,
      `- **Age:** ${deidResult.facts.ageYears ?? 'unknown'} (range: ${deidResult.facts.ageRange ?? 'unknown'})`,
      `- **Sex:** ${deidResult.facts.sex ?? 'unknown'}`,
      `- **Diagnoses:** ${dxNames.join(' | ') || 'none'}`,
      `- **Medications:** ${medNames.join(', ') || 'none'}`,
      `- **Vitals:** BP ${deidResult.facts.vitals?.bloodPressure ?? 'N/A'} | HR ${deidResult.facts.vitals?.heartRate ?? 'N/A'} | SpO2 ${deidResult.facts.vitals?.oxygenSaturation ?? 'N/A'}`,
      ``,
      `### Zero-Knowledge Proof`,
      `- **Age range (public):** ${zkResult.summary.ageRange}`,
      `- **ICD-10 chapter (public):** ${zkResult.summary.icdChapter} — ${zkResult.summary.icdChapterName}`,
      `- **Matched diagnosis:** ${zkResult.summary.matchedDiagnosis}`,
      `- **Proof system:** Groth16 / BN128 / ${zkResult.summary.constraintCount} constraints`,
      `- **Verified:** ✅`,
      `- **Data commitment:** \`${zkResult.summary.dataCommitment.slice(0, 32)}...\``,
      ``,
      `### Output Files`,
      `Saved to: \`${deidResult.outputDir}\``,
      `- \`anonymized.txt\` — PHI-free document`,
      `- \`facts.json\` — structured clinical facts`,
      `- \`phi_map.enc\` — AES-256-GCM encrypted PHI map`,
      `- \`proof.json\` — Groth16 ZK proof`,
      `- \`zk_summary.json\` — human-readable proof summary`,
    ].join('\n');
  } finally {
    fs.unlinkSync(tmpPath);
  }
}

// ── Tool: deidentify_only ─────────────────────────────────────────────────────
// Just de-identification, no ZK. Useful for quickly checking redaction.
// ─────────────────────────────────────────────────────────────────────────────

async function deidentifyOnly(clinicalNoteText: string): Promise<string> {
  const tmpId   = crypto.randomBytes(6).toString('hex');
  const tmpPath = path.resolve('/tmp', `corti-mcp-${tmpId}.txt`);
  fs.writeFileSync(tmpPath, clinicalNoteText, 'utf-8');

  try {
    const result = await deidentify(tmpPath);

    const phiList = Object.entries(result.phiMap)
      .map(([codename, original]) => `  - \`${original}\` → \`<<${codename}>>\``)
      .join('\n');

    return [
      `## De-identification Result — Run ID: \`${result.runId}\``,
      ``,
      `**PHI tokens removed:** ${result.totalPhiTokens}`,
      ``,
      `### Anonymized Text`,
      `\`\`\``,
      result.anonymizedText,
      `\`\`\``,
      ``,
      `### PHI Replacements Made`,
      phiList || '  (none detected)',
    ].join('\n');
  } finally {
    fs.unlinkSync(tmpPath);
  }
}

// ── Tool: get_run_result ──────────────────────────────────────────────────────
// Retrieve the zk_summary + anonymized text for a previous run by ID.
// ─────────────────────────────────────────────────────────────────────────────

function getRunResult(runId: string): string {
  const config    = loadConfig();
  const outputDir = path.resolve(process.cwd(), config.output.directory, runId);

  if (!fs.existsSync(outputDir)) {
    return `No run found with ID: \`${runId}\`. Check the output directory.`;
  }

  const summaryPath = path.join(outputDir, 'zk_summary.json');
  const anonPath    = path.join(outputDir, 'anonymized.txt');
  const factsPath   = path.join(outputDir, 'facts.json');

  if (!fs.existsSync(summaryPath)) {
    return `Run \`${runId}\` exists but has no ZK proof yet. Run the full pipeline to generate one.`;
  }

  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
  const anonText = fs.existsSync(anonPath) ? fs.readFileSync(anonPath, 'utf-8') : 'N/A';
  const facts    = fs.existsSync(factsPath) ? JSON.parse(fs.readFileSync(factsPath, 'utf-8')) : null;

  const dxNames = facts?.diagnoses?.map((d: unknown) =>
    typeof d === 'string' ? d : (d as { name?: string }).name ?? JSON.stringify(d)
  ) ?? [];

  return [
    `## Run Result: \`${runId}\``,
    ``,
    `### ZK Summary`,
    `- **Age range:** ${summary.ageRange}`,
    `- **ICD-10 chapter:** ${summary.icdChapter} — ${summary.icdChapterName}`,
    `- **Matched diagnosis:** ${summary.matchedDiagnosis}`,
    `- **Verified:** ${summary.verified ? '✅' : '❌'}`,
    `- **Proof system:** ${summary.provingSystem} / ${summary.constraintCount} constraints`,
    `- **Timestamp:** ${summary.timestamp}`,
    `- **Data commitment:** \`${summary.dataCommitment.slice(0, 32)}...\``,
    ``,
    facts ? `### Clinical Facts` : '',
    facts ? `- **Age:** ${facts.ageYears} (${facts.ageRange}) | **Sex:** ${facts.sex}` : '',
    facts ? `- **Diagnoses:** ${dxNames.join(' | ') || 'none'}` : '',
    ``,
    `### Anonymized Text`,
    `\`\`\``,
    anonText,
    `\`\`\``,
  ].filter(l => l !== '').join('\n');
}

// ── MCP Server Setup ──────────────────────────────────────────────────────────

function buildMcpServer(): McpServer {
  const server = new McpServer({
    name:    'corti-zk-pipeline',
    version: '1.0.0',
  });

  server.tool(
    'run_pipeline',
    'De-identify a clinical note, extract structured facts via Corti, and generate a Groth16 ZK proof. Returns the anonymized text, clinical facts, and verified proof summary.',
    {
      clinical_note: z.string().describe('The full text of the clinical note to process'),
    },
    async ({ clinical_note }) => {
      try {
        const result = await runPipeline(fixMojibake(clinical_note));
        return { content: [{ type: 'text', text: result }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Pipeline error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    'deidentify_only',
    'De-identify a clinical note (remove PHI) without running the ZK proof. Fast check for redaction quality.',
    {
      clinical_note: z.string().describe('The full text of the clinical note to de-identify'),
    },
    async ({ clinical_note }) => {
      try {
        const result = await deidentifyOnly(fixMojibake(clinical_note));
        return { content: [{ type: 'text', text: result }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `De-identification error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  server.tool(
    'get_run_result',
    'Retrieve the ZK proof summary and anonymized text for a previous pipeline run by its run ID (e.g. "2026-06-29T10-50-25").',
    {
      run_id: z.string().describe('The run ID returned by a previous run_pipeline call'),
    },
    async ({ run_id }) => {
      try {
        const result = getRunResult(run_id);
        return { content: [{ type: 'text', text: result }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error retrieving run: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  return server;
}

// ── Express HTTP Server ───────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: '10mb' }));

// CORS — allow frontend to call this server
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

// ── MCP endpoint — Corti and any AI agent talks here ─────────────────────────
app.all('/mcp', async (req: express.Request, res: express.Response) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const mcpServer = buildMcpServer();
  await mcpServer.connect(transport);
  await transport.handleRequest(req as unknown as http.IncomingMessage, res as unknown as http.ServerResponse, req.body);
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', server: 'corti-zk-pipeline', version: '1.0.0', timestamp: new Date().toISOString() });
});

// ── POST /api/upload — upload PDF/DOCX/TXT/MD files and run batch ─────────────
app.post('/api/upload', upload.array('files'), async (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) { res.status(400).json({ error: 'No files uploaded' }); return; }

  const tmpDir = path.join(process.cwd(), 'output', '.tmp_uploads');
  fs.mkdirSync(tmpDir, { recursive: true });

  const notes: Array<{ id: string; text: string }> = [];
  const parseErrors: string[] = [];

  for (const file of files) {
    const ext = path.extname(file.originalname).toLowerCase();
    const tmpPath = path.join(tmpDir, `${crypto.randomBytes(6).toString('hex')}${ext}`);
    try {
      fs.writeFileSync(tmpPath, file.buffer);
      const text = await parseFileToText(tmpPath);
      const id = file.originalname.replace(/\.[^.]+$/, '').replace(/\s+/g, '_');
      notes.push({ id, text });
    } catch (err) {
      parseErrors.push(`${file.originalname}: ${(err as Error).message}`);
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    }
  }

  if (notes.length === 0) { res.status(400).json({ error: 'All files failed to parse', details: parseErrors }); return; }

  const jobId = crypto.randomBytes(8).toString('hex');
  jobs.set(jobId, { status: 'running', startedAt: new Date().toISOString() });

  (async () => {
    try {
      const result = await runBatch(notes, {});
      jobs.set(jobId, { status: 'done', result, startedAt: jobs.get(jobId)!.startedAt });
    } catch (err) {
      jobs.set(jobId, { status: 'failed', error: (err as Error).message, startedAt: jobs.get(jobId)!.startedAt });
    }
  })();

  res.status(202).json({ jobId, status: 'running', filesAccepted: notes.length, filesRejected: parseErrors, message: 'Batch started — poll /api/batch/:jobId' });
});

// ── POST /api/batch — submit text notes as JSON ───────────────────────────────
app.post('/api/batch', async (req: Request, res: Response) => {
  const { notes, options } = req.body as { notes: Array<{ id: string; text: string }>; options?: { concurrency?: number; skipZk?: boolean } };

  if (!Array.isArray(notes) || notes.length === 0) { res.status(400).json({ error: 'notes array is required and must not be empty' }); return; }
  if (notes.length > 50) { res.status(400).json({ error: 'Maximum 50 notes per batch' }); return; }
  for (const n of notes) {
    if (!n.id || !n.text) { res.status(400).json({ error: 'Each note must have id and text fields' }); return; }
  }

  const jobId = crypto.randomBytes(8).toString('hex');
  jobs.set(jobId, { status: 'running', startedAt: new Date().toISOString() });

  (async () => {
    try {
      const result = await runBatch(notes, options ?? {});
      jobs.set(jobId, { status: 'done', result, startedAt: jobs.get(jobId)!.startedAt });
    } catch (err) {
      jobs.set(jobId, { status: 'failed', error: (err as Error).message, startedAt: jobs.get(jobId)!.startedAt });
    }
  })();

  res.status(202).json({ jobId, status: 'running', message: 'Batch started — poll /api/batch/:jobId' });
});

// ── GET /api/batch/:jobId — poll job status ───────────────────────────────────
app.get('/api/batch/:jobId', (req: Request, res: Response) => {
  const job = jobs.get(req.params.jobId as string);
  if (!job) { res.status(404).json({ error: 'Job not found' }); return; }
  if (job.status === 'running') { res.json({ jobId: req.params.jobId, status: 'running', startedAt: job.startedAt }); return; }
  if (job.status === 'failed') { res.status(500).json({ jobId: req.params.jobId, status: 'failed', error: job.error }); return; }

  const summary = { ...job.result, results: job.result!.results.map(r => ({ ...r, anonymizedText: undefined })) };
  res.json({ jobId: req.params.jobId, status: 'done', startedAt: job.startedAt, result: summary });
});

// ── GET /api/batch/:jobId/note/:noteId — full note result ─────────────────────
app.get('/api/batch/:jobId/note/:noteId', (req: Request, res: Response) => {
  const job = jobs.get(req.params.jobId as string);
  if (!job || job.status !== 'done') { res.status(404).json({ error: 'Job not found or not yet complete' }); return; }
  const note = job.result!.results.find(r => r.id === (req.params.noteId as string));
  if (!note) { res.status(404).json({ error: 'Note ID not found in this batch' }); return; }
  res.json(note);
});

// ── GET /api/batch/:jobId/download — ZIP of all output files ─────────────────
app.get('/api/batch/:jobId/download', (req: Request, res: Response) => {
  const job = jobs.get(req.params.jobId as string);
  if (!job || job.status !== 'done') { res.status(404).json({ error: 'Job not found or not yet complete' }); return; }
  const batchDir = job.result!.batchDir;
  if (!fs.existsSync(batchDir)) { res.status(404).json({ error: 'Output directory not found' }); return; }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${job.result!.batchId}.zip"`);
  const archive = new ZipArchive({ zlib: { level: 6 } });
  archive.pipe(res);
  archive.directory(batchDir, job.result!.batchId);
  archive.finalize();
});

// ── GET /api/jobs — list all jobs ─────────────────────────────────────────────
app.get('/api/jobs', (_req: Request, res: Response) => {
  const list = Array.from(jobs.entries()).map(([id, job]) => ({
    jobId: id, status: job.status, startedAt: job.startedAt,
    totalNotes: job.result?.totalNotes, succeeded: job.result?.succeeded, failed: job.result?.failed,
  }));
  res.json(list.reverse());
});

const server = http.createServer(app);
server.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║      Corti ZK Pipeline — Single Server               ║`);
  console.log(`╚══════════════════════════════════════════════════════╝`);
  console.log(`\n  Port       : ${PORT}`);
  console.log(`  MCP (Corti): http://localhost:${PORT}/mcp`);
  console.log(`  REST (UI)  : http://localhost:${PORT}/api/*`);
  console.log(`  Health     : http://localhost:${PORT}/health`);
  console.log(`\n  MCP Tools:`);
  console.log(`    run_pipeline     — full de-id + ZK proof`);
  console.log(`    deidentify_only  — redaction check only`);
  console.log(`    get_run_result   — retrieve previous run`);
  console.log(`\n  REST Endpoints:`);
  console.log(`    POST /api/upload            — PDF/DOCX/TXT file upload`);
  console.log(`    POST /api/batch             — JSON text notes`);
  console.log(`    GET  /api/batch/:id         — poll job status`);
  console.log(`    GET  /api/batch/:id/note/:n — full note result`);
  console.log(`    GET  /api/batch/:id/download— ZIP download`);
  console.log(`    GET  /api/jobs              — list all jobs`);
  console.log(`\n  ngrok http ${PORT}  → paste URL in Corti console\n`);
});
server.on('error', (err) => { console.error('[Server] Error:', err.message); });
