# Corti ZK De-identification Agent — Implementation Guide

**Author:** Abhinav  
**Date:** 29 June 2026  
**Stack:** TypeScript · Node.js · compromise.js · snarkjs · circom · Express · MCP SDK · ngrok

---

## Overview

This document describes, phase by phase, how the Corti ZK De-identification Agent was
designed, built, tested, and connected to the Corti console UI. The agent takes a raw
clinical note as input and produces:

1. An **anonymized note** with all PHI replaced by deterministic codenames
2. A **structured facts JSON** extracted by the Corti LLM agent
3. A **Groth16 zero-knowledge proof** cryptographically binding the anonymized data
   to the facts without revealing any original PHI

---

## Architecture at a Glance

```
Clinician pastes note
        │
        ▼
Corti Console UI
        │  MCP streamable_http call
        ▼
MCP Server (port 3456, exposed via ngrok)
        │
        ├─► Phase 1: PHI Detection & Replacement  (phiDetector.ts)
        │       Layer 1 — Regex (SSN, phone, email, dates, MRN, addresses)
        │       Layer 2 — NER  (compromise.js people / orgs / places)
        │       Layer 3 — Consistency (catch all occurrences of detected PHI)
        │       Component expansion (hyphenated names, non-Western names)
        │
        ├─► Phase 2: Facts Extraction  (Corti agent API call)
        │       Corti LLM extracts age, sex, diagnoses, vitals, medications
        │
        ├─► Phase 3: ZK Proof Generation  (zkRunner.ts + circom circuit)
        │       ICD-10 chapter classification
        │       Groth16 proof over BN128 curve (279 constraints)
        │       Public signals: age band, ICD chapter, data commitment
        │
        └─► Response: anonymized note + facts JSON + proof summary
```

---

## Phase 1 — PHI Detection and Replacement (`src/phiDetector.ts`)

### Goal
Remove all 18 HIPAA Safe Harbor PHI identifiers from the clinical note and replace
each unique value with a deterministic codename (e.g. `<<NOVA-3A7F>>`). The same
value always gets the same codename within a document, allowing the anonymized text
to remain readable and internally consistent.

### Three-Layer Detection Strategy

**Layer 1 — Regex Spans (structured PHI)**  
Deterministic patterns that catch PHI with known formats:
- SSN: `\b\d{3}-\d{2}-\d{4}\b`
- Phone: US formats including `(xxx) xxx-xxxx` and `xxx-xxx-xxxx`
- Email: standard RFC pattern
- Dates: DD/MM/YYYY, YYYY-MM-DD, "29 June 2026", "June 29, 2026"
- MRN: value after `MRN:` label
- NPI: 10-digit value after `NPI:` label
- Patient ID / wristband numbers
- Patient name: full line after `Patient:` or `Patient Name:` label
- Address: full line after `Address:` label
- Facility: full line after `Facility:` or `Facility Contact:` label
- Street address pattern: `\b\d+ StreetName StreetType\b` (case-sensitive — dropping
  the /i flag prevents "CT" scan matching "Ct" Court and eating imaging lines)
- IP addresses, URLs, ZIP codes

**Layer 2 — NER Spans (unstructured PHI)**  
Uses compromise.js to detect named entities:
- `doc.people()` — person names (filtered for relationship words)
- `doc.organizations()` — facility / company names
- `doc.places()` — city / location names (filtered for medical eponyms)
- Explicit `Dr. Firstname Lastname` regex catch for names NER misses

Exclusion sets applied during NER filtering:
- `RELATIONSHIP_WORDS` — sister, brother, wife, husband, daughter, son, etc.
  (NER sometimes tags "sister Lara Khoury" as one entity; "sister" alone is not PHI)
- `MEDICAL_EPONYMS` — Tokyo, Glasgow, Ottawa, Wells, SOFA, APACHE, etc.
  (city names used as medical scoring systems are not patient identifiers)
- `COMMON_WORDS` — Medical, Center, Hospital, Health, University, etc.
  (generic institution words that appear in facility names are not standalone PHI)

**Layer 3 — Consistency Spans**  
After layers 1 and 2, ALL detected PHI values are fed into a consistency pass that
searches the full document for any remaining occurrences of those values. This catches:
- A patient name that appears in the body of a note but not near a label
- An MRN repeated in a wristband line mid-document
- A phone number appearing in a different format the second time

**Component Expansion (critical for non-Western names)**  
Before the consistency pass, ALL detected values (from both regex and NER) are split
into individual word components by whitespace and hyphens. This ensures:
- "Amara Osei-Bonsu" → adds "Amara", "Osei", "Bonsu" to the consistency search
- "Osei" then catches "Kofi Osei" (a secondary contact) even though NER never tagged
  "Kofi Osei" as a person (compromise.js has limited non-Western name coverage)

This expansion runs in `detectAndReplace()` AFTER both layers are complete, so it has
access to regex-detected names that NER never saw.

**Secondary Contact Name Regex**  
A dedicated regex catches names following family relationship words in the text body:
```
(?<=\b(?:daughter|son|sister|brother|wife|husband|mother|father|partner|carer|guardian)\s+)
[A-Z][a-zA-Z-]+(?:\s+[A-Z][a-zA-Z-]+)*
```
This catches "Kofi Osei" in "Her daughter Kofi Osei (contact: ...)" even when NER
returns nothing and the patient surname isn't a useful component.

### Markdown Stripping
Notes pasted from rich-text editors arrive with markdown bold markers:
`**Patient:** Amara Osei-Bonsu`. Before any detection runs, these markers are stripped:
```typescript
text = text.replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/\*([^*\n]+)\*/g, '$1');
```
Without this, the Patient: regex captures `** Amara Osei-Bonsu` (with asterisks and a
leading space), and the consistency pass then searches for ` amara osei-bonsu` (with
leading space), which never matches the plain name preceded by a newline in the body.

### Span Value Trimming
All regex spans trim leading/trailing whitespace from the captured value and adjust
span start/end indices accordingly. This is necessary because lookbehind patterns like
`(?<=Patient:\s*)` can match with `\s*` = zero spaces, causing `[^\n]+` to start at
the space before the name, capturing ` Amara Osei-Bonsu` instead of `Amara Osei-Bonsu`.

### Codename Assignment
Each unique PHI value (case-insensitive) is assigned a codename from a wordlist:
`NOVA`, `ZEPHYR`, `TITAN`, `PULSAR`, `VEGA`, `LYRA`, `ORION`, `QUASAR`, ...
followed by 4 hex digits from `crypto.randomBytes(2)`. Same value = same codename
within a document. The PHI map is stored encrypted with AES-256-GCM.

---

## Phase 2 — Clinical Facts Extraction (`src/factsExtractor.ts`)

### Goal
Extract structured clinical facts from the anonymized note using the Corti LLM agent.
The note is anonymized FIRST so no PHI reaches the Corti API.

### What Gets Extracted
```json
{
  "chiefComplaint": "...",
  "ageYears": 61,
  "sex": "Female",
  "diagnoses": ["Right upper lobe squamous cell carcinoma — Stage IIIA", "COPD GOLD II"],
  "medications": ["Tiotropium bromide 18mcg", "Metformin 1000mg twice daily"],
  "vitals": { "bp": "148/92", "hr": "88 bpm", "spo2": "93%" }
}
```

### Corti Agent Integration
The Corti agent (`154daefe-796a-4e6f-abdb-7811def09b8b`) is called via the Corti
Agentic Framework REST API with the anonymized note as input. The agent returns
structured JSON facts which are validated and stored as `facts.json`.

**Note:** Corti's Multi-Agent Composition (A2A) and Direct Expert API are listed as
"coming soon" in their documentation. Facts extraction via the Corti agent API is
currently the only supported path for using Corti agents from code.

---

## Phase 3 — Zero-Knowledge Proof Generation (`src/zkRunner.ts`)

### Goal
Generate a cryptographic proof that the anonymized note and extracted facts are
consistent with the original data, without revealing any PHI. The proof is publicly
verifiable and can accompany the anonymized data bundle for research or audit.

### Circuit Design (`src/circuits/patient.circom`)
The ZK circuit is written in circom 2.0 and uses the Groth16 proving system over the
BN128 elliptic curve.

**Private inputs (known only to the prover):**
- `ageYears` — patient's actual age
- `patientKeyFp` — field element derived from the patient's AES key
- `factsFp` — field element derived from SHA-256 of the facts JSON

**Public outputs (go into the proof's public signals):**
- `ageBracketLow` — age rounded down to nearest decade (e.g. 60 for age 61)
- `ageBracketHigh` — ageBracketLow + 9
- `diagnosisChapter` — ICD-10 chapter number
- `dataCommitment` — SHA-256(patientKeyFp + factsFp) mod BN128 prime

**Constraint count:** 279  
**Proving system:** Groth16 (succinct non-interactive proof, ~300 bytes)

### ICD-10 Chapter Classification
Before proof generation, the primary diagnosis is mapped to an ICD-10 chapter.
The mapping iterates **diagnoses first, then chapters** — this ensures the primary
(first-listed) diagnosis determines the chapter, not a secondary comorbidity.

Key chapter assignments (ordered by typical acuity):
```
Ch 9  — Circulatory: STEMI, stroke, MI, heart failure, AF
Ch 10 — Respiratory: COPD, asthma, pulmonary
Ch 2  — Neoplasms:   cancer, carcinoma, NSCLC, lymphoma
Ch 1  — Infectious:  sepsis, TB, COVID, bacteraemia
Ch 4  — Endocrine:   DKA, diabetic ketoacidosis, diabetes mellitus, thyroid
Ch 11 — Digestive:   cholangitis, cholelithiasis, biliary, pancreatitis
Ch 14 — Genitourinary: AKI, renal failure, nephropathy
Ch 6  — Nervous:     epilepsy, Parkinson, MS, meningitis (NOT stroke)
```

The algorithm was changed from chapter-first to diagnosis-first iteration to fix a bug
where a background comorbidity (e.g. Asthma, Ch 10) would beat a primary diagnosis
(e.g. DKA, Ch 4) simply because Ch 10 appeared earlier in the priority list.

### Circuit Build Process
```bash
# Compile circuit
circom src/circuits/patient.circom --r1cs --wasm --sym

# Powers of Tau (phase 1 trusted setup)
snarkjs powersoftau new bn128 12 pot12_0000.ptau
snarkjs powersoftau contribute pot12_0000.ptau pot12_0001.ptau
snarkjs powersoftau prepare phase2 pot12_0001.ptau pot12_final.ptau

# Groth16 setup (phase 2)
snarkjs groth16 setup patient.r1cs pot12_final.ptau patient_0000.zkey
snarkjs zkey contribute patient_0000.zkey patient_final.zkey
snarkjs zkey export verificationkey patient_final.zkey verification_key.json
```

### Proof Output Files
Each pipeline run produces:
- `proof.json` — the Groth16 proof (~300 bytes)
- `public_signals.json` — age band low/high, ICD chapter, data commitment
- `zk_summary.json` — human-readable proof summary
- `facts.json` — extracted clinical facts
- `anonymized.txt` — the anonymized note
- `phi_map.enc` — AES-256-GCM encrypted PHI map

---

## Phase 4 — MCP Server (`src/mcpServer.ts`)

### Why MCP?
The Corti console UI supports adding custom experts via MCP (Model Context Protocol)
using the `streamable_http` transport. This allows the Corti console agent to call our
pipeline as a tool without any agent-to-agent API (which is not yet available in Corti).

### Server Architecture
Built with `@modelcontextprotocol/sdk` and Express on port 3456. Each POST to `/mcp`
gets its own `StreamableHTTPServerTransport` instance (stateless mode) — this avoids
session management complexity and works cleanly with Corti's call pattern.

```typescript
app.post('/mcp', async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});
```

### Tools Registered
```
run_pipeline      — De-identify + extract facts + generate ZK proof
deidentify_only   — Redaction only (no Corti API call, no ZK proof)
extract_facts     — De-identify + facts only (no ZK proof)
```

### UTF-8 Encoding Fix (`fixMojibake`)
The Corti console transmits text with UTF-8 bytes decoded as Latin-1, producing
mojibake (e.g. `°C` → `Â°C`, `µmol` → `Âµmol`, `×` → `Ã—`, `⁹` → `â¹`).

The fix uses a token-protection strategy:
1. Protect known special characters as `\x00TOKEN\x00` placeholders BEFORE the
   Buffer roundtrip. Critical: `×` (U+00D7, UTF-8: C3 97) MUST be protected BEFORE
   the em dash (`` W1252 variant) because both share the byte 0x97.
2. Run `Buffer.from(text, 'latin1').toString('utf8')` to fix the remaining mojibake.
3. Restore tokens to their correct Unicode characters.

The ordering conflict that was fixed:
```typescript
// WRONG order —  consumed by EMDASH before × can match Ã
.replace(/â|—|/g, '\x00EMDASH\x00')  // eats 0x97
.replace(/Ã|×/g, '\x00TIMES\x00')                // never matches

// CORRECT order
.replace(/Ã|×/g, '\x00TIMES\x00')                // × first
.replace(/â|—|/g, '\x00EMDASH\x00')  // em dash after
```

---

## Phase 5 — Public Exposure via ngrok

### Why ngrok?
The Corti console calls the MCP server from Corti's cloud infrastructure. The server
must be publicly accessible. ngrok creates a secure HTTPS tunnel to localhost:3456.

### Setup
```bash
# Install
npm install -g ngrok
# or: snap install ngrok

# Authenticate (one-time)
ngrok config add-authtoken <your-token>

# Expose the MCP server
ngrok http 3456
```

The public URL (e.g. `https://sybil-unschizophrenic-unforgivably.ngrok-free.dev`)
is what you paste into the Corti console "Add Custom Expert" form.

---

## Phase 6 — Connecting to the Corti Console

### Add Custom Expert Form
In the Corti console, navigate to: Settings → Experts → Add Custom Expert

Fill in the form as follows:

```
Name:         Corti ZK De-identification Pipeline
Description:  De-identifies clinical notes using HIPAA Safe Harbor rules,
              extracts structured facts, and generates a Groth16 ZK proof.
              Call run_pipeline with the full clinical note text.

Transport:    streamable_http
URL:          https://<your-ngrok-subdomain>.ngrok-free.app/mcp

Headers:      (none required)
Auth:         (none required for development)
```

### How the Console Agent Calls the Pipeline
When a user pastes a clinical note into the console and asks for de-identification,
the console agent:
1. Calls `run_pipeline` with `{ "clinical_note": "<full note text>" }`
2. Our server receives the note via POST /mcp
3. The pipeline runs (de-identify → extract facts → ZK proof)
4. The server returns a formatted markdown response with:
   - Anonymized note
   - Extracted clinical facts
   - ZK proof summary (age band, ICD chapter, verification status)
5. The console agent presents this to the user

Total round-trip time: approximately 15–25 seconds (dominated by ZK proof generation).

---

## Testing Strategy

### Test Notes Used
Each test note was designed to stress-test specific pipeline features:

| # | Patient         | Condition              | Key Tests                                    |
|---|-----------------|------------------------|----------------------------------------------|
| 1 | Marcus Brennan  | STEMI                  | °C, standard English name, ICD Ch9           |
| 2 | Diane Hartwell  | Heart failure          | Em dash in lab values, en dash               |
| 3 | Priya Sharma    | SLE / hypert. emergency| South Asian name, first name leak, footer date|
| 4 | Thomas Gallagher| Ischaemic stroke       | ×, ⁹, ICD Ch9 (not Ch6), stroke keywords     |
| 5 | Fatima Al-Rashidi| Acute cholangitis     | Hyphenated Arabic name, Tokyo Grade eponym   |
| 6 | Nour Khoury     | Severe DKA             | DKA beats Asthma for ICD, "sister" not redacted|
| 7 | Amara Osei-Bonsu| Stage IIIA NSCLC       | Non-Western name, Kofi Osei secondary contact|
|   |                 |                        | markdown bold, CT vs Ct regex, 11/11 checks  |

### What Each Test Validated
- PHI in header: patient name, DOB, MRN, SSN, address, phone, email, NPI
- PHI in body: name repetitions, spouse/relative names, clinic phone numbers
- PHI in footer: signed physician name, date, facility contact
- Clinical text integrity: lab values, imaging descriptions, drug names, staging
- Special characters: °C, µmol/L, m², ×, ⁹, —, –, Ca²⁺
- False positives: GOLD Stage II, Tokyo Grade, KRAS G12C, NIHSS, SIADH intact

### Automated Check Script Pattern
Each test used a Python script calling the MCP server directly:
```python
import json, urllib.request

payload = {
    "jsonrpc": "2.0", "id": 1,
    "method": "tools/call",
    "params": {"name": "deidentify_only", "arguments": {"clinical_note": note}}
}
req = urllib.request.Request("http://localhost:3456/mcp", ...)
# ... parse response, run assertions
```

---

## Key Bugs Found and Fixed

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| °C → Â°C | Corti sends UTF-8 as Latin-1 | Buffer.from(text,'latin1').toString('utf8') with token protection |
| — dropped | Em dash > U+00FF truncated in Buffer roundtrip | Protect as token before roundtrip |
| × → Ã— |  byte consumed by EMDASH before × two-byte sequence | Move × protection BEFORE em dash in fixMojibake |
| "Priya" not redacted | NER missed standalone first name | Component splitting on multi-part detected names |
| Footer date visible | Date after "Date:" label not matched | Labeled-field regex for dates |
| "Facility Contact:" not hidden | Regex only matched "Facility:" | Update to `(?<=\bFacility(?:\s+\w+)?\s*:\s*)` |
| "Medical" redacted | NER split "Swedish Medical Center" → "Medical" | COMMON_WORDS exclusion list |
| "Tokyo" redacted | NER tagged Tokyo as a place | MEDICAL_EPONYMS blocklist |
| "sister" redacted | NER tagged "sister Lara Khoury" as one entity | RELATIONSHIP_WORDS filter in component split |
| CT scan text eaten by address regex | Street regex used /i flag; "Ct" matched "CT" scan | Remove /i from address regex |
| Body name not redacted (markdown input) | Leading space in captured value broke consistency search | Trim regex span values; strip ** markers |
| "Kofi Osei" not redacted | NER doesn't know non-Western names; component expansion only ran on NER output | Move component expansion to detectAndReplace() using ALL layer1+layer2 values |
| Secondary contact names missed | No mechanism to catch names after "daughter/son/wife/..." | Relationship-word name regex |
| ICD chapter wrong for stroke | "stroke" was in Ch6 keywords | Move to Ch9 keywords |
| ICD chapter: Asthma beat DKA | Chapter-first iteration lets comorbidity win | Rewrite to diagnoses-first iteration |

---

## File Structure

```
corti-AI-agent/
├── src/
│   ├── phiDetector.ts      — Three-layer PHI detection + replacement
│   ├── factsExtractor.ts   — Corti agent API call for facts extraction
│   ├── zkRunner.ts         — ICD-10 classification + Groth16 proof generation
│   ├── deidentifier.ts     — Orchestrates phases 1–3, writes output files
│   ├── mcpServer.ts        — MCP server + fixMojibake + Express app
│   ├── config.ts           — Config loader (codename wordlist, API keys)
│   └── circuits/
│       ├── patient.circom  — ZK circuit definition
│       └── build/          — Compiled WASM, zkey, verification key
├── output/                 — One subdirectory per pipeline run
├── scripts/
│   └── build-circuit.sh    — Circom compile + trusted setup automation
├── test_doc.md             — Current test clinical note
├── status_update.txt       — Project status summary
└── implementationguide.md  — This document
```

---

## Running the Pipeline

### Start the MCP Server
```bash
npm run mcp
# or directly:
npx ts-node src/mcpServer.ts
```

### Expose via ngrok
```bash
ngrok http 3456
```

### Test Locally (without console)
```bash
python3 - <<'EOF'
import json, urllib.request
note = "Patient: John Doe\nMRN: 1234567\n..."
payload = {"jsonrpc":"2.0","id":1,"method":"tools/call",
           "params":{"name":"run_pipeline","arguments":{"clinical_note":note}}}
req = urllib.request.Request("http://localhost:3456/mcp",
    data=json.dumps(payload).encode(),
    headers={"Content-Type":"application/json","Accept":"application/json, text/event-stream"})
with urllib.request.urlopen(req, timeout=120) as r:
    print(json.loads(r.read().decode().split("data: ",1)[1])["result"]["content"][0]["text"])
EOF
```

### Health Check
```bash
curl http://localhost:3456/health
# {"status":"ok","server":"corti-zk-pipeline","version":"1.0.0"}
```

---

## Node.js Packages — Full Reference

Every package in `package.json` explained, including why it was chosen and exactly
where in the pipeline it is used.

---

### Production Dependencies (`dependencies`)

#### `@corti/sdk` — `^3.1.0`
**What it is:** The official Corti Agentic Framework JavaScript/TypeScript SDK.  
**Why we use it:** Provides authenticated access to the Corti API for calling the
Corti LLM agent (`154daefe-796a-4e6f-abdb-7811def09b8b`) during Phase 2 facts
extraction. Handles OAuth token acquisition, request signing, tenant routing, and
environment selection (EU vs US).  
**Used in:** `src/factsExtractor.ts`, `src/corti.ts`  
**Key classes:** `CortiClient` — instantiated with client ID, secret, tenant, and
environment from `.env.local`. The client makes REST calls to the Corti agent API
and streams back the structured facts JSON.

---

#### `@modelcontextprotocol/sdk` — `^1.29.0`
**What it is:** The official MCP (Model Context Protocol) TypeScript SDK from
Anthropic.  
**Why we use it:** Provides the `McpServer` class and `StreamableHTTPServerTransport`
needed to expose our pipeline as MCP tools that the Corti console "Add Custom Expert"
feature can call. MCP is the standard protocol for connecting LLM agents to external
tools.  
**Used in:** `src/mcpServer.ts`  
**Key classes:**
- `McpServer` — creates the server, registers tools with `server.tool(name, description, schema, handler)`
- `StreamableHTTPServerTransport` — handles the HTTP POST `/mcp` endpoint in stateless
  mode (a new transport instance per request, no session tracking needed)

---

#### `@types/express` — `^5.0.6`
**What it is:** TypeScript type definitions for the Express framework.  
**Why we use it:** Enables full TypeScript type checking and IntelliSense for
`Request`, `Response`, `NextFunction`, `Application`, and router types when writing
the MCP server's Express handlers.  
**Used in:** `src/mcpServer.ts` (compile-time only — this is a type package, no
runtime code)  
**Note:** Listed under `dependencies` rather than `devDependencies` because
`ts-node` compiles and runs TypeScript at runtime, so type packages must be available
at startup.

---

#### `circomlib` — `^2.0.5`
**What it is:** A standard library of circom 2.0 circuit templates — hash functions,
comparison operators, binary arithmetic, etc.  
**Why we use it:** The ZK circuit (`src/circuits/patient.circom`) uses circomlib
primitives such as `Poseidon` (ZK-friendly hash) and `LessThan` / `IsEqual`
comparators to implement age bracket checking and data commitment inside the circuit.
These templates are audited and battle-tested.  
**Used in:** `src/circuits/patient.circom` (compile-time circuit dependency during
`circom` compilation — not used at Node.js runtime)  
**Key templates:** `Poseidon(n)`, `LessThan(n)`, `IsEqual()`

---

#### `compromise` — `^14.15.1`
**What it is:** A lightweight, fast, offline Natural Language Processing (NLP) library
for English text. Performs named entity recognition (NER), part-of-speech tagging,
and grammatical analysis entirely in-process — no API call required.  
**Why we use it:** Layer 2 of PHI detection. Used to identify person names, organisation
names, and place names in the free-text body of clinical notes. Chosen over cloud NER
services (AWS Comprehend Medical, Azure Text Analytics) because it runs offline,
adds no latency, and avoids sending clinical text to a third-party service before
de-identification is complete.  
**Used in:** `src/phiDetector.ts` — `nerSpans()` function  
**Key methods:**
- `nlp(text).people().out('array')` — extracts person names
- `nlp(text).organizations().out('array')` — extracts organisation names
- `nlp(text).places().out('array')` — extracts place names  
**Limitation:** English-optimised. Non-Western names (Ghanaian, Arabic, South Asian)
are often missed, which is why component expansion and the relationship-word regex
were added as fallback mechanisms.

---

#### `dotenv` — `^16.4.5`
**What it is:** Loads environment variables from a `.env` file into `process.env` at
runtime.  
**Why we use it:** Keeps API keys, client secrets, and configuration out of source
code. The `.env.local` file (not committed to git) holds the Corti credentials, API
keys, and environment selection. `dotenv.config({ path: '.env.local' })` is called
at the top of `src/config.ts` before any API client is initialised.  
**Used in:** `src/config.ts`  
**Without this package:** Every secret would either be hardcoded (security risk) or
passed as shell environment variables (operational friction).

---

#### `express` — `^5.2.1`
**What it is:** The most widely used Node.js HTTP server framework.  
**Why we use it:** The MCP server needs an HTTP server to receive POST requests at
`/mcp` from the Corti console. Express provides routing, middleware, request/response
parsing, and error handling. The `/health` endpoint (used for liveness checks) is
also an Express route.  
**Used in:** `src/mcpServer.ts`  
**Key routes:**
- `POST /mcp` — receives JSON-RPC 2.0 MCP requests from the Corti console agent
- `GET /health` — returns `{"status":"ok"}` for uptime monitoring  
**Version note:** We use Express v5 (release candidate) which has native async/await
error handling and no need for `express-async-errors` wrappers.

---

#### `mammoth` — `^1.8.0`
**What it is:** A library for converting `.docx` (Microsoft Word) files to plain text
or HTML, preserving structural meaning without retaining complex formatting.  
**Why we use it:** Phase 2 of the original pipeline read clinical notes from Word
documents. Mammoth extracts clean text from `.docx` files without the noise of raw
XML parsing.  
**Used in:** `src/pdfReader.ts` (document ingestion phase)  
**Key method:** `mammoth.extractRawText({ path: filePath })` — returns a `{ value }`
object containing the plain text of the document.

---

#### `node-fetch` — `^3.3.2`
**What it is:** A lightweight implementation of the browser `fetch()` API for Node.js.  
**Why we use it:** Makes HTTP requests to the Corti API and any other external REST
endpoints. Used alongside `@corti/sdk` for lower-level API calls where the SDK does
not provide a direct method.  
**Used in:** `src/factsExtractor.ts`, `src/corti.ts`  
**Version note:** v3+ is ESM-only. The project uses `ts-node` which handles this
transparently, but a CommonJS project would need v2 or a dynamic `import()`.

---

#### `pdf-parse` — `^1.1.1`
**What it is:** Extracts plain text content from PDF files using Mozilla's PDF.js
under the hood.  
**Why we use it:** Some clinical notes arrive as PDF documents rather than Word files.
`pdf-parse` gives us a consistent text string from any PDF without spawning an
external process.  
**Used in:** `src/pdfReader.ts`  
**Key method:** `pdfParse(dataBuffer)` — returns `{ text, numpages, info }`.

---

#### `snarkjs` — `^0.7.5`
**What it is:** A JavaScript/WebAssembly implementation of the Groth16 and PLONK
zero-knowledge proof systems over the BN128 (alt-bn128) elliptic curve, developed
by the iden3 team.  
**Why we use it:** Generates and verifies Groth16 ZK proofs entirely in Node.js
without any external binary dependency. Takes the compiled circuit WASM and proving
key (`.zkey`) as inputs, runs the witness computation, and produces a proof in
~15–20 seconds.  
**Used in:** `src/zkRunner.ts`  
**Key methods:**
- `snarkjs.groth16.fullProve(input, wasmPath, zkeyPath)` — computes witness and proof
- `snarkjs.groth16.verify(vkey, publicSignals, proof)` — verifies the proof locally
- Public signals returned: `[ageBracketLow, ageBracketHigh, icdChapter, dataCommitment]`

---

### Development Dependencies (`devDependencies`)

#### `@types/node` — `^20.17.0`
**What it is:** TypeScript type definitions for the Node.js standard library.  
**Why we use it:** Provides types for built-in Node.js modules: `fs`, `path`,
`crypto`, `Buffer`, `process`, `http`, etc. Without this, TypeScript would not know
the shape of `fs.readFileSync`, `crypto.createHash`, `Buffer.from`, and so on.  
**Used in:** Across all `.ts` source files (compile-time only).

---

#### `@types/pdf-parse` — `^1.1.4`
**What it is:** TypeScript type definitions for the `pdf-parse` package, which ships
without its own types.  
**Why we use it:** Enables TypeScript to type-check calls to `pdfParse()` and the
shape of its return value (`{ text, numpages, info, metadata }`).  
**Used in:** `src/pdfReader.ts` (compile-time only).

---

#### `ts-node` — `^10.9.2`
**What it is:** A TypeScript execution engine for Node.js. Compiles and runs `.ts`
files on the fly without a separate `tsc` build step.  
**Why we use it:** All pipeline scripts are run directly as TypeScript during
development (`npx ts-node src/mcpServer.ts`). This removes the compile → run cycle,
making iteration fast. In production you would compile to JS first (`npm run build`)
and run from `dist/`.  
**Used in:** All `npm run` scripts in `package.json`.  
**How it works:** Hooks into Node's `require()` to intercept `.ts` file imports,
runs them through the TypeScript compiler in memory, and executes the result.

---

#### `typescript` — `^5.6.3`
**What it is:** The TypeScript compiler (`tsc`).  
**Why we use it:** Provides static type checking, interfaces, generics, and modern
JavaScript features (async/await, optional chaining, nullish coalescing) with
compile-time safety. All source files are `.ts`.  
**Used in:** Compile-time via `tsc` (for `npm run build`) and by `ts-node` at
runtime.  
**Config:** `tsconfig.json` — sets `target: ES2020`, `module: CommonJS`,
`strict: true`, `outDir: dist/`.

---

### External Tool — circom (not a Node package)

**What it is:** A domain-specific language and compiler for writing arithmetic
circuits for zero-knowledge proofs. Separate from the Node.js ecosystem — installed
globally as a Rust binary.  
**Why we use it:** The ZK circuit (`src/circuits/patient.circom`) is written in
circom 2.0 syntax. `circom` compiles it to:
- A `.r1cs` file (rank-1 constraint system) — the mathematical representation
- A `.wasm` file — the witness calculator run by snarkjs at proof generation time
- A `.sym` file — symbol table for debugging  
**Install:** `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh && cargo install circom`  
**Used in:** `scripts/build-circuit.sh` (one-time circuit build, not runtime).

---

### External Tool — ngrok (not a Node package)

**What it is:** A reverse proxy / tunnelling service that creates a public HTTPS URL
pointing to a local port.  
**Why we use it:** The Corti console agent calls our MCP server from Corti's cloud
infrastructure. The server needs to be reachable from the internet. ngrok tunnels
`https://<subdomain>.ngrok-free.dev` → `http://localhost:3456`.  
**Install:** `npm install -g ngrok` or `snap install ngrok`  
**Usage:** `ngrok http 3456` — outputs the public URL to paste into the Corti
"Add Custom Expert" form.

---

## Environment Variables (`.env.local`)

The project uses a `.env.local` file (not committed to git — add to `.gitignore`).
`dotenv` loads it at startup via `dotenv.config({ path: '.env.local' })` in
`src/config.ts`.

```
# ── Corti Agentic Framework ─────────────────────────────────────────────────

CORTI_CLIENT_ID=<your-client-id>
# The OAuth client ID for your Corti workspace. Found in the Corti developer
# console under Settings → API Credentials. Used by @corti/sdk to obtain an
# access token before making API calls.

CORTI_CLIENT_SECRET=<your-client-secret>
# The OAuth client secret paired with CORTI_CLIENT_ID. Keep this private —
# anyone with this value can authenticate as your workspace.

CORTI_TENANT_NAME=<your-tenant>
# Your Corti tenant/organisation name (e.g. "base", "acme-health"). Determines
# which workspace the SDK connects to. Found in your Corti console URL:
# https://<tenant>.corti.ai/...

CORTI_ENVIRONMENT=eu
# The Corti deployment region. Options: "eu" (European servers) or "us"
# (US servers). Determines the base API URL the SDK sends requests to.
# Use "eu" if your Corti account is on the European instance.

# ── Optional LLM Fallbacks ──────────────────────────────────────────────────

GROQ_API_KEY=<your-groq-api-key>
# API key for Groq Cloud (https://console.groq.com). Groq provides very fast
# inference for open-source models (Llama 3, Mixtral, Gemma). Used as a fallback
# facts-extraction LLM when the Corti agent API is unavailable or for local
# testing without Corti credentials. Free tier available.

OPENROUTER_API_KEY=<your-openrouter-api-key>
# API key for OpenRouter (https://openrouter.ai). OpenRouter is a unified API
# gateway that provides access to many LLMs (GPT-4o, Claude, Gemini, Mistral,
# etc.) through a single OpenAI-compatible endpoint. Used as a secondary fallback
# for facts extraction and for development testing with different models.
```

### How Variables Are Loaded

`src/config.ts` calls `dotenv.config({ path: '.env.local' })` at the top, then
reads `process.env` values:

```typescript
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

export const config = {
  corti: {
    clientId:     process.env.CORTI_CLIENT_ID!,
    clientSecret: process.env.CORTI_CLIENT_SECRET!,
    tenant:       process.env.CORTI_TENANT_NAME!,
    environment:  process.env.CORTI_ENVIRONMENT ?? 'eu',
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY,
  },
  openRouter: {
    apiKey: process.env.OPENROUTER_API_KEY,
  },
};
```

The `!` non-null assertion on required fields causes a runtime error with a clear
message if a required variable is missing, rather than a cryptic downstream failure.

### Security Notes
- Never commit `.env.local` to git. Add it to `.gitignore`.
- Rotate `CORTI_CLIENT_SECRET` immediately if it is ever exposed in logs or version
  control history.
- For production deployment, inject secrets via the hosting platform's secrets
  manager (e.g. AWS Secrets Manager, Railway environment variables, Fly.io secrets)
  rather than a file on disk.

---

## npm Scripts Reference

```
npm run build       — Compile TypeScript to JavaScript in dist/
                      Uses tsc with settings from tsconfig.json.
                      Run this before deploying to production.

npm run mcp         — Start the MCP server (port 3456).
                      This is the main entry point for the Corti integration.
                      Equivalent to: npx ts-node src/mcpServer.ts

npm run deidentify  — Run the de-identification pipeline on a note file.
                      Equivalent to: npx ts-node src/deidentifier.ts

npm run zk:prove    — Run ZK proof generation on an existing output directory.
                      Equivalent to: npx ts-node src/zkRunner.ts --output-dir output/<id>

npm run run         — Run the full orchestrator (all phases in sequence).
                      Equivalent to: npx ts-node src/orchestrator.ts

npm run phase1      — Run only the Corti agent interaction phase.
                      Equivalent to: npx ts-node src/corti.ts

npm run phase2      — Run only the document reader (PDF/DOCX extraction).
                      Equivalent to: npx ts-node src/pdfReader.ts
```

---

## What's Next

When Corti ships the A2A (Agent-to-Agent) and Direct Expert API features, the MCP
server can be pointed to directly from agent-to-agent calls with zero rework — the
tool interface is already well-defined. For now, the MCP expert integration through
the console UI is the correct and only available path.

Suggested next steps:
- Automated regression test suite covering all 7 clinical scenarios
- Batch endpoint for multiple notes in one request
- Persistent audit trail with proof verification history
- Dashboard UI for reviewing anonymized bundles
- Swap compromise.js NER for a medical-domain NER model (e.g. medspaCy) for
  better coverage of non-Western names and clinical entity types
