# Phase 2 Summary — Document Ingestion
**Completed**: 2026-06-26  
**Status**: ✅ PASSED

---

## What Was Built

| File | Purpose |
|------|---------|
| `src/pdfReader.ts` | Reads `.pdf`, `.docx`, `.txt` files → plain text. Chunks large documents with configurable size + overlap. |
| `samples/patient_sample.txt` | Synthetic clinical note with **fake** PHI only. Used for all downstream smoke tests. |

---

## How the Reader Works

```
readDocument(filePath)
  │
  ├── detect extension (.pdf / .docx / .txt)
  ├── extract raw text using the right parser
  │     .pdf  → pdf-parse   (handles text-layer PDFs)
  │     .docx → mammoth     (strips Word formatting, returns plain text)
  │     .txt  → fs.readFile
  │
  └── chunk if charCount > config.deidentification.chunkSize
        chunkSize   = 3000 chars  (from config.json)
        chunkOverlap = 200 chars  (so PHI spanning a chunk boundary is never split)
        returns: DocumentChunk[] with index, text, start, end
```

---

## Smoke Test Results

```
=== PDF Reader Smoke Test ===

Reading: samples/patient_sample.txt

File type : txt
Characters: 2131
Chunks    : 1   (under 3000 char limit — no chunking needed)

Raw text preview:
  CLINICAL NOTE — FICTITIOUS PATIENT DATA (FOR TESTING ONLY)
  Patient: John Michael Smith
  Date of Birth: 14/03/1979
  MRN: 00482917  ...

=== Smoke test PASSED ===
```

---

## The Synthetic Patient (`patient_sample.txt`)

All data is **entirely fictional**. It was crafted to include every HIPAA PHI category so Phase 3 de-identification has something real to strip:

| PHI Category | Example in file |
|---|---|
| `PATIENT_NAME` | John Michael Smith |
| `DOB` | 14/03/1979 |
| `SSN` | 324-56-7890 |
| `MRN` | 00482917 |
| `ADDRESS` | 45 Maple Drive, Springfield, IL 62701 |
| `PHONE` | (217) 555-0182 |
| `EMAIL` | jsmith1979@email.com |
| `PROVIDER_NAME` | Dr. Emily Carter, Dr. Robert Williams |
| `FACILITY_NAME` | Springfield General Hospital |
| `DATE` | 09 June 2026, 2026-03-15 |
| `AGE` | 47-year-old |
| `NPI` | 1234567890 |

Clinical content preserved for fact extraction testing:
- Diagnoses: NSTEMI/unstable angina, T2DM, hypertension, hyperlipidemia
- Vitals: BP 148/92, HR 88, SpO2 96%
- Medications: Metformin, Lisinopril, Atorvastatin, Aspirin
- Labs: HbA1c 8.2%, BNP 145 pg/mL, eGFR 72

---

## Chunking Logic

For the 2131-char sample file, the document fits in a single chunk. For larger PDFs:

```
Document: 10,000 chars
chunkSize: 3000, overlap: 200

Chunk 0: chars   0 – 3000
Chunk 1: chars 2800 – 5800   ← 200 char overlap catches split PHI
Chunk 2: chars 5600 – 8600
Chunk 3: chars 8400 – 10000
```

Each chunk is processed independently by the Corti agent in Phase 3, then merged.

---

## How to Run

```bash
# Default — uses samples/patient_sample.txt
npx ts-node src/pdfReader.ts

# Custom file
npx ts-node src/pdfReader.ts --input path/to/your/file.pdf
npx ts-node src/pdfReader.ts --input path/to/your/file.docx
```

---

## Files Created This Phase

```
corti-AI-agent/
├── src/
│   └── pdfReader.ts    ✅ new
└── samples/
    └── patient_sample.txt  ✅ new
```

---

## What Phase 3 Builds On Top

`deidentifier.ts` calls `readDocument()` from `pdfReader.ts` to get `DocumentResult`. It then iterates `result.chunks`, sends each to the Corti agent, and merges the `phiMap` entries across chunks before encrypting.
