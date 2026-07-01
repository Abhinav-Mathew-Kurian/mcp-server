# Agent Test Query

## Agent

| Field | Value |
|---|---|
| Agent ID | `154daefe-796a-4e6f-abdb-7811def09b8b` |
| Client ID | `zkip-abhinav` |
| Tenant | `base` |
| Region | `eu` |
| API Base | `https://api.eu.corti.app` |
| Auth URL | `https://auth.eu.corti.app/realms/base/protocol/openid-connect/token` |
| Message Endpoint | `https://api.eu.corti.app/agents/154daefe-796a-4e6f-abdb-7811def09b8b/v1/message:send` |

---

## Test Data

```
Patient: John Michael Smith
Date of Birth: 14/03/1979
MRN: 00482917
SSN: 324-56-7890
Address: 45 Maple Drive, Springfield, IL 62701
Phone: (217) 555-0182
Email: jsmith1979@email.com
Provider: Dr. Emily Carter
Facility: Springfield General Hospital

Clinical Note: 47-year-old male presenting with chest pain.
Diagnosed with NSTEMI. History of T2DM and hypertension.
BP 148/92, HR 88, SpO2 96%.
Medications: Metformin 1000mg, Lisinopril 10mg, Atorvastatin 40mg.
HbA1c 8.2%, BNP 145 pg/mL, eGFR 72.
```

---

## Prompt to Send

```
De-identify the following patient record. Replace every PHI field with a unique random codename 
in the format <<WORD-XXXX>> where WORD is a cool word (NOVA, ZEPHYR, TITAN, PULSAR, VEGA, LYRA, 
ORION, QUASAR, NEBULA, PHANTOM, CIPHER, NEXUS, AXIOM, ZENITH, VECTOR) and XXXX is a random 
4-character alphanumeric string (e.g. <<NOVA-7K2X>>, <<ZEPHYR-9QM4>>, <<TITAN-4RW8>>).

Rules:
- Each distinct PHI value gets its own unique codename
- Same value appearing twice gets the same codename
- Preserve ALL clinical facts (diagnoses, vitals, medications, lab values)
- After the anonymized text, return a JSON block mapping each codename to the original value

<record>
Patient: John Michael Smith
Date of Birth: 14/03/1979
MRN: 00482917
SSN: 324-56-7890
Address: 45 Maple Drive, Springfield, IL 62701
Phone: (217) 555-0182
Email: jsmith1979@email.com
Provider: Dr. Emily Carter
Facility: Springfield General Hospital

Clinical Note: 47-year-old male presenting with chest pain.
Diagnosed with NSTEMI. History of T2DM and hypertension.
BP 148/92, HR 88, SpO2 96%.
Medications: Metformin 1000mg, Lisinopril 10mg, Atorvastatin 40mg.
HbA1c 8.2%, BNP 145 pg/mL, eGFR 72.
</record>
```

---

## Run It

```bash
npx ts-node src/corti.ts
```

Or run the one-liner directly:

```bash
node -e "
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });
const { CortiAuth, CortiClient } = require('@corti/sdk');
(async () => {
  const auth = new CortiAuth({ environment: 'eu', tenantName: 'base' });
  const { accessToken } = await auth.getToken({ clientId: process.env.CORTI_CLIENT_ID, clientSecret: process.env.CORTI_CLIENT_SECRET });
  const client = new CortiClient({ auth: { accessToken } });
  const result = await client.agents.messageSend('154daefe-796a-4e6f-abdb-7811def09b8b', {
    message: {
      kind: 'message', role: 'user', messageId: 'test-001',
      parts: [{ kind: 'text', text: 'De-identify: Patient John Smith, DOB 12/03/1980, SSN 324-56-7890, seen by Dr. Carter at Springfield Hospital.' }]
    }
  });
  console.log(result.task.status.message.parts[0].text);
})().catch(console.error);
"
```

---

## Run Full Pipeline (Phase 3)

```bash
# De-identify patient_sample.txt end-to-end
npx ts-node src/deidentifier.ts

# Re-identify with generated key
KEY=$(cat output/<runId>/patient_key.b64)
npx ts-node src/reidentify.ts --output-dir output/<runId> --key $KEY
```

---

## Last Verified Output (2026-06-26)

**Context ID:** `019f03a2-0a45-703a-8968-031d97595ae7`  
**Credits:** `0.012648`

```
Patient: [PATIENT_NAME]
Date of Birth: [DOB]
MRN: [MRN]
SSN: [SSN]
Address: [ADDRESS]
Phone: [PHONE]
Email: [EMAIL]
Provider: [PROVIDER_NAME]
Facility: [FACILITY_NAME]

Clinical Note: 47-year-old male presenting with chest pain.
Diagnosed with NSTEMI. History of T2DM and hypertension.
BP 148/92, HR 88, SpO2 96%.
Medications: Metformin 1000mg, Lisinopril 10mg, Atorvastatin 40mg.

{
  "PATIENT_NAME": "John Michael Smith",
  "DOB": "14/03/1979",
  "MRN": "00482917",
  "SSN": "324-56-7890",
  "ADDRESS": "45 Maple Drive, Springfield, IL 62701",
  "PHONE": "(217) 555-0182",
  "EMAIL": "jsmith1979@email.com",
  "PROVIDER_NAME": "Dr. Emily Carter",
  "FACILITY_NAME": "Springfield General Hospital"
}
```
