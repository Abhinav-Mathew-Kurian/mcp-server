import * as fs from 'fs';
import * as path from 'path';

export interface CortiConfig {
  agentName: string;
  agentDescription: string;
  agentStateFile: string;
  reuseAgent: boolean;
  experts: Array<{ type: string; name: string }>;
}

export interface DeidentificationConfig {
  standard: string;
  phiCategories: string[];
  placeholderFormat: string;
  codenameWordlist: string[];
  secondPassRegex: boolean;
  chunkSize: number;
  chunkOverlap: number;
}

export interface DocumentConfig {
  supportedFormats: string[];
}

export interface OutputConfig {
  directory: string;
  encryptPhiMap: boolean;
  encryptionAlgorithm: string;
}

export interface ZKConfig {
  circuitPath: string;
  buildDir: string;
  provingSystem: string;
}

export interface AppConfig {
  corti: CortiConfig;
  deidentification: DeidentificationConfig;
  document: DocumentConfig;
  output: OutputConfig;
  zk: ZKConfig;
}

function assertField(obj: Record<string, unknown>, field: string, context: string): void {
  if (obj[field] === undefined || obj[field] === null) {
    throw new Error(`config.json missing required field: ${context}.${field}`);
  }
}

export function loadConfig(configPath = 'config.json'): AppConfig {
  const resolved = path.resolve(process.cwd(), configPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Config file not found: ${resolved}`);
  }

  const raw = JSON.parse(fs.readFileSync(resolved, 'utf-8')) as Record<string, unknown>;

  const corti = raw.corti as Record<string, unknown>;
  const deidentification = raw.deidentification as Record<string, unknown>;
  const document = raw.document as Record<string, unknown>;
  const output = raw.output as Record<string, unknown>;
  const zk = raw.zk as Record<string, unknown>;

  assertField(raw, 'corti', 'root');
  assertField(raw, 'deidentification', 'root');
  assertField(raw, 'document', 'root');
  assertField(raw, 'output', 'root');
  assertField(raw, 'zk', 'root');

  assertField(corti, 'agentName', 'corti');
  assertField(corti, 'agentDescription', 'corti');
  assertField(corti, 'agentStateFile', 'corti');

  assertField(deidentification, 'phiCategories', 'deidentification');
  assertField(deidentification, 'chunkSize', 'deidentification');
  assertField(deidentification, 'chunkOverlap', 'deidentification');

  assertField(output, 'directory', 'output');
  assertField(output, 'encryptionAlgorithm', 'output');

  return raw as unknown as AppConfig;
}
