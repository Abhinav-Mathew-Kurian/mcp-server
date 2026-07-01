# Corti AI Agent — Architecture Document

## Project Goal

Build a **TypeScript/Node.js pipeline** that:
1. Ingests patient records from PDF or other documents
2. Uses the **Corti Agentic Framework** to de-identify (strip PHI) and extract structured clinical facts
3. Runs a **ZK (Zero-Knowledge) circuit** on the extracted facts to generate a cryptographic proof — proving properties about the patient data (e.g. age range, diagnosis category) **without ever revealing the underlying data**
4. Implements **patient-controlled re-identification** — only the patient (holding their secret key) can reverse the anonymization. Not us, not the hospital, not Corti.

The pipeline is fully autonomous: drop in a document, get back anonymized structured data + a verifiable ZK proof + an encrypted PHI map that only the patient can unlock.

---

## Why This Stack

| Concern | Choice | Reason |
|---|---|---|
| Agent orchestration | Corti Agentic Framework | Healthcare-specialized LLM agents, built-in PHI handling, expert registry |
| Language | TypeScript (Node.js) | Official Corti JS SDK, snarkjs is native JS, circom WASM runs in Node |
| ZK proofs | Circom + snarkjs | Industry standard (zkSync, Polygon use it), Groth16 proofs, already installed, small proof size (~200 bytes) |
| PDF ingestion | pdfjs-dist / pdf-parse | Pure JS, no subprocess needed |
| Auth | OAuth2 client credentials | Corti uses Keycloak; token endpoint confirmed working |

---

## Confirmed Working (Already Tested)

- **Auth endpoint**: `POST https://auth.eu.corti.app/realms/base/protocol/openid-connect/token`
- **Agent creation**: `POST https://api.eu.corti.app/agents` — returns agent `id`
- **Message send**: `POST https://api.eu.corti.app/agents/{id}/v1/message:send` — returns full agent response with artifacts
- **Expert registry**: `GET https://api.eu.corti.app/agents/registry/experts` — 13 experts available
- **Facts extraction**: `POST https://api.eu.corti.app/facts/extract` — available in scope
- **Circom**: installed at system level
- **snarkjs**: installed at system level (`~/.nvm/versions/node/v22.14.0/bin/snarkjs`)

### Environment Variables (`.env.local`)
```
CORTI_CLIENT_ID=zkip-default_client
CORTI_CLIENT_SECRET=vSsRTbl2WJcSPmDnVN3EnWF6cyb3YYKi
CORTI_TENANT_NAME=base
CORTI_ENVIRONMENT=eu
```

### Derived Constants
```
CORTI_AUTH_URL   = https://auth.eu.corti.app/realms/base/protocol/openid-connect/token
CORTI_API_BASE   = https://api.eu.corti.app
```

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         orchestrator.ts                              │
│                  (top-level pipeline driver)                         │
└────┬────────────────┬──────────────────────┬────────────────────────┘
     │                │                      │
     ▼                ▼                      ▼
┌──────────┐   ┌─────────────────┐   ┌─────────────────┐
│pdfReader │   │  deidentifier   │   │    zkRunner     │
│  .ts     │   │     .ts         │   │      .ts        │
│          │   │                 │   │                 │
│PDF/DOCX  │   │ Corti Agent     │   │ Circom circuit  │
│→ raw     │   │ (LLM de-id +    │   │ + snarkjs       │
│  text    │   │  fact extract)  │   │ → ZK proof      │
└──────────┘   └────────┬────────┘   └─────────────────┘
                        │
               ┌────────▼────────┐
               │   corti.ts      │
               │  (SDK wrapper)  │
               │                 │
               │ - token refresh │
               │ - agent CRUD    │
               │ - send message  │
               │ - facts API     │
               └─────────────────┘
                        │
               ┌────────▼──────────────────────────┐
               │        Corti Cloud (EU)            │
               │                                    │
               │  Orchestrator Agent                │
               │    ├── memory-expert               │
               │    ├── coding-expert (ICD-10)      │
               │    └── (custom de-id system prompt)│
               └────────────────────────────────────┘
```

---

## Data Flow (Step by Step)

```
INPUT: patient_record.pdf
         │
         ▼
[Step 1] pdfReader.ts
         │  Uses: pdf-parse npm package
         │  Output: raw text string
         │
         ▼
[Step 2] deidentifier.ts  ──────────────►  Corti Agent API
         │                                  - System prompt: strict PHI removal
         │                                  - Replaces: names, DOB, SSN, MRN,
         │  Output A: anonymized_text         addresses, phone, email, NPI
         │  Output B: phi_map (original ↔ placeholder)
         │  Output C: structured clinical facts (JSON)
         │
         ▼
[Step 3] zkRunner.ts
         │  Input: structured_facts (from Step 2 Output C)
         │  Circuit: src/circuits/patient.circom
         │  Proves:
         │    - patient age is within a declared range
         │    - diagnosis belongs to a declared ICD category
         │    - record was processed by our de-id pipeline (commitment hash)
         │  Output: { proof, publicSignals, verificationKey }
         │
         ▼
OUTPUT:
  {
    anonymizedText: string,       // PHI-free document text
    facts: ClinicalFacts,         // structured extracted data
    zkProof: {
      proof: object,              // Groth16 proof (~200 bytes)
      publicSignals: string[],    // what the proof attests to
      verificationKey: object     // anyone can verify with this
    }
  }
```

---

## Component Details

### 1. `src/corti.ts` — Corti API Client

**Responsibility**: All communication with the Corti cloud. Handles token lifecycle and exposes clean async methods.

**Key methods**:
```typescript
class CortiClient {
  // Auth
  async getToken(): Promise<string>          // client_credentials OAuth2 flow, auto-refresh

  // Agent lifecycle
  async createAgent(config: AgentConfig): Promise<string>      // returns agentId
  async getAgent(agentId: string): Promise<Agent>
  async deleteAgent(agentId: string): Promise<void>

  // Messaging (A2A protocol)
  async sendMessage(agentId: string, text: string, contextId?: string): Promise<AgentResponse>
  // Returns: { text, contextId, taskId, facts?, artifacts? }

  // Facts API
  async extractFacts(text: string): Promise<ClinicalFact[]>
}
```

**Token strategy**: fetch on first call, cache in memory, refresh when `exp - now < 60s`.

**Agent strategy**: create once on startup, reuse across pipeline runs via stored `agentId`. If agent exists in `.agent-state.json`, reuse it; otherwise create fresh.

---

### 2. `src/pdfReader.ts` — Document Ingestion

**Responsibility**: Extract raw text from PDF, DOCX, or plain text files.

**Key methods**:
```typescript
async function readDocument(filePath: string): Promise<string>
// Detects file type by extension, routes to correct parser
// .pdf  → pdf-parse
// .docx → mammoth
// .txt  → fs.readFile
// Returns: plain text string (preserves paragraph structure)
```

**Dependencies**: `pdf-parse`, `mammoth`

---

### 3. `src/deidentifier.ts` — PHI Removal + Fact Extraction

**Responsibility**: The core intelligence layer. Takes raw clinical text and returns anonymized version + structured clinical facts.

**Two-phase approach**:

**Phase A — De-identification via Corti Agent**

Creates a Corti agent with a strict de-identification system prompt:

```
System prompt:
"You are a clinical data de-identification specialist.
Your ONLY job is to:
1. Identify all PHI in the input text: patient names, dates of birth,
   ages, SSNs, MRNs, addresses, phone numbers, email addresses, device
   identifiers, geographic subdivisions, and any other HIPAA-defined
   identifiers.
2. Replace each PHI token with a bracketed placeholder:
   [PATIENT_NAME], [DOB], [SSN], [MRN], [ADDRESS], [PHONE], [AGE], etc.
3. Return a JSON response with:
   {
     'anonymizedText': '<full text with placeholders>',
     'phiMap': { '[PATIENT_NAME]': 'John Smith', '[DOB]': '12/03/1980', ... }
   }
Do not summarize, do not add commentary. Return only the JSON."
```

**Phase B — Fact Extraction via Corti Facts API**

Calls `POST /facts/extract` with the **anonymized** text (PHI already removed).

Returns structured clinical facts:
```typescript
interface ClinicalFacts {
  diagnoses: string[]        // e.g. ["chest pain", "hypertension"]
  icdCodes?: string[]        // if coding-expert is active
  vitals: {
    bloodPressure?: string
    heartRate?: number
    temperature?: number
    weight?: number
    height?: number
  }
  medications: string[]
  ageRange?: string          // derived: "40-50" not exact age
  sex?: string
  chiefComplaint?: string
}
```

**Key rule**: `extractFacts()` is always called on **anonymized text only**. Raw PHI never touches the facts API.

---

### 4. `src/zkRunner.ts` — Zero-Knowledge Proof

**Responsibility**: Take structured clinical facts and generate a ZK proof attesting to properties of the data without revealing the data itself.

**What we prove (public signals)**:
1. Patient age falls within a declared 10-year range (e.g. `ageRange = 40`)
2. Primary diagnosis belongs to a declared ICD chapter (e.g. chapter `IX = Circulatory`)
3. A hash commitment to the full facts object — proves data integrity / that de-id ran

**What stays private (witness)**:
- Exact age
- Exact diagnosis string
- Full facts JSON
- PHI map

**Circuit**: `src/circuits/patient.circom`

```circom
pragma circom 2.0.0;

include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/poseidon.circom";

template PatientProof() {
    // Private inputs (witness — never revealed)
    signal input exactAge;
    signal input diagnosisCode;     // encoded as integer
    signal input factsHash;         // Poseidon hash of full facts JSON

    // Public inputs (what the verifier sees)
    signal input ageRangeLow;       // e.g. 40
    signal input ageRangeHigh;      // e.g. 50
    signal input icdChapter;        // e.g. 9 (Circulatory system)
    signal input commitment;        // = Poseidon(factsHash, salt)

    // Constraint 1: age is within declared range
    component gteLow  = GreaterEqThan(8);
    component lteHigh = LessEqThan(8);
    gteLow.in[0]  <== exactAge;
    gteLow.in[1]  <== ageRangeLow;
    lteHigh.in[0] <== exactAge;
    lteHigh.in[1] <== ageRangeHigh;
    gteLow.out  === 1;
    lteHigh.out === 1;

    // Constraint 2: diagnosis belongs to declared ICD chapter
    component chapterCheck = LessEqThan(16);
    // ICD chapter membership encoded as integer range
    chapterCheck.in[0] <== diagnosisCode / 1000;
    chapterCheck.in[1] <== icdChapter;
    chapterCheck.out === 1;

    // Constraint 3: commitment matches facts hash
    component poseidon = Poseidon(1);
    poseidon.inputs[0] <== factsHash;
    commitment === poseidon.out;
}

component main { public [ageRangeLow, ageRangeHigh, icdChapter, commitment] } = PatientProof();
```

**Key methods**:
```typescript
async function setupCircuit(): Promise<void>
// First-time only: compile .circom → .wasm + .zkey (Powers of Tau ceremony)
// Artifacts saved to src/circuits/build/

async function generateProof(facts: ClinicalFacts): Promise<ZKProof>
// Encodes facts into circuit inputs
// Calls snarkjs.groth16.fullProve(input, wasm, zkey)
// Returns { proof, publicSignals, verificationKey }

async function verifyProof(zkProof: ZKProof): Promise<boolean>
// Calls snarkjs.groth16.verify(vKey, publicSignals, proof)
// Anyone can call this — no private data needed
```

**Proof artifacts** (saved per run):
```
output/
└── {timestamp}/
    ├── proof.json           # the ZK proof (~200 bytes)
    ├── public_signals.json  # what's being attested
    ├── verification_key.json
    └── facts_summary.json   # anonymized facts (NO PHI)
```

---

### 5. `src/orchestrator.ts` — Pipeline Driver

**Responsibility**: Wire everything together. Entry point for the application.

```typescript
async function run(inputPath: string): Promise<PipelineResult> {
  // 1. Read document
  const rawText = await readDocument(inputPath)

  // 2. De-identify + extract facts
  const { anonymizedText, phiMap, facts } = await deidentify(rawText)

  // 3. Generate ZK proof
  const zkProof = await generateProof(facts)

  // 4. Verify proof (sanity check)
  const valid = await verifyProof(zkProof)
  if (!valid) throw new Error("ZK proof verification failed")

  // 5. Save outputs
  await saveOutputs({ anonymizedText, facts, zkProof })

  return { anonymizedText, facts, zkProof, valid }
}
```

**CLI usage**:
```bash
npx ts-node src/orchestrator.ts --input ./samples/patient.pdf
npx ts-node src/orchestrator.ts --input ./samples/patient.pdf --verify-only ./output/2026-06-26/proof.json
```

---

## Full File Structure

```
corti-AI-agent/
│
├── .env.local                    # credentials — never committed (CORTI_CLIENT_ID etc.)
├── config.json                   # behaviour config — no secrets, fully editable
├── .gitignore
├── package.json
├── tsconfig.json
├── architecture.md               # this document
│
├── src/
│   ├── config.ts                 # loads + validates config.json
│   ├── corti.ts                  # Corti API client (token, agent, message, facts)
│   ├── pdfReader.ts              # PDF / DOCX / TXT → plain text + chunker
│   ├── deidentifier.ts           # PHI removal (Corti LLM) + encrypt phiMap + commitment
│   ├── reidentify.ts             # patient-only: decrypt phiMap → restore original
│   ├── zkRunner.ts               # ZK proof generation + verification (snarkjs)
│   ├── orchestrator.ts           # CLI entrypoint — wires all phases
│   └── circuits/
│       ├── patient.circom        # ZK circuit definition
│       └── build/                # compiled artifacts (gitignored)
│           ├── patient.wasm
│           ├── patient.zkey
│           └── verification_key.json
│
├── output/                       # run outputs — gitignored
│   └── {timestamp}/
│       ├── anonymized.txt        # PHI-free text (Phase 1)
│       ├── facts.json            # structured clinical facts (Phase 1)
│       ├── phi_map.enc           # AES-encrypted PHI map, patient-only (Phase 1)
│       ├── patient_key.b64       # patient secret S — stub (Phase 1)
│       ├── commitment.json       # Poseidon commitment (Phase 1)
│       ├── proof.json            # Groth16 ZK proof (Phase 2)
│       ├── public_signals.json   # public proof signals (Phase 2)
│       └── verification_key.json # anyone can verify (Phase 2)
│
├── samples/                      # synthetic test inputs — no real PHI
│   └── patient_sample.txt
│
└── .agent-state.json             # persisted Corti agentId — gitignored
```

---

## Corti Agent Configuration

### De-identification Agent
```json
{
  "name": "phi-deidentifier",
  "description": "Removes all PHI from clinical text and returns structured anonymized output",
  "agentType": "orchestrator",
  "systemPrompt": "You are a clinical data de-identification specialist. Replace all PHI with bracketed placeholders and return structured JSON with anonymizedText and phiMap.",
  "experts": []
}
```

### (Optional) Coding Agent
If ICD code extraction is needed, add `coding-expert-icd-10-cm` as a registry expert to the agent. The JWT already has `codes:read` and `codes:write` scopes.

---

## API Endpoints Used

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `https://auth.eu.corti.app/realms/base/protocol/openid-connect/token` | Get OAuth2 bearer token |
| `GET`  | `https://api.eu.corti.app/agents` | List existing agents |
| `POST` | `https://api.eu.corti.app/agents` | Create de-id agent |
| `POST` | `https://api.eu.corti.app/agents/{id}/v1/message:send` | Send text for de-identification |
| `POST` | `https://api.eu.corti.app/facts/extract` | Extract structured clinical facts |
| `GET`  | `https://api.eu.corti.app/agents/registry/experts` | Browse available experts |

**Required headers on every API call**:
```
Authorization: Bearer {token}
Tenant-Name: base
Content-Type: application/json
```

---

## How Corti De-identification Works

We do **not** use simple regex or rule-based stripping. We use a Corti LLM agent with a strict system prompt. Here is why this matters:

| Method | How it works | Problem |
|---|---|---|
| Regex / rule-based | Pattern match SSN, phone, dates | Misses context-dependent PHI in prose ("John came in Tuesday the 3rd") |
| NER model | ML labels tokens as PERSON, DATE, etc. | Misses indirect identifiers, needs domain fine-tuning |
| **LLM agent (ours)** | Reads full clinical note in context | Catches everything including indirect identifiers, implicit ages, facility names mid-sentence |

The agent replaces every PHI token with a bracketed placeholder and returns both the clean text and a `phiMap`:

```
Input:  "John Smith (DOB 12/03/1980) presented to Dr. Garcia at Mass General..."
Output: "[PATIENT_NAME] (DOB [DOB]) presented to [PROVIDER_NAME] at [FACILITY_NAME]..."

phiMap: {
  "[PATIENT_NAME]": "John Smith",
  "[DOB]":          "12/03/1980",
  "[PROVIDER_NAME]":"Dr. Garcia",
  "[FACILITY_NAME]":"Mass General"
}
```

**Key rule**: the `phiMap` is immediately encrypted with the patient's secret before it is stored anywhere. It never persists in plaintext.

---

## Patient-Controlled Re-identification (Self-Sovereign Identity Pattern)

Only the patient can re-identify their own data. This is enforced cryptographically — not by policy.

### How it works

```
ENROLLMENT (once per patient, before pipeline runs)
────────────────────────────────────────────────────
Patient generates (or provides) a secret S
  e.g. derived from password + biometric, or a hardware token
  S never leaves the patient's device / custody

PIPELINE (runs per document)
─────────────────────────────
PDF
 │
 ▼
rawText
 │
 ▼
[Corti de-id agent]
 │
 ├─► anonymizedText          (stored publicly — safe to share)
 │
 └─► phiMap (raw)
          │
          ├─► commitment      = Poseidon(facts, S)    (stored publicly)
          │                     ZK-provable, ties patient to record
          │
          └─► encryptedPHIMap = AES-256-GCM(phiMap, S) (stored with record)
                                Only S can decrypt this

RE-IDENTIFICATION (patient-only flow)
──────────────────────────────────────
Patient presents S
  │
  ├─► Generates ZK proof: "I know S such that Poseidon(facts, S) = commitment"
  │     → proves ownership without revealing S to anyone
  │
  └─► Decrypts: AES-256-GCM.decrypt(encryptedPHIMap, S)
        → recovers full phiMap
        → substitutes placeholders back → original document restored
```

### Security properties

| Threat | Protected? | How |
|---|:-:|---|
| Database breach (anonymized records stolen) | ✅ | `anonymizedText` has no PHI |
| `encryptedPHIMap` stolen | ✅ | AES-256-GCM; useless without `S` |
| We (the pipeline operator) re-identify | ✅ | We never see or store `S` |
| Hospital re-identifies without consent | ✅ | They never have `S` |
| Patient impersonation | ✅ | ZK proof of commitment required before decryption allowed |
| Patient loses `S` | ❌ | Data is permanently inaccessible — patient must keep `S` safe (backup to hardware key / paper) |

### What `S` looks like in practice

```typescript
// Option 1: Patient-generated keypair (most secure)
S = crypto.randomBytes(32)   // patient stores this as their "health key"

// Option 2: Derived from patient credentials (more convenient)
S = scrypt(password + patientId + salt, N=2^15, r=8, p=1)

// Option 3: Hardware token (most secure, production-grade)
S = HMAC-SHA256(hardwareToken.sign(patientId), appSecret)
```

For Phase 1 we use Option 1 (random key). Options 2 and 3 are Phase 6 hardening.

---

## ZK Proof: What Gets Proven vs What Stays Private

| Data | Public (in proof) | Private (never leaves machine) |
|------|:-----------------:|:------------------------------:|
| Patient name | — | ✅ in `encryptedPHIMap` |
| Date of birth | — | ✅ in `encryptedPHIMap` |
| Exact age | — | ✅ in circuit witness |
| **Age range (e.g. 40–50)** | ✅ proven | — |
| SSN / MRN | — | ✅ in `encryptedPHIMap` |
| Specific diagnosis | — | ✅ in circuit witness |
| **Diagnosis ICD chapter** | ✅ proven | — |
| **Data integrity commitment** | ✅ proven | — |
| **De-id pipeline ran** | ✅ proven | — |
| Patient secret `S` | — | ✅ never leaves patient device |
| `phiMap` (raw) | — | ✅ AES-encrypted, patient-only |

A hospital, insurer, or researcher can **verify the proof** and learn:
- "This patient is in the 40–50 age range"
- "This patient has a circulatory system diagnosis"
- "This exact data was processed by our certified pipeline"
- "The patient who owns secret `S` authorized this record"

...without ever seeing the actual patient data or the PHI map.

The patient can re-identify at any time by presenting their secret `S` and receiving their full original document back.

---

## Implementation Phases

### Phase 1 — Foundation
Build the project skeleton, config system, and Corti API client. Nothing is hardcoded — all behaviour flows from `config.json`.

- [ ] `package.json` — dependencies: dotenv, pdf-parse, mammoth, snarkjs, node-fetch
- [ ] `tsconfig.json`
- [ ] `config.json` — controls PHI categories, agent name/prompt, output dir, chunk size/overlap, encryption algo. No secrets (those stay in `.env.local`)
- [ ] `src/config.ts` — loads + validates `config.json` at startup; throws on missing/invalid fields
- [ ] `src/corti.ts` — Corti API client: OAuth2 token fetch, agent create/reuse via `.agent-state.json`, `sendMessage`, `deleteAgent`
- [ ] `.agent-state.json` (gitignored) — persists `agentId` so the same Corti agent is reused across runs
- [ ] Smoke test: `npx ts-node src/corti.ts` → creates agent, sends "Hello", prints response, confirms agent reuse on second run

### Phase 2 — Document Ingestion
Read patient documents from disk into plain text ready for de-identification.

- [ ] `src/pdfReader.ts` — supports `.pdf` (pdf-parse), `.docx` (mammoth), `.txt` (fs). Chunks large docs at `config.deidentification.chunkSize` chars with `chunkOverlap` overlap so PHI at chunk boundaries is never missed
- [ ] `samples/patient_sample.txt` — synthetic clinical note with **fake** PHI only (no real patient data)
- [ ] Smoke test: `npx ts-node src/pdfReader.ts --input samples/patient_sample.txt` → prints extracted text and chunk count

### Phase 3 — De-identification + Patient Re-identification
Core intelligence layer. Corti LLM agent (configured via `config.json`) strips all PHI. The encrypted PHI map ensures **only the patient can reverse anonymization** — not us, not Corti, not the hospital.

- [ ] `src/deidentifier.ts`:
  - Sends each text chunk to Corti agent with de-id system prompt from `config.json`
  - LLM replaces PHI with bracketed placeholders (categories from `config.deidentification.phiCategories`)
  - Second-pass regex sweep if `config.deidentification.secondPassRegex: true` — catches any missed SSNs/phones/dates
  - Queries agent with memory-expert in-context to extract `facts.json` from anonymized text (replaces dead `/facts/extract` endpoint — confirmed 404, see `api-verification-report.md`)
  - Generates patient secret `S = crypto.randomBytes(32)` **[Phase 1 stub — Phase 6 replaces with patient-provided scrypt-derived key]**
  - Computes `commitment = Poseidon(facts, S)` — anchors Phase 4 ZK proof to this patient + this data
  - Encrypts phiMap → `phi_map.enc` with AES-256-GCM keyed on S
  - Saves `patient_key.b64` (stub S) — in production never stored server-side, goes to patient only
- [ ] `src/reidentify.ts` — patient-only re-identification:
  - Accepts `--output-dir` (prior run folder) and `--key` (patient's base64 S)
  - Verifies `Poseidon(facts, S) === commitment.json` — proves key belongs to this record
  - Decrypts `phi_map.enc` with S → recovers phiMap
  - Substitutes placeholders back into `anonymized.txt` → restores original document
- [ ] Smoke test: de-id on `patient_sample.txt`, confirm zero PHI in output, re-identify with generated key, confirm original restored

**Phase 3 outputs (per run):**
```
output/{timestamp}/
├── anonymized.txt       ← PHI-free document (safe to share)
├── facts.json           ← structured clinical facts (feeds Phase 4)
├── phi_map.enc          ← AES-256-GCM encrypted PHI map — patient-only
├── patient_key.b64      ← patient secret S [STUB]
└── commitment.json      ← Poseidon(facts, S)
```

### Phase 4 — ZK Circuit
Generate a Groth16 ZK proof attesting to patient data properties without revealing underlying data.

- [ ] `src/circuits/patient.circom` — proves: (1) age within declared 10-year range, (2) diagnosis in declared ICD chapter, (3) Poseidon commitment matches facts + S
- [ ] Circuit compilation: `circom patient.circom --r1cs --wasm --sym`
- [ ] Trusted setup: local Powers of Tau ceremony → `patient.zkey` + `verification_key.json` **[Phase 6: replace with Hermez audited ceremony]**
- [ ] `src/zkRunner.ts` — `generateProof(facts, commitment, S)` via `snarkjs.groth16.fullProve`, `verifyProof()` via `snarkjs.groth16.verify`
- [ ] Smoke test: generate proof from `facts.json` + `commitment.json` → `proof.json`, verify returns VALID

**Phase 4 outputs (added to run folder):**
```
output/{timestamp}/
├── ...                       (Phase 3 outputs)
├── proof.json                ← Groth16 proof (~200 bytes)
├── public_signals.json       ← age range, ICD chapter, commitment (public)
└── verification_key.json     ← anyone can verify, no private data needed
```

### Phase 5 — Orchestration + CLI
Single entrypoint wiring all phases into one command.

- [ ] `src/orchestrator.ts` — runs: readDocument → deidentify → generateProof → verifyProof → saveOutputs
- [ ] CLI flags: `--input <file>`, `--output-dir <dir>`, `--verify-only <proof.json>`, `--reidentify <output-dir> --key <S>`
- [ ] Batch mode: `--input-dir <dir>` processes all supported files sequentially
- [ ] Exit codes: `0` success, `1` PHI found in output (safety fail), `2` ZK proof invalid
- [ ] End-to-end test: `patient_sample.txt` → anonymized + proof → verify VALID → re-identify → original restored

### Phase 6 — Hardening (later)
- [ ] Token auto-refresh: re-fetch when `exp - now < 60s`
- [ ] Retry wrapper: exponential backoff (100ms → 200ms → 400ms, max 3) on all Corti API calls
- [ ] Real patient key management: `S = scrypt(password + patientId + salt)` instead of random bytes
- [ ] Add `coding-expert-icd-10-cm` to agent for auto ICD-10 code enrichment in ZK proof
- [ ] DrugBank bearer token via MCP auth DataPart; PubMed retry logic for 429s
- [ ] Hermez Powers of Tau trusted setup (publicly audited) replacing local ceremony
- [ ] On-chain verifier: Solidity contract via `snarkjs export solidityverifier` for blockchain anchoring

---

## Dependencies (`package.json`)

```json
{
  "dependencies": {
    "dotenv": "^16.0.0",
    "pdf-parse": "^1.1.1",
    "mammoth": "^1.6.0",
    "snarkjs": "^0.7.0",
    "node-fetch": "^3.3.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0",
    "ts-node": "^10.9.0"
  }
}
```

> **Note**: The official `@corti/agentic` SDK is not yet used — we call the REST API directly via `node-fetch`. This keeps dependencies minimal and gives full control. The SDK can be swapped in later.

---

## Open Questions / Decisions for Later

1. **On-chain anchoring**: Should the ZK proof be posted to a blockchain (Ethereum, Polygon) for immutable audit trail? Requires a Solidity verifier contract generated by snarkjs.
2. **Batch processing**: Pipeline currently processes one document at a time. Batch mode (directory of PDFs) is a Phase 6 concern.
3. **ICD coding**: The `coding-expert-icd-10-cm` expert can auto-assign ICD-10 codes. Adding it to the agent will enrich the ZK proof with coded diagnoses.
4. **PHI map storage**: Currently the `phiMap` (original ↔ placeholder mapping) is held in memory and discarded. If re-identification is ever needed (authorized use), it needs encrypted secure storage.
5. **Circuit trusted setup**: Phase 4 uses a local Powers of Tau ceremony. For production, should use the Hermez or Perpetual Powers of Tau ceremony (already publicly audited).
