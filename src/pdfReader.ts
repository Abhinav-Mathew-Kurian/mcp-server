import * as fs from 'fs';
import * as path from 'path';
import { loadConfig } from './config';

export interface DocumentChunk {
  index: number;
  text: string;
  start: number;
  end: number;
}

export interface DocumentResult {
  rawText: string;
  chunks: DocumentChunk[];
  fileType: string;
  filePath: string;
  charCount: number;
  chunkCount: number;
}

async function readPdf(filePath: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  return data.text;
}

async function readDocx(filePath: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mammoth = require('mammoth') as {
    extractRawText: (opts: { path: string }) => Promise<{ value: string }>;
  };
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
}

function readTxt(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

function chunkText(text: string, chunkSize: number, overlap: number): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push({ index, text: text.slice(start, end), start, end });
    if (end === text.length) break;
    start = end - overlap;
    index++;
  }

  return chunks;
}

export async function readDocument(filePath: string): Promise<DocumentResult> {
  const config = loadConfig();
  const resolved = path.resolve(process.cwd(), filePath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }

  const ext = path.extname(resolved).toLowerCase().replace('.', '');
  if (!config.document.supportedFormats.includes(ext)) {
    throw new Error(
      `Unsupported file type: .${ext}. Supported: ${config.document.supportedFormats.join(', ')}`
    );
  }

  let rawText: string;
  if (ext === 'pdf') {
    rawText = await readPdf(resolved);
  } else if (ext === 'docx') {
    rawText = await readDocx(resolved);
  } else {
    rawText = readTxt(resolved);
  }

  const { chunkSize, chunkOverlap } = config.deidentification;
  const chunks =
    rawText.length <= chunkSize
      ? [{ index: 0, text: rawText, start: 0, end: rawText.length }]
      : chunkText(rawText, chunkSize, chunkOverlap);

  return {
    rawText,
    chunks,
    fileType: ext,
    filePath: resolved,
    charCount: rawText.length,
    chunkCount: chunks.length,
  };
}

// Smoke test — run directly: npx ts-node src/pdfReader.ts --input <file>
if (require.main === module) {
  const args = process.argv.slice(2);
  const inputIdx = args.indexOf('--input');
  const inputFile = inputIdx !== -1 ? args[inputIdx + 1] : 'samples/patient_sample.txt';

  (async () => {
    console.log('=== PDF Reader Smoke Test ===\n');
    console.log(`Reading: ${inputFile}`);

    const result = await readDocument(inputFile);

    console.log(`\nFile type : ${result.fileType}`);
    console.log(`Characters: ${result.charCount}`);
    console.log(`Chunks    : ${result.chunkCount}`);
    console.log(`\n--- Raw text preview (first 500 chars) ---`);
    console.log(result.rawText.slice(0, 500));

    if (result.chunkCount > 1) {
      console.log(`\n--- Chunk breakdown ---`);
      result.chunks.forEach((c) => {
        console.log(`  Chunk ${c.index}: chars ${c.start}–${c.end} (${c.end - c.start} chars)`);
      });
    }

    console.log('\n=== Smoke test PASSED ===');
  })().catch((err) => {
    console.error('Smoke test FAILED:', err);
    process.exit(1);
  });
}
