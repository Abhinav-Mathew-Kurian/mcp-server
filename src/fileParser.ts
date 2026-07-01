import * as fs from 'fs';
import * as path from 'path';

export async function parseFileToText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.txt' || ext === '.md') {
    return fs.readFileSync(filePath, 'utf-8');
  }

  if (ext === '.pdf') {
    const pdfParse = (await import('pdf-parse')).default;
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return data.text;
  }

  if (ext === '.docx') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  if (ext === '.json') {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'string') return parsed;
    if (parsed.text) return parsed.text;
    if (parsed.note) return parsed.note;
    if (parsed.clinicalNote) return parsed.clinicalNote;
    return JSON.stringify(parsed, null, 2);
  }

  throw new Error(`Unsupported file format: ${ext}. Supported: .txt .md .pdf .docx .json`);
}
