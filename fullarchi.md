# Corti ZK De-identification Agent — Complete Architecture

**Author:** Abhinav
**Date:** 30 June 2026
**Version:** 3.0

---

## SINGLE SERVER DESIGN

Everything runs on one server, one port. There is no separate REST API process.

**Port 3456** handles both protocols on the same Express app:

- `POST /mcp` — MCP protocol endpoint. Corti's LLM and any MCP-compatible AI agent calls this.
- `POST /api/upload` — multipart file upload for the frontend
- `POST /api/batch` — JSON text notes for the frontend
- `GET /api/batch/:id` — job polling for the frontend
- `GET /api/batch/:id/download` — ZIP download for the frontend
- `GET /health` — health check

**To run everything:**

```bash
# Terminal 1 — server + ngrok
npm start

# Terminal 2 — frontend
cd frontend && npm run dev
```

---

## THE TWO ENTRY POINTS

The pipeline has two ways in. Both hit the same server, same pipeline core, same output format.

**Entry Point A — Corti Web UI**
You paste a clinical note into the Corti Agent browser at console.corti.ai. Corti's own LLM reads it and decides to call your MCP tool. The request travels via ngrok to your local server at port 3456 on the `/mcp` endpoint. The pipeline runs. The result is returned to Corti and rendered in the browser conversation.

**Entry Point B — Batch Frontend UI**
You open the React frontend at localhost:5173. You drop PDF, DOCX, or TXT files onto the drop zone and hit Run Batch. The browser sends a multipart POST directly to your server at port 3456 on `/api/upload`. The pipeline runs for every file. Results appear in a table in the browser.

---

## TECHNOLOGY STACK

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Server framework | Express on Node.js | Single HTTP server handling both MCP and REST |
| MCP protocol | `@modelcontextprotocol/sdk` | Exposes pipeline as callable tools to AI agents |
| Tunnel | ngrok | Public HTTPS URL so Corti's servers can reach localhost:3456 |
| PHI detection Layer 1 | Custom regex engine | 17 patterns — SSN, phone, email, dates, MRN, names, address |
| PHI detection Layer 2 | `compromise.js` | Offline NER — people, places, organisations |
| PHI detection Layer 3 | Consistency pass | Sweeps full text for all known PHI values and components |
| Encryption | Node.js `crypto` AES-256-GCM | PHI map encrypted at rest per run |
| Facts extraction | `@corti/sdk` | Sends anonymized text to Corti LLM, gets structured JSON back |
| ZK circuit | circom 2.0 + circomlib | 279-constraint Groth16 circuit on BN128 curve |
| ZK prover | `snarkjs` | Groth16 proof generation and local verification |
| File parsing | `pdf-parse`, `mammoth` | PDF and DOCX to plain text |
| Concurrency | `p-limit` | Max 3 notes processed simultaneously in batch |
| File upload | `multer` | Multipart form data, memory storage, 20MB per file |
| ZIP output | `archiver` ZipArchive | Streams output directory as ZIP download |
| Frontend | React + Vite + Tailwind CSS v4 | Batch UI |
| Runtime | TypeScript via `ts-node` | No compile step needed for development |

---

## SECURITY GUARANTEE

PHI never leaves your local machine unencrypted. Every detection step runs locally with no network calls. The only data that ever leaves the machine is the anonymized text with codenames substituted for real PHI values. Corti's LLM only ever sees text like `<<NOVA-1D12>>` and `<<ZEPHYR-735E>>`, never the real patient name or date of birth.

| Property | How it is achieved |
|----------|-------------------|
| PHI stays local | Detection (Layers 1, 2, 3) and redaction run entirely on your machine |
| PHI encrypted at rest | AES-256-GCM with a per-run 256-bit random key |
| Key and ciphertext separated | `patient_key.b64` and `phi_map.enc` stored in different files |
| LLM never sees PHI | Only anonymized text with `<<CODENAME-XXXX>>` tokens sent to Corti |
| ZK proof reveals nothing | Public signals are age band and ICD chapter number only |
| NER is offline | compromise.js has no network dependency |
| PDFs parsed locally | pdf-parse runs on your machine before any text touches the network |

---

---

# FLOW A — CORTI WEB UI

## End-to-End: 16 Steps

---

### Step A1 — You Paste the Clinical Note into Corti Browser

You open `console.corti.ai` and paste a raw clinical note into the conversation input. The note contains real PHI — patient name, date of birth, MRN, phone numbers, addresses, referring physician, facility name.

Corti's LLM reads the message. It has been configured with a Custom Expert pointing to your ngrok URL with transport type `streamable_http`. The LLM recognises that processing a clinical note is within that expert's scope. It decides to invoke the `run_pipeline` tool automatically, without you prompting it to do so.

---

### Step A2 — Corti Backend Sends an MCP Tool Call via HTTPS

Corti's servers construct a standard MCP request and send it over HTTPS to your ngrok public URL:

```http
POST https://<ngrok-id>.ngrok-free.dev/mcp
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "run_pipeline",
    "arguments": {
      "clinical_note": "Patient: Wei-Lin Huang\nDate of Birth: 03 September 1948\n..."
    }
  }
}
```

ngrok receives this on its public HTTPS endpoint, decrypts the TLS layer, and forwards a plain HTTP request to `localhost:3456` on your machine. Your Express server picks it up.

---

### Step A3 — MCP Server Validates and Routes

**File:** `src/mcpServer.ts` — the `/mcp` route handler

The server reads `method: "tools/call"` and `name: "run_pipeline"`. It routes to the `runPipeline()` handler and extracts `clinical_note` from `params.arguments`. Before anything else, the raw note text is passed through `fixMojibake()`.

---

### Step A4 — fixMojibake() Repairs Browser Encoding Corruption

**File:** `src/mcpServer.ts` → `fixMojibake()`

The Corti browser console is a web application. When clinical text containing special medical characters passes through the browser encoding layer and then through MCP JSON serialisation, multi-byte Unicode characters get corrupted. This is called mojibake.

| Corrupted form | Correct character | Unicode |
|---------------|------------------|---------|
| `Â°C` | `°C` | U+00B0 degree sign |
| `Âµmol` | `µmol` | U+00B5 micro sign |
| `Ã—` | `×` | U+00D7 multiplication sign |
| `â€"` | `—` | U+2014 em dash |
| `â€"` | `–` | U+2013 en dash |
| `â¹` | `⁹` | U+2079 superscript nine |

**Why the order of repairs matters critically:** The `×` character encodes as bytes `0xC3 0x97`. The em dash repair pattern also scans for byte `0x97`. If the em dash pattern runs first, it consumes the `0x97` byte that belongs to `×`, destroying the multiplication sign permanently with no recovery possible.

The fix: replace `×` with a placeholder `\x00TIMES\x00` first, before any other repair runs. Then run em dash, en dash, quote, and superscript repairs. Then do the main UTF-8 repair with `Buffer.from(text, 'latin1').toString('utf8')`. Then restore all placeholders to their correct Unicode characters.

---

### Step A5 — Strip Markdown Bold Markers

**File:** `src/phiDetector.ts` → `detectAndReplace()`

If the clinical note was pasted via a rich-text interface, field labels may arrive with markdown bold markers like `**Patient:** Wei-Lin Huang`. These are stripped before any detection runs.

Without stripping, the Patient name regex captures `** Wei-Lin Huang` with asterisks and a leading space. The consistency pass in Layer 3 registers `** wei-lin huang` as the known PHI value. When it scans the body it looks for `** wei-lin huang` but finds `Wei-Lin Huang` with no asterisks. The name survives in the body completely unredacted — a PHI leak caused by punctuation.

---

### Step A6 — Layer 1: Regex PHI Detection

**File:** `src/phiDetector.ts` → `regexSpans()`

17 regex patterns run against the cleaned text locally. Each match returns a span with the matched value, start index, and end index. Leading and trailing whitespace is trimmed from each value after matching.

| Pattern | What it catches | Example |
|---------|----------------|---------|
| SSN | `\b\d{3}-\d{2}-\d{4}\b` | `512-63-9047` |
| Phone | US formats with optional country code | `(415) 667-3921`, `415-883-2047` |
| Email | Standard email pattern | `weilin.huang48@gmail.com` |
| Date DD Month YYYY | Day month name year | `03 September 1948` |
| Date Month DD YYYY | Month name day year | `September 3, 1948` |
| Date DD/MM/YYYY | Numeric slash format | `03/09/1948` |
| Date YYYY-MM-DD | ISO format | `1948-09-03` |
| MRN | Value after `MRN:` label | `4481920` |
| NPI | 10-digit value after `NPI:` label | `6612039485` |
| Patient name | Full line after `Patient:` | `Wei-Lin Huang` |
| Family member names | Name after relationship word | `Kevin Huang` after `son` |
| Full address line | Line after `Address:` | `88 Jade Garden Court, SF CA 94108` |
| Facility | Line after `Facility:` | `UCSF Medical Center` |
| Footer date | Date after `Date:` label | `14 June 2026` |
| Street address | Numbered street pattern | `88 Jade Garden Court` |
| ZIP code | 5-digit code after state abbreviation | `94108` |
| IP address / URL | Technical identifiers | — |

The phone pattern has a negative lookbehind for `+`, digits, and `(` to avoid matching numeric sequences inside lab values like `WBC: 9.4 × 10⁹/L`. The street address pattern has no case-insensitive flag specifically to avoid matching `CT` (computed tomography) as `Ct` (Court abbreviation).

---

### Step A7 — Layer 2: NER PHI Detection

**File:** `src/phiDetector.ts` → `nerSpans()`
**Library:** `compromise.js` — runs entirely offline, no API calls

Named Entity Recognition reads the text linguistically and identifies entities by grammar and context.

**People:** `doc.people()` returns person name strings. Each result is filtered — skip if 2 characters or fewer, skip if in the relationship words set (`son`, `daughter`, `wife`, `husband`, `mother`, `father`, `partner`, `carer`, `guardian`, `sister`, `brother`, `uncle`, `aunt`, `cousin`, `spouse`, `sibling`, `parent`, `niece`, `nephew`).

Without this filter: `"sister Lara Khoury"` gets tagged as one person. Component splitting adds `"sister"` to the known PHI set. The word `"sister"` then gets redacted everywhere in the note, corrupting valid clinical text.

**Places:** `doc.places()` filtered against medical eponyms: `glasgow`, `ottawa`, `wells`, `geneva`, `tokyo`, `charcot`, `sofa`, `apache`, `curb`, `nihss`, `nyha`, `ranson`, `apgar`, `braden`, `child`, `meld`, `bishop`. Without this, `"Glasgow Coma Scale"` produces the place `"Glasgow"` which gets redacted everywhere, corrupting the scoring system reference.

**Organisations:** `doc.organizations()` catches hospital and clinic names regex missed.

**Explicit Dr. pattern:** A dedicated regex runs as a backup for physician names: `/\bDr\.?\s+[A-Z][a-zA-Z-]+(?:\s+[A-Z][a-zA-Z-]+)*/g`. The `-` inside the character class `[a-zA-Z-]` is essential. Without it the pattern matches `Dr. Mei` and stops at the hyphen in `Mei-Xing`, never reaching `Loh`. The surname survives throughout the note.

**Limitation:** compromise.js is trained on Western English names. Non-Western names — Nigerian, Arabic, Ghanaian — are frequently missed entirely. This is why Layer 3 exists.

---

### Step A8 — Component Expansion

**File:** `src/phiDetector.ts` → `expandWithComponents()`

All values from Layer 1 and Layer 2 are pooled. Each multi-word or hyphenated value is split into individual parts:

- `"Wei-Lin Huang"` → adds `"Wei"`, `"Lin"`, `"Huang"`
- `"Kevin Huang"` → adds `"Kevin"`, `"Huang"`
- `"Dr. Mei-Xing Loh"` → adds `"Mei"`, `"Xing"`, `"Loh"`
- `"UCSF Medical Center"` → adds `"UCSF"` only — `"Medical"` and `"Center"` are in COMMON_WORDS

Parts shorter than 3 characters, in COMMON_WORDS, in medical eponyms, or in relationship words are excluded.

Without COMMON_WORDS filtering: `"Swedish Medical Center"` splits and registers `"Medical"` as PHI. Then `"Past Medical History"` gets `"Medical"` redacted mid-header, corrupting the section label.

This runs after both layers have completed so that every detected name — including ones found only by regex and missed by NER — contributes its components to the Layer 3 sweep.

---

### Step A9 — Layer 3: Consistency Pass

**File:** `src/phiDetector.ts` → `consistencySpans()`

Scans the entire note text for every value in the expanded known-PHI set. Catches names repeated in body paragraphs without a label, family name components shared across relatives, and values that only appear in embedded sentence context.

Two guards prevent false positives:

**Short value guard:** Values shorter than 3 characters are skipped.

**Bare numeric guard:** Values matching `^\d{1,4}$` are skipped. Without this, the date `"14 June 2026"` gets detected by Layer 1 and its year component `"2026"` gets added by expansion. Layer 3 would then find `"2026"` in every year reference throughout the note, redacting unrelated years.

**Word boundary check:** The character immediately before and after each match must not be a word character. This prevents `"Smith"` matching inside `"Smithson"`.

---

### Step A10 — Span Merge and Codename Redaction

**File:** `src/phiDetector.ts` → `mergeOverlapping()` and replacement loop

All spans from all three layers are combined and sorted by start position ascending, then length descending so the longest match wins when two spans overlap. Overlapping spans are resolved — shortest is discarded.

Each unique normalised PHI value gets one codename. Same value, same codename throughout the entire run. Codenames are generated as `<<WORD-XXXX>>` where WORD is from a wordlist and XXXX is 2 random hex bytes.

Replacements are applied right to left — from the end of the text backwards. This preserves all character indices since replacing text at position 800 does not shift any positions before 800.

---

### Step A11 — PHI Map Encryption

**File:** `src/deidentifier.ts`

A 256-bit random patient key is generated: `crypto.randomBytes(32)`.

The PHI map (codename → original value) is encrypted using AES-256-GCM with a random 12-byte IV. GCM provides both encryption and authentication — if the ciphertext is tampered with, decryption fails with an auth tag mismatch.

Two files are written separately: `phi_map.enc` (ciphertext) and `patient_key.b64` (key). Both are required to recover the original note. The key alone or the ciphertext alone is useless.

---

### Step A12 — Facts Extraction via Corti LLM

**File:** `src/factsExtractor.ts`

**This is the only step where any data leaves the local machine.**

The anonymized note — containing only codenames, no real PHI — is sent to Corti's Agentic Framework. Corti's LLM reads text like `"<<NOVA-1D12>> is a 77-year-old male..."` and extracts structured clinical data:

```json
{
  "diagnoses": [
    { "name": "Decompensated heart failure (HFrEF, EF 28%)" },
    { "name": "Permanent atrial fibrillation, rate controlled" }
  ],
  "vitals": {
    "bloodPressure": "158/96 mmHg",
    "heartRate": "88 bpm",
    "oxygenSaturation": "91%"
  },
  "medications": [
    { "name": "Apixaban", "dose": "5mg", "frequency": "twice daily" }
  ],
  "ageYears": 77,
  "ageRange": "70-79",
  "sex": "male"
}
```

The age `77` is extracted from the phrase `"77-year-old male"` in the anonymized text. The real date of birth (`<<ZEPHYR-735E>>`) is never revealed. The LLM extracts everything from clinical context alone. Output written to `facts.json`.

---

### Step A13 — ICD-10 Chapter Classification

**File:** `src/zkRunner.ts` → `getDiagnosisChapter()`

Maps the extracted diagnoses to one ICD-10 chapter using keyword matching. Runs entirely locally.

**Diagnoses-first iteration:** For each diagnosis starting from the primary (index 0), check all ICD chapters for a keyword match. Return the first chapter that matches the first diagnosis that matches anything. Stop immediately.

This ordering is critical. A chapter-first algorithm lets secondary comorbidities (e.g. Asthma → Chapter 10) beat the primary diagnosis (e.g. DKA → Chapter 4) if the comorbidity's chapter ranks higher. The diagnoses-first algorithm ensures the primary diagnosis always determines the chapter.

**Note on stroke:** Stroke keywords (`cerebral infarction`, `mca occlusion`, `thrombolysis`, `alteplase`) map to Chapter 9 (Circulatory System), not Chapter 6 (Nervous System). ICD-10 classifies stroke as a vascular event under Circulatory diseases.

---

### Step A14 — ZK Proof Generation

**File:** `src/zkRunner.ts` → `generateProof()`
**Library:** `snarkjs` — Groth16 prover, runs entirely locally

A zero-knowledge proof proves a statement is true without revealing the underlying data. Here: this patient is aged 70–79 and their primary diagnosis is ICD-10 Chapter 9 — proven cryptographically without revealing age 77 or the specific diagnosis text.

Private inputs (never leave the machine):

| Input | Value |
|-------|-------|
| `ageYears` | 77 |
| `ageBracketLow` | 70 (floor of 77 divided by 10, times 10) |
| `diagnosisChapter` | 9 |
| `patientKeyFp` | SHA-256 of patient key, reduced mod BN128 prime |
| `factsFp` | SHA-256 of facts.json, reduced mod BN128 prime |

The circuit enforces 279 constraints. snarkjs runs the Groth16 full prove:

```typescript
const { proof, publicSignals } = await snarkjs.groth16.fullProve(
  circuitInput,
  'src/circuits/patient.wasm',
  'src/circuits/patient_final.zkey'
)
```

Public signals — the only things revealed:

| Signal | Value | Meaning |
|--------|-------|---------|
| `publicSignals[0]` | `70` | Age range lower bound |
| `publicSignals[1]` | `79` | Age range upper bound |
| `publicSignals[2]` | `9` | ICD-10 chapter |
| `publicSignals[3]` | `14927...734` | Data commitment hash |

The proof is verified locally immediately after generation. If verification fails the pipeline throws and aborts. Output: `proof.json`, `public_signals.json`, `zk_summary.json`.

---

### Step A15 — MCP Response Bundle Returned to Corti

All results are packaged into one MCP tool response and sent back through the same HTTP connection. The response travels: your machine → ngrok → Corti's backend → Corti's LLM.

The bundle contains the full anonymized note text, structured clinical facts (diagnoses, vitals, medications), and the ZK proof summary with public signals and verification status.

---

### Step A16 — Result Rendered in Corti Browser

Corti's LLM formats the tool response and renders it in the conversation UI. You see the anonymized note, the extracted clinical facts, and the ZK proof panel all in the browser chat window.

**Total round trip: 3–5 seconds. Real patient PHI never left your machine.**

---

---

# FLOW B — BATCH FRONTEND UI

## End-to-End: 12 Steps

---

### Step B1 — Open the Frontend

You open `http://localhost:5173`. The React app mounts and sends `GET /health` to port 3456. If the server responds with `status: ok`, a green dot appears confirming the connection. The UI shows a drop zone, text input boxes, and a Run Batch button.

---

### Step B2 — Drop PDF, DOCX, or TXT Files

You drag files onto the drop zone or click it to open a file picker. The drop handler checks every file's extension against the allowed list: `.pdf`, `.docx`, `.txt`, `.md`.

If binary files (`.pdf` or `.docx`) are present, the UI switches to file upload mode. Files appear in a queue panel showing name, size, and a remove button. The counter reads `"3 files ready"`.

If only text files are present, the UI stays in text mode. Each file is read client-side using the FileReader API and placed into a text input box for optional editing before submission.

---

### Step B3 — Click Run Batch

You click `Run Batch →`. The UI immediately shows a spinner. In file upload mode, a FormData object is built with all files appended and posted to `POST /api/upload` on port 3456 — the same server that handles Corti's MCP calls. In text mode, a JSON array of notes is posted to `POST /api/batch`.

---

### Step B4 — Server Receives the Upload

**File:** `src/mcpServer.ts` → `POST /api/upload`

multer intercepts the multipart request. Files are held in memory as Buffers — nothing written to disk yet. For each file, the server writes the buffer to a temp file in `output/.tmp_uploads/`, calls `parseFileToText()`, then immediately deletes the temp file. Parse failures are isolated per file.

A job ID is generated and the job is registered as `running`. The server responds immediately with HTTP 202 and the job ID. The batch runs asynchronously in the background.

---

### Step B5 — File Parser Converts Files to Plain Text

**File:** `src/fileParser.ts` → `parseFileToText()`

PDF files: `pdf-parse` extracts all text content from the buffer, preserving section headers, field labels, values, and line breaks.

DOCX files: `mammoth.extractRawText()` strips all formatting and returns only the textual content.

TXT and MD files: `fs.readFileSync(filePath, 'utf-8')` reads directly.

The extracted text for all formats is structurally identical to text you would paste manually into the Corti browser or a text box.

---

### Step B6 — Frontend Polls for Job Status

`startPolling()` sets a 2-second interval calling `GET /api/batch/:jobId`. A `pollRef` stores the interval reference so it can be cleared when the job finishes or the component unmounts. The spinner stays on screen while the response is `status: running`.

---

### Step B7 — Batch Processor Runs the Full Pipeline Per Note

**File:** `src/batchProcessor.ts` → `runBatch()`

`p-limit` caps concurrency at 3 notes simultaneously to avoid overwhelming the Corti API:

```typescript
const limit = pLimit(3)
const results = await Promise.all(
  notes.map(note => limit(async () => { /* full pipeline */ }))
)
```

For each note, the exact same steps as Flow A run: Steps A5 through A11 (markdown strip, regex Layer 1, NER Layer 2, component expansion, consistency pass Layer 3, span merge, codename redaction, AES-256-GCM encryption), then Steps A13 and A14 (ICD classification, ZK proof generation and local verification).

Per-note error isolation: if one note throws, it is marked `failed` and the rest continue. A single bad file cannot abort the batch.

---

### Step B8 — Batch Summary Written

After all notes complete, the batch processor writes `batch_summary.json` and `batch_report.txt` to the batch root directory. The summary includes total notes, succeeded count, failed count, total runtime, ICD distribution across the batch, total PHI tokens removed, and per-note results. The job store is updated to `status: done`.

---

### Step B9 — Poll Returns Done

The 2-second poll receives `status: done` with the full batch result. Anonymized text is stripped from the summary response (it is large) — it is fetched individually via `GET /api/batch/:jobId/note/:noteId` when a user expands a row. The frontend clears the polling interval and transitions to the results view.

---

### Step B10 — Results Table Rendered

**Summary cards** show four numbers: Notes Processed, Succeeded, PHI Tokens Removed, Runtime.

**ICD distribution pills** show one pill per chapter with a count — immediate overview of the case mix across the batch.

**Results table** has one row per note: status icon, note ID, ICD chapter name, ZK-proved age range, ZK verified tick, PHI token count, processing time, and an expand chevron.

---

### Step B11 — Expand a Note for Full Detail

Clicking the expand chevron calls `GET /api/batch/:jobId/note/:noteId`. The expanded panel shows the diagnoses list, medications list with dose and frequency, ZK proof panel (system, constraints, age range, ICD chapter, verified tick), and the full anonymized note text in a scrollable monospace block.

---

### Step B12 — Download ZIP

The Download button calls `GET /api/batch/:jobId/download`. The server streams the entire `output/<batchId>/` directory as a ZIP file using `archiver`'s `ZipArchive`. The browser receives it as a file download containing every output file for every note in the batch.

---

---

## OUTPUT FILES

Every run — Flow A or Flow B — writes the same file structure locally:

```
output/
└── batch_2026-06-30T14-30-22/
    ├── batch_summary.json
    ├── batch_report.txt
    └── test_patient_1_wei_lin_huang/
        ├── anonymized.txt         safe to share — no PHI
        ├── facts.json             structured clinical data
        ├── phi_map.enc            AES-256-GCM encrypted PHI map
        ├── patient_key.b64        decryption key — store separately
        ├── commitment.json        SHA-256 data commitment
        ├── proof.json             Groth16 proof (A, B, C curve points on BN128)
        ├── public_signals.json    age range, ICD chapter, commitment hash
        └── zk_summary.json        human-readable proof summary
```

---

## CAN THE FRONTEND CONNECT DIRECTLY TO THE MCP ENDPOINT?

Technically yes. Practically no.

MCP is a request-response protocol with one tool call returning one result. It has no concept of job IDs, no polling pattern, no multipart file upload support, and no ZIP streaming. Adding all of those on top of MCP would mean rebuilding the REST endpoints inside the MCP layer — which is exactly what the `/api/*` routes already are, co-located on the same server. The frontend talks REST to `/api/*`. Corti talks MCP to `/mcp`. Same port, same process, same pipeline underneath. This is the correct split.

---

## CAN THE MCP SERVER BATCH?

Yes, but with limitations. The first option is having the AI agent loop — Corti's LLM calls `run_pipeline` once per note sequentially. This works but is slow. The second option is adding a `run_batch` tool to the MCP server that accepts an array of notes and calls `runBatch()` internally. This works but MCP tool responses have no streaming progress — for a 20-note batch taking 2 minutes, the agent connection hangs with no feedback. The REST API's `202 Accepted → poll → done` pattern exists specifically to solve that. For anything more than one or two notes, the frontend batch path is the right choice.

---

## WHY ONE SERVER

Before this architecture, the MCP server ran on port 3456 and a separate REST API ran on port 3457. They shared the same pipeline code but were two independent processes requiring `npm start` and separately `npm run api` — two things to keep in sync, two ports to track, two processes to kill and restart. The single-server design merges them into one Express app on port 3456 handling both `/mcp` requests from AI agents and `/api/*` requests from the browser. One command starts everything.

---

## HOW TO RUN

```bash
# First time setup
npm install
cd frontend && npm install && cd ..

# Terminal 1 — server on :3456 + ngrok tunnel
npm start

# Terminal 2 — frontend dev server
cd frontend && npm run dev
# opens at http://localhost:5173
```

Register the ngrok HTTPS URL in Corti console settings as a Custom Expert:
- URL: `https://<ngrok-id>.ngrok-free.dev/mcp`
- Transport: `streamable_http`

---

*End of Architecture Document — v3.0*
