# How The Pipeline Works — Real Input, Real Output, Bit by Bit

**Run date**: 2026-06-26  
**Run ID**: `2026-06-26T11-23-47`  
**Input file**: `samples/patient_sample.txt`  
**Output folder**: `output/2026-06-26T11-23-47/`

This document walks through every single step the pipeline took on a real patient record — what code ran, what it did, why the output looks exactly the way it does.

---

## The 5 Output Files

When you run `npx ts-node src/deidentifier.ts` on a patient file, exactly 5 files are created inside a timestamped folder:

```
output/
└── 2026-06-26T11-23-47/
    ├── anonymized.txt      ← the safe version (no PHI)
    ├── facts.json          ← structured medical data extracted
    ├── phi_map.enc         ← the secret reverse-lookup table (locked)
    ├── patient_key.b64     ← the only key that unlocks phi_map.enc
    └── commitment.json     ← cryptographic fingerprint tying key to data
```

Each file has a specific job. Let's go through every step that produced them.

---

## Step 0 — The Raw Input

This is what went IN. The file `samples/patient_sample.txt` is a synthetic clinical note with fake data covering every HIPAA PHI category:

```
CLINICAL NOTE — FICTITIOUS PATIENT DATA (FOR TESTING ONLY)

Patient: John Michael Smith
Date of Birth: 14/03/1979
MRN: 00482917
SSN: 324-56-7890
Address: 45 Maple Drive, Springfield, IL 62701
Phone: (217) 555-0182
Email: jsmith1979@email.com
Referring Physician: Dr. Emily Carter, NPI 1234567890
Facility: Springfield General Hospital, 200 N. Main St, Springfield IL

Visit Date: 09 June 2026
Reason for Visit: Chest pain and shortness of breath, onset 3 days ago.

History of Present Illness:
John Smith is a 47-year-old male with a history of Type 2 Diabetes Mellitus, hypertension,
and hyperlipidemia who presents with exertional chest pain and dyspnea. He reports the pain
radiates to his left arm. No fever or chills. His wife Mary Smith (contact: 217-555-0183) was
present during the consultation.
...
```

**2131 characters total. 1 chunk** (under the 3000-char chunk limit set in `config.json`).

---

## Step 1 — Reading the File (`src/pdfReader.ts`)

**Code called:**
```typescript
const doc = await readDocument('samples/patient_sample.txt');
```

**What it does:**
- Detects `.txt` extension → reads with `fs.readFile`
- Measures character count: `2131`
- Compares to `config.deidentification.chunkSize = 3000`
- Since `2131 < 3000` → no chunking needed → returns 1 chunk

**Why chunking matters:** If a document was 9000 characters, the code would split it into overlapping chunks of 3000 chars each with a 200-char overlap at boundaries. The overlap ensures a PHI value like "John Smith" appearing at the end of chunk 1 and start of chunk 2 is caught in both passes. For this sample, one chunk covers everything.

**Output from this step:**
```
doc.charCount  = 2131
doc.chunkCount = 1
doc.chunks[0]  = { index: 0, text: "CLINICAL NOTE...", start: 0, end: 2131 }
```

---

## Step 2 — Sending to the Corti Agent (`src/deidentifier.ts`)

**Code called:**
```typescript
const deIdMsg = await corti.sendMessage(DEIDENTIFY_PROMPT(chunk.text));
```

**The exact prompt sent to the Corti agent:**

```
De-identify the following patient record. Replace every PHI field with a unique random 
codename in the format <<WORD-XXXX>> where WORD is chosen from: NOVA, ZEPHYR, TITAN, 
PULSAR, VEGA, LYRA, ORION, QUASAR, NEBULA, PHANTOM, CIPHER, NEXUS, AXIOM, ZENITH, VECTOR 
and XXXX is a random 4-character alphanumeric string (e.g. <<NOVA-7K2X>>, <<ZEPHYR-9QM4>>).

Rules:
- Each distinct PHI value gets its own unique codename
- Same value appearing twice gets the same codename
- PHI to replace: patient names, dates of birth, SSN, MRN, account numbers, addresses, 
  zip codes, phone numbers, fax, email, IP addresses, device IDs, URLs, provider names, 
  facility names, all geographic identifiers smaller than state
- Preserve ALL clinical facts: diagnoses, vitals, medications, lab values, procedures
- Return ONLY:
  1. The full anonymized text
  2. Then a JSON code block mapping each <<CODENAME>> to the original value

<record>
CLINICAL NOTE — FICTITIOUS PATIENT DATA (FOR TESTING ONLY)
Patient: John Michael Smith
... [full 2131 char text] ...
</record>
```

**The Corti agent (LLM) reads the full note in context and identifies every PHI token.** This is fundamentally different from regex — it understands that "Mary Smith" mid-sentence is a person's name (the patient's wife), not just a word, and that "217-555-0183" is a phone number even though it's in a casual format inside parentheses.

**The agent's raw response came back as:**

Part 1 — the anonymized text:
```
Patient: <<NOVA-1A3F>>
Date of Birth: <<ZEPHYR-9QK2>>
MRN: <<TITAN-4L8P>>
SSN: <<PULSAR-7D9X>>
Address: <<VEGA-2M6R>>
...
His wife <<NEXUS-2K8D>> (contact: <<ZENITH-3R6Q>>) was present during the consultation.
...
Cardiology consult — <<VECTOR-5C1Y>> (pager 4421).
...
```

Part 2 — the JSON block:
```json
{
  "<<NOVA-1A3F>>": "John Michael Smith",
  "<<ZEPHYR-9QK2>>": "14/03/1979",
  "<<TITAN-4L8P>>": "00482917",
  "<<PULSAR-7D9X>>": "324-56-7890",
  "<<VEGA-2M6R>>": "45 Maple Drive, Springfield, IL 62701",
  "<<LYRA-5B7N>>": "(217) 555-0182",
  "<<ORION-8Z1C>>": "jsmith1979@email.com",
  "<<QUASAR-3H2V>>": "Dr. Emily Carter",
  "<<NEBULA-6P9J>>": "1234567890",
  "<<PHANTOM-0X4T>>": "Springfield General Hospital, 200 N. Main St, Springfield IL",
  "<<CIPHER-7W5L>>": "09 June 2026",
  "<<NEXUS-2K8D>>": "Mary Smith",
  "<<ZENITH-3R6Q>>": "217-555-0183",
  "<<AXIOM-9V4E>>": "2026-03-15",
  "<<VECTOR-5C1Y>>": "Dr. Robert Williams",
  "<<NOVA-6N9B>>": "217-555-9000"
}
```

**Why each codename is what it is:**

| Codename | Original | Why this is PHI |
|---|---|---|
| `<<NOVA-1A3F>>` | John Michael Smith | Patient name — most obvious PHI |
| `<<ZEPHYR-9QK2>>` | 14/03/1979 | Date of birth — directly identifies patient |
| `<<TITAN-4L8P>>` | 00482917 | MRN — hospital record number |
| `<<PULSAR-7D9X>>` | 324-56-7890 | SSN — government identifier |
| `<<VEGA-2M6R>>` | 45 Maple Drive, Springfield, IL 62701 | Full address with zip — geographic identifier smaller than state |
| `<<LYRA-5B7N>>` | (217) 555-0182 | Patient's phone |
| `<<ORION-8Z1C>>` | jsmith1979@email.com | Email — directly identifies person |
| `<<QUASAR-3H2V>>` | Dr. Emily Carter | Provider name |
| `<<NEBULA-6P9J>>` | 1234567890 | NPI (National Provider Identifier) |
| `<<PHANTOM-0X4T>>` | Springfield General Hospital, 200 N. Main St | Full facility name + address |
| `<<CIPHER-7W5L>>` | 09 June 2026 | Visit date |
| `<<NEXUS-2K8D>>` | Mary Smith | Patient's wife — third-party person, still PHI |
| `<<ZENITH-3R6Q>>` | 217-555-0183 | Wife's phone — still PHI |
| `<<AXIOM-9V4E>>` | 2026-03-15 | Lab date — date associated with patient |
| `<<VECTOR-5C1Y>>` | Dr. Robert Williams | Second provider name |
| `<<NOVA-6N9B>>` | 217-555-9000 | Facility phone number |

**Notice:** `<<NOVA-1A3F>>` appears TWICE in the anonymized text — once at the top (`Patient: <<NOVA-1A3F>>`) and once mid-note (`<<NOVA-1A3F>> is a 47-year-old male...`). **Same codename for same value.** This is why the rule says "same value appearing twice gets the same codename" — consistency is critical for re-identification to work later.

**Notice also:** "pager 4421" was NOT replaced. The agent correctly identified this as a pager extension number (not a personal identifier) and left it alone. This is the intelligence that pure regex cannot replicate.

**Credits used: 0.0245**

---

## Step 3 — Parsing the Agent Response (`parseDeidentifyResponse`)

**Code called:**
```typescript
const { anonymizedText, phiMap } = parseDeidentifyResponse(deIdMsg.text);
```

**What it does:**
1. Looks for a ` ```json ... ``` ` block in the response
2. Parses that block as JSON → becomes the `phiMap` object (16 key-value pairs)
3. Strips the JSON block from the response text → what remains is `anonymizedText`

**Why this parsing logic:** The agent was instructed to return the anonymized text FIRST, then the JSON block. The parser finds the JSON block, extracts it, and whatever's left is the clean anonymized text. Simple and reliable.

---

## Step 4 — Second-Pass Regex (`secondPassRegex`)

**Code called:**
```typescript
const { text: clean, phiMap: fullMap } = secondPassRegex(raw, chunkMap);
```

**What it does:** Runs regex patterns against the anonymized text looking for any PHI the LLM might have missed:
- SSN pattern: `\b\d{3}-\d{2}-\d{4}\b`
- Phone pattern: `\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b`
- Email pattern: `[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`

**In this run:** All 16 PHI tokens were caught by the LLM on the first pass. Regex found 0 additional items. Zero output from this step.

**Why it's there:** LLMs occasionally miss edge cases — a phone number written as `2175550182` (no separators) or an email buried inside a URL. The regex is a safety net, not the primary mechanism.

---

## Step 5 — PHI Leak Check (inside smoke test)

**Code called:**
```typescript
const leaks = phiValues.filter((v) => result.anonymizedText.includes(v));
```

**What it does:** Takes every original PHI value from the map (e.g. "John Michael Smith", "324-56-7890") and checks whether any of them literally appear in the anonymized text.

**Result: 0 leaks.** None of the 16 original values appear anywhere in `anonymized.txt`. The test passes.

**This is the most important safety check in the pipeline.** If even one value leaked, the pipeline would `process.exit(1)` — a hard stop, not a warning.

---

## Step 6 — Extracting Clinical Facts

**Code called:**
```typescript
const factsMsg = await corti.sendMessage(FACTS_PROMPT(anonymizedText));
```

**The exact prompt sent:**
```
Extract structured clinical facts from this anonymized clinical note. Return ONLY a JSON code block.

<note>
CLINICAL NOTE — FICTITIOUS PATIENT DATA (FOR TESTING ONLY)

Patient: <<NOVA-1A3F>>
Date of Birth: <<ZEPHYR-9QK2>>
...
</note>

```json
{
  "diagnoses": [],
  "vitals": { "bloodPressure": null, "heartRate": null, ... },
  ...
}
```
Fill every field found in the note. Use null for anything not mentioned.
```

**Critical:** The facts prompt receives the **anonymized text** — the version with `<<NOVA-1A3F>>` instead of "John Michael Smith". The LLM never sees raw PHI during fact extraction. This is the key rule: PHI never touches the facts API.

**Why facts are extracted separately from de-identification:**
- De-identification is a destructive operation (replace PHI with codes)
- Fact extraction is an analytical operation (understand clinical meaning)
- Mixing them into one prompt makes the agent less reliable at both tasks
- Two focused prompts → two clean outputs

**The agent returned `facts.json`:**
```json
{
  "diagnoses": [
    "Chest pain",
    "Shortness of breath",
    "Probable NSTEMI vs. unstable angina",
    "Type 2 Diabetes Mellitus",
    "Hypertension",
    "Hyperlipidemia",
    "Metabolic syndrome",
    "Poorly controlled diabetes"
  ],
  "vitals": {
    "bloodPressure": "148/92 mmHg",
    "heartRate": 88,
    "oxygenSaturation": "96% on room air",
    "temperature": 37.1,
    "weight": 92,
    "height": 178
  },
  "medications": [
    { "name": "Metformin",    "dose": "1000 mg", "frequency": "twice daily", "status": "chronic" },
    { "name": "Lisinopril",   "dose": "10 mg",   "frequency": "once daily",  "status": "chronic" },
    { "name": "Atorvastatin", "dose": "40 mg",   "frequency": "nightly",     "status": "chronic" },
    { "name": "Aspirin",      "dose": "81 mg",   "frequency": "daily",       "status": "started today" },
    { "name": "Heparin",      "dose": null,      "route": "IV infusion",     "status": "planned" }
  ],
  "labValues": {
    "BNP":       { "value": 145,  "unit": "pg/mL",         "flag": "elevated" },
    "HbA1c":     { "value": 8.2,  "unit": "%",             "flag": null },
    "eGFR":      { "value": 72,   "unit": "mL/min/1.73m²", "flag": null },
    "Troponin I":{ "value": null, "unit": null,             "flag": "pending" }
  },
  "ageYears": 47,
  "ageRange": "40-50",
  "sex": "male",
  "chiefComplaint": "Chest pain and shortness of breath, onset 3 days ago"
}
```

**Why `ageYears: 47` is in facts but NOT replaced in anonymized text:**
The note says "47-year-old male". The agent correctly left this in the anonymized text because under HIPAA Safe Harbor, ages under 90 are **not PHI** unless they can uniquely identify the patient. The age is a clinical fact. It goes into `facts.json` as `ageYears: 47`. The ZK circuit (Phase 4) will use this to prove "age is in range 40-50" without revealing the exact number 47.

**Credits used: 0.0166**

---

## Step 7 — Generating the Patient Secret Key

**Code called:**
```typescript
const patientKey = crypto.randomBytes(32);
```

**What this produces:**
```
Raw bytes (hex): 1a01bfa5c39e3b01a25d18e096...  (32 bytes = 256 bits)
```

Saved as `patient_key.b64`:
```
GgG/pcOeOwGiXRjgloHe6CXx3vVvp9sG/BJ02Cl2gK0=
```

**Why 32 bytes:** AES-256-GCM requires a 256-bit (32-byte) key. `crypto.randomBytes` uses the OS cryptographic random number generator — not `Math.random()`. This is a proper cryptographic secret.

**Why Base64:** Raw bytes can't be stored in a text file. Base64 encodes them as printable ASCII characters. `GgG/pcOeOwGiXRjgloHe6CXx3vVvp9sG/BJ02Cl2gK0=` is the same 32 bytes, just text-safe.

**The STUB warning:** In production, this key would NOT be randomly generated by the server. It would be derived from the patient's own password or biometric: `S = scrypt(password + patientId + salt)`. This way the server NEVER knows the key — only the patient can generate it. The current random generation is a Phase 6 replacement. The encryption and re-identification logic is identical regardless.

---

## Step 8 — Encrypting the PHI Map (`phi_map.enc`)

**Code called:**
```typescript
const encryptedPhiMap = encryptPhiMap(mergedPhiMap, patientKey);
```

**What happens inside `encryptPhiMap`:**

```typescript
// 1. Generate a random 16-byte IV (Initialization Vector)
const iv = crypto.randomBytes(16);
// iv = qUWhJs3z686rNDMjS73r5g== (base64)

// 2. Create AES-256-GCM cipher with the patient's key and IV
const cipher = crypto.createCipheriv('aes-256-gcm', patientKey, iv);

// 3. The plaintext being encrypted:
const plaintext = JSON.stringify(phiMap, null, 2);
// {
//   "<<NOVA-1A3F>>": "John Michael Smith",
//   "<<ZEPHYR-9QK2>>": "14/03/1979",
//   ... (all 16 entries)
// }

// 4. Encrypt it
const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

// 5. Get the authentication tag (GCM mode produces this — proves data wasn't tampered)
const tag = cipher.getAuthTag();
// tag = BNSjEGa++jvRRV0cN0lWMg==
```

**The file saved as `phi_map.enc`:**
```json
{
  "iv": "qUWhJs3z686rNDMjS73r5g==",
  "tag": "BNSjEGa++jvRRV0cN0lWMg==",
  "ciphertext": "NBLcVW1wMlsjCA8crhlxc0jLSPMRQ6IyxZ9w+6v9jP38xPkzb8wwm/YrgrczQzKd...(long string)",
  "algorithm": "aes-256-gcm"
}
```

**What each field does:**

| Field | What it is | Why it's needed |
|---|---|---|
| `iv` | Initialization Vector (16 random bytes) | AES-GCM needs a unique random starting point per encryption. Same key + different IV = completely different ciphertext each time |
| `tag` | Authentication Tag (16 bytes) | GCM mode produces this. When decrypting, if even 1 bit of ciphertext was changed (tampered), the tag check FAILS and decryption throws an error |
| `ciphertext` | The encrypted PHI map | Looks like random garbage without the key. Contains all 16 original PHI values — unreadable |
| `algorithm` | `aes-256-gcm` | Records which cipher was used, so future code knows how to decrypt it |

**Why AES-256-GCM specifically:**
- AES-256 = 256-bit key = unbreakable by brute force with current technology
- GCM mode = authenticated encryption. It doesn't just encrypt, it also signs. If anyone modifies `ciphertext` or `tag`, decryption throws `Error: Unsupported state or unable to authenticate data`. You can't silently tamper with it.

**What an attacker sees if they steal `phi_map.enc`:**
Literally just: `NBLcVW1wMlsjCA8crhlxc0jLSPMRQ...` — random-looking bytes. Without `patient_key.b64`, they cannot recover a single PHI value. The IV and tag are public and non-secret — they cannot be used to decrypt, only to verify.

---

## Step 9 — Computing the Commitment (`commitment.json`)

**Code called:**
```typescript
const commitment = crypto.createHash('sha256').update(JSON.stringify(facts)).update(patientKey).digest('hex');
```

**What happens:**
1. Take `facts.json` content as a string
2. Append the patient key bytes
3. Feed into SHA-256 hash function
4. Output: `75e628dfd35cbf47058c8807af9d024b4045e7214e514e96649a6e7fb82271f2`

**The file saved as `commitment.json`:**
```json
{
  "commitment": "75e628dfd35cbf47058c8807af9d024b4045e7214e514e96649a6e7fb82271f2",
  "algorithm": "sha256-stub"
}
```

**Why this exists — the clever part:**

The commitment cryptographically TIES the patient's key to this specific record's facts. Here's why this matters:

- If you change ANY fact in `facts.json` (say, change age from 47 to 48), the commitment hash changes completely
- If you use a DIFFERENT patient key, the commitment hash changes completely
- The only way to reproduce `75e628dfd35c...` is to have BOTH the exact original `facts.json` AND the exact original `patient_key.b64`

This is used during re-identification to verify: "this key actually belongs to this record, not some other patient's key."

**The "stub" note:** The comment says `sha256-stub` because Phase 4 will replace this with a Poseidon hash (a ZK-friendly hash function). SHA-256 cannot be efficiently verified inside a ZK circuit. Poseidon can. The logic is identical, just a different hash function.

---

## Step 10 — Saving the Output Files

**Code called:**
```typescript
saveOutputs(outputDir, result);
```

**The run ID is generated from the timestamp:**
```typescript
const runId = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
// "2026-06-26T11:23:47.123Z" → "2026-06-26T11-23-47"
```

**Why timestamp as folder name:** Every pipeline run gets its own folder. Running the same patient file twice produces two separate output folders with separate keys, separate encrypted maps, and separate commitments. Each run is completely independent.

**Files written:**
```
fs.writeFileSync('anonymized.txt',   anonymizedText)   ← plain text
fs.writeFileSync('facts.json',       JSON.stringify(facts))
fs.writeFileSync('phi_map.enc',      JSON.stringify(encryptedPhiMap))
fs.writeFileSync('patient_key.b64',  patientKey.toString('base64'))
fs.writeFileSync('commitment.json',  JSON.stringify({ commitment, algorithm }))
```

---

## Step 11 — Re-identification (Patient's Flow)

This is the reverse direction. The patient presents their key and gets their data back.

**Command run:**
```bash
KEY=$(cat output/2026-06-26T11-23-47/patient_key.b64)
npx ts-node src/reidentify.ts --output-dir output/2026-06-26T11-23-47 --key $KEY
```

**What `reidentify.ts` does step by step:**

### 11a — Read the output files
```typescript
const anonymizedText  = fs.readFileSync('anonymized.txt', 'utf-8');
const encryptedPhiMap = JSON.parse(fs.readFileSync('phi_map.enc', 'utf-8'));
const facts           = JSON.parse(fs.readFileSync('facts.json', 'utf-8'));
const { commitment }  = JSON.parse(fs.readFileSync('commitment.json', 'utf-8'));
```

### 11b — Decode the patient key
```typescript
const key = Buffer.from('GgG/pcOeOwGiXRjgloHe6CXx3vVvp9sG/BJ02Cl2gK0=', 'base64');
// Back to raw 32 bytes
```

### 11c — Decrypt the PHI map
```typescript
const iv       = Buffer.from(enc.iv, 'base64');          // qUWhJs3z...
const tag      = Buffer.from(enc.tag, 'base64');         // BNSjEGa+...
const cipher   = Buffer.from(enc.ciphertext, 'base64');  // NBLcVW1w...

const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
decipher.setAuthTag(tag);  // GCM will verify this matches during decryption

const plaintext = Buffer.concat([decipher.update(cipher), decipher.final()]);
// plaintext = '{ "<<NOVA-1A3F>>": "John Michael Smith", ... }'
```

**If wrong key is used:** `decipher.final()` throws `Error: Unsupported state or unable to authenticate data`. The GCM tag verification fails — you cannot decrypt even partially. No silent data corruption.

**Result: 16 PHI tokens decrypted successfully.**

### 11d — Verify the commitment
```typescript
const computed = crypto.createHash('sha256')
  .update(JSON.stringify(facts))
  .update(key)
  .digest('hex');

const valid = (computed === '75e628dfd35cbf47058c8807af9d024b4045e7214e514e96649a6e7fb82271f2');
// → true ✓
```

This proves: the key you presented is the same key that was used when THIS record was processed. You can't take key from Patient A and use it to re-identify Patient B's record — the commitment would mismatch.

### 11e — Restore the text
```typescript
let restored = anonymizedText;
for (const [codename, original] of Object.entries(phiMap)) {
  restored = restored.replace(new RegExp(escapedCodename, 'g'), original);
}
```

**Each substitution:**

| Found in anonymized.txt | Replaced with |
|---|---|
| `<<NOVA-1A3F>>` (appears 2x) | `John Michael Smith` |
| `<<ZEPHYR-9QK2>>` | `14/03/1979` |
| `<<TITAN-4L8P>>` (appears 2x) | `00482917` |
| `<<PULSAR-7D9X>>` | `324-56-7890` |
| `<<VEGA-2M6R>>` | `45 Maple Drive, Springfield, IL 62701` |
| `<<LYRA-5B7N>>` | `(217) 555-0182` |
| `<<ORION-8Z1C>>` | `jsmith1979@email.com` |
| `<<QUASAR-3H2V>>` (appears 2x) | `Dr. Emily Carter` |
| `<<NEBULA-6P9J>>` | `1234567890` |
| `<<PHANTOM-0X4T>>` | `Springfield General Hospital, 200 N. Main St, Springfield IL` |
| `<<CIPHER-7W5L>>` (appears 2x) | `09 June 2026` |
| `<<NEXUS-2K8D>>` | `Mary Smith` |
| `<<ZENITH-3R6Q>>` | `217-555-0183` |
| `<<AXIOM-9V4E>>` | `2026-03-15` |
| `<<VECTOR-5C1Y>>` | `Dr. Robert Williams` |
| `<<NOVA-6N9B>>` | `217-555-9000` |

**Final output — restored text (100% identical to original):**
```
CLINICAL NOTE — FICTITIOUS PATIENT DATA (FOR TESTING ONLY)

Patient: John Michael Smith
Date of Birth: 14/03/1979
MRN: 00482917
SSN: 324-56-7890
Address: 45 Maple Drive, Springfield, IL 62701
Phone: (217) 555-0182
Email: jsmith1979@email.com
Referring Physician: Dr. Emily Carter, NPI 1234567890
Facility: Springfield General Hospital, 200 N. Main St, Springfield IL

Visit Date: 09 June 2026
...
Cardiology consult — Dr. Robert Williams (pager 4421).
...
Signed: Dr. Emily Carter, MD
Date: 09 June 2026
Facility Contact: 217-555-9000
```

**Commitment: VALID ✓**

---

## The Full Data Flow in One Picture

```
samples/patient_sample.txt  (2131 chars, all PHI visible)
        │
        ▼
[pdfReader.ts]
  detect .txt → read → 1 chunk
        │
        ▼
[deidentifier.ts — DEIDENTIFY_PROMPT → Corti Agent]
  LLM reads full note in context
  identifies 16 PHI tokens
  assigns codenames: <<NOVA-1A3F>>, <<ZEPHYR-9QK2>>, ...
  returns anonymized text + JSON map
        │
        ├──────────────────────────────────────► anonymized.txt
        │                                        (PHI-free, safe to share)
        │
        ▼
[deidentifier.ts — FACTS_PROMPT → Corti Agent]
  LLM reads anonymized text (no PHI)
  extracts diagnoses, vitals, meds, labs, age, sex
        │
        └──────────────────────────────────────► facts.json
                                                 (clinical data, no PHI)
        │
        ▼
[crypto.randomBytes(32)] → patientKey
        │
        ├── AES-256-GCM(phiMap, patientKey) ──► phi_map.enc
        │                                       (locked, useless without key)
        │
        ├── patientKey.toString('base64') ────► patient_key.b64
        │                                       (patient must keep this safe)
        │
        └── SHA-256(facts + patientKey) ──────► commitment.json
                                                (proves key belongs to record)


RE-IDENTIFICATION (patient only):

patient_key.b64 + phi_map.enc
        │
        ▼
[AES-256-GCM decrypt]
        │
        ▼
phiMap recovered → substitute <<CODENAME>> back → original document
        │
        ▼
verify SHA-256(facts + key) === commitment ✓
```

---

## What Each File Can Do Without the Others

| File | Without patient key | With patient key |
|---|---|---|
| `anonymized.txt` | Fully readable, shareable, contains no PHI | Same |
| `facts.json` | Fully readable, shareable, contains no PHI | Same |
| `phi_map.enc` | Looks like random garbage, unusable | Decrypts to full PHI map |
| `commitment.json` | A hash string — tells you nothing | Can verify key belongs to this record |
| `patient_key.b64` | Just a random base64 string | Unlocks phi_map.enc and verifies commitment |

**The only person who can re-identify this record is the person who holds `patient_key.b64`.**

---

## What Phase 4 Does With These Files

Phase 4 (ZK circuits) reads `facts.json` and `commitment.json` and generates a cryptographic proof that:

- The patient's age is in the range 40–50 (uses `ageYears: 47`)
- The primary diagnosis is in ICD Chapter IX — Circulatory system (NSTEMI)
- The data was processed by this pipeline (uses the commitment hash)

...without revealing that the age is exactly 47, without revealing the exact diagnosis string, and without revealing the patient key. Anyone can verify the proof with `verification_key.json` and learn those three facts — nothing else.
