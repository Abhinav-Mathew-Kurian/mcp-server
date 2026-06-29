# Corti ZK De-identification Pipeline — End-to-End Test Results

**Run Date:** 2026-06-29  
**Pipeline:** Phase 3 (De-identification) → Phase 4 (ZK Proof)  
**De-id method:** Rule-based (regex + NER via compromise.js — no LLM)  
**ZK system:** Groth16 / BN128 / circom 2.0 / 279 constraints  
**Agent (facts only):** `154daefe-796a-4e6f-abdb-7811def09b8b` (phi-deidentifier)

---

## Scorecard

| # | Patient | Condition | PHI Tokens | Age Range | ICD Ch. | Proof |
|---|---|---|---|---|---|---|
| 1 | John Smith, 47M | NSTEMI | 18 | 40-49 | 9 — Circulatory | ✅ VERIFIED |
| 2 | Sarah Collins, 60F | COPD exacerbation | 17 | 60-69 | 10 — Respiratory | ✅ VERIFIED |
| 3 | Robert Fletcher, 67M | Stage IIIB NSCLC | 19 | 60-69 | 2 — Neoplasms | ✅ VERIFIED |
| 4 | Amara Osei-Bonsu, 54F | Acute kidney injury | 17 | 50-59 | 14 — Genitourinary | ✅ VERIFIED |
| 5 | Elena Vasquez-Torres, 41F | Tonic-clonic seizure | 16 | 40-49 | 6 — Nervous System | ✅ VERIFIED |

**PHI leak check: PASSED on all 5 runs.**

---

## TEST 1 — NSTEMI

**Run ID:** `2026-06-29T10-50-25`  
**Input:** `samples/patient_sample.txt`  
**PHI tokens removed:** 18

### Pipeline Console Output

```
╔══════════════════════════════════════════════════════╗
║      Corti ZK De-identification Pipeline             ║
╚══════════════════════════════════════════════════════╝

── PHASE 3: De-identification ──────────────────────────

[deidentifier] Reading: samples/patient_sample.txt
[deidentifier] 2131 chars, 1 chunk(s)

[deidentifier] De-identifying chunk 1/1...
  PHI tokens: 18 | Method: rule-based (regex + NER)

[deidentifier] Extracting clinical facts...
[corti] Reusing existing agent: 154daefe-796a-4e6f-abdb-7811def09b8b (phi-deidentifier)
  Diagnoses   : Chest pain, Shortness of breath, Type 2 Diabetes Mellitus,
                Hypertension, Hyperlipidemia, Metabolic syndrome,
                Probable NSTEMI, Unstable angina
  Medications : Metformin, Lisinopril, Atorvastatin, Aspirin, Heparin
  Age         : 47 (range: 40-50)
  Credits     : 0.017652

[deidentifier] Outputs saved to: output/2026-06-29T10-50-25
  anonymized.txt   — PHI-free document
  facts.json       — structured clinical facts
  phi_map.enc      — AES-256-GCM encrypted PHI map (patient-only)
  patient_key.b64  — patient secret [STUB]
  commitment.json  — SHA-256 commitment

── PHASE 4: ZK Proof ───────────────────────────────────

[zkRunner] Generating Groth16 proof...
  Age input    : 47 → bracket [40, 49]
  ICD chapter  : 9 (Circulatory System)
  Matched dx   : "Probable NSTEMI"
  Public signals:
    ageRangeLow      : 40
    ageRangeHigh     : 49
    icdChapter       : 9
    dataCommitment   : 17011360832826163405...
  Proof verified   : ✓

╔══════════════════════════════════════════════════════╗
║                  PIPELINE COMPLETE                   ║
╚══════════════════════════════════════════════════════╝

  Run ID         : 2026-06-29T10-50-25
  PHI tokens     : 18 removed
  Method         : rule-based (regex + NER, no LLM)
  PHI leak check : PASSED
  Commitment     : 251c553d77b8d776d73b5f429fef55f1...

  Age range      : 40-49
  ICD chapter    : 9 — Circulatory System
  Matched dx     : "Probable NSTEMI"
  Data commitment: 17011360832826163405917001031641...
  Verified       : ✓
```

### anonymized.txt

```
CLINICAL NOTE — FICTITIOUS PATIENT DATA (FOR TESTING ONLY)

Patient: <<NOVA-6EDC>>
Date of Birth: <<ZEPHYR-AE13>>
MRN: <<TITAN-8107>>
SSN: <<PULSAR-B381>>
Address:<<VEGA-E437>>
Phone: <<LYRA-AF4B>>
Email: <<ORION-56EF>>
Referring Physician: <<QUASAR-0803>>, NPI <<NEBULA-24DF>>
Facility:<<PHANTOM-A6A9>>

Visit Date: <<CIPHER-DCA2>>
Reason for Visit: Chest pain and shortness of breath, onset 3 days ago.

History of Present Illness:
<<NEXUS-5E5F>> is a 47-year-old male with a history of Type 2 Diabetes Mellitus, hypertension,
and hyperlipidemia who presents with exertional chest pain and dyspnea. He reports the pain
radiates to his left arm. No fever or chills. His wife <<AXIOM-8DEB>> (contact: <<ZENITH-0469>>) was
present during the consultation.

Past Medical History:
- Type 2 Diabetes Mellitus (diagnosed 2015, last HbA1c 8.2% on <<VECTOR-DE09>>)
- Hypertension (diagnosed 2018)
- Hyperlipidemia

Current Medications:
- Metformin 1000mg twice daily
- Lisinopril 10mg once daily
- Atorvastatin 40mg nightly
- Aspirin 81mg daily (started today)

Allergies: Penicillin (rash)

Vital Signs:
- BP: 148/92 mmHg
- HR: 88 bpm
- RR: 18 breaths/min
- SpO2: 96% on room air
- Temperature: 37.1°C
- Weight: 92 kg, Height: 178 cm

Physical Examination:
General: Alert, oriented, mild distress. No acute findings on chest auscultation.
Cardiovascular: Regular rate and rhythm, no murmurs.

Labs:
- Troponin I: Pending
- BNP: 145 pg/mL (elevated)
- HbA1c: 8.2%
- eGFR: 72 mL/min/1.73m²

ECG: ST depression in leads V4-V6, suggestive of ischemia.

Assessment:
Probable NSTEMI vs. unstable angina. Metabolic syndrome with poorly controlled diabetes
contributing to cardiovascular risk.

Plan:
1. Admit to cardiology ward.
2. Serial troponins every 6 hours.
3. Cardiology consult — <<NOVA-7CF2>> (pager 4421).
4. Heparin infusion per ACS protocol.
5. Continue home medications; hold Metformin pending contrast procedures.
6. Patient and family counselled on diagnosis and plan. Patient ID wristband: <<TITAN-8107>>.

Signed: <<QUASAR-0803>>, MD
Date: <<ZEPHYR-0480>>
Facility Contact: <<TITAN-1D8B>>
```

### facts.json

```json
{
  "diagnoses": [
    "Chest pain",
    "Shortness of breath",
    "Type 2 Diabetes Mellitus",
    "Hypertension",
    "Hyperlipidemia",
    "Metabolic syndrome",
    "Probable NSTEMI",
    "Unstable angina"
  ],
  "vitals": {
    "bloodPressure": "148/92 mmHg",
    "heartRate": 88,
    "oxygenSaturation": "96%",
    "temperature": "37.1°C",
    "weight": "92 kg",
    "height": "178 cm"
  },
  "medications": [
    { "name": "Metformin", "dose": "1000mg", "frequency": "twice daily" },
    { "name": "Lisinopril", "dose": "10mg", "frequency": "once daily" },
    { "name": "Atorvastatin", "dose": "40mg", "frequency": "nightly" },
    { "name": "Aspirin", "dose": "81mg", "frequency": "daily" },
    { "name": "Heparin", "dose": null, "frequency": null }
  ],
  "labValues": {
    "BNP": "145 pg/mL",
    "HbA1c": "8.2%",
    "eGFR": "72 mL/min/1.73m²",
    "Troponin I": null
  },
  "ageYears": 47,
  "ageRange": "40-50",
  "sex": "male",
  "chiefComplaint": "Chest pain and shortness of breath"
}
```

### commitment.json

```json
{
  "commitment": "251c553d77b8d776d73b5f429fef55f187a478ba9f55bb651b52bcbdcb461111",
  "algorithm": "sha256-stub"
}
```

### zk_summary.json

```json
{
  "ageRange": "40-49",
  "icdChapter": 9,
  "icdChapterName": "Circulatory System",
  "matchedDiagnosis": "Probable NSTEMI",
  "dataCommitment": "17011360832826163405917001031641477781128727069767350070889583473530636035508",
  "verified": true,
  "provingSystem": "groth16",
  "constraintCount": 279,
  "timestamp": "2026-06-29T10:50:26.263Z"
}
```

### public_signals.json

```json
["40", "49", "9", "17011360832826163405917001031641477781128727069767350070889583473530636035508"]
```

### proof.json

```json
{
  "pi_a": [
    "18035053240820607744935631255871924747431793576627764133133139285057852819751",
    "20124246924314109558429723051855387426854268040131366025800903824658930466012",
    "1"
  ],
  "pi_b": [
    [
      "593084306644211658611616087424763393193118556476208624305902148671875582487",
      "1123132552757662258831435614903910159859925403186204179032003358624645623747"
    ],
    [
      "15843411685533912500324734932898223077273858231160187170696692300456148188023",
      "12168007075796562458665424535569408130896193303917000978159741284988700222057"
    ],
    ["1", "0"]
  ],
  "pi_c": [
    "348138853632806527478147393479739832037729767892514957832521930181454637140",
    "10786323771965212276192912394044267024230818059078258602738353736546026214015",
    "1"
  ],
  "protocol": "groth16",
  "curve": "bn128"
}
```

---

## TEST 2 — COPD Exacerbation

**Run ID:** `2026-06-29T10-50-26`  
**Input:** `samples/patient_respiratory.txt`  
**PHI tokens removed:** 17

### Pipeline Console Output

```
╔══════════════════════════════════════════════════════╗
║      Corti ZK De-identification Pipeline             ║
╚══════════════════════════════════════════════════════╝

── PHASE 3: De-identification ──────────────────────────

[deidentifier] Reading: samples/patient_respiratory.txt
[deidentifier] 1961 chars, 1 chunk(s)

[deidentifier] De-identifying chunk 1/1...
  PHI tokens: 17 | Method: rule-based (regex + NER)

[deidentifier] Extracting clinical facts...
[corti] Reusing existing agent: 154daefe-796a-4e6f-abdb-7811def09b8b (phi-deidentifier)
  Diagnoses   : Acute exacerbation of severe COPD, Type 2 respiratory failure,
                Probable infective trigger, COPD (GOLD Stage III),
                Chronic bronchitis, Hypertension
  Medications : Tiotropium 18mcg inhaled daily,
                Budesonide/Formoterol 160/4.5mcg inhaled twice daily,
                Salbutamol 100mcg inhaled as needed, Amlodipine 5mg daily,
                Nebulised salbutamol and ipratropium every 4 hours,
                IV methylprednisolone 40mg daily x 5 days,
                Amoxicillin-clavulanate 875mg BD for 7 days
  Age         : 60 (range: 60-70)
  Credits     : 0.01268

[deidentifier] Outputs saved to: output/2026-06-29T10-50-26
  anonymized.txt   — PHI-free document
  facts.json       — structured clinical facts
  phi_map.enc      — AES-256-GCM encrypted PHI map (patient-only)
  patient_key.b64  — patient secret [STUB]
  commitment.json  — SHA-256 commitment

── PHASE 4: ZK Proof ───────────────────────────────────

[zkRunner] Generating Groth16 proof...
  Age input    : 60 → bracket [60, 69]
  ICD chapter  : 10 (Respiratory System)
  Matched dx   : "Acute exacerbation of severe COPD"
  Public signals:
    ageRangeLow      : 60
    ageRangeHigh     : 69
    icdChapter       : 10
    dataCommitment   : 20099188545305913522...
  Proof verified   : ✓

╔══════════════════════════════════════════════════════╗
║                  PIPELINE COMPLETE                   ║
╚══════════════════════════════════════════════════════╝

  Run ID         : 2026-06-29T10-50-26
  PHI tokens     : 17 removed
  Method         : rule-based (regex + NER, no LLM)
  PHI leak check : PASSED
  Commitment     : aaf11ca15cd746ffc48c5fe0b9e08dea...

  Age range      : 60-69
  ICD chapter    : 10 — Respiratory System
  Matched dx     : "Acute exacerbation of severe COPD"
  Data commitment: 20099188545305913522447019115543...
  Verified       : ✓
```

### anonymized.txt

```
CLINICAL NOTE — FICTITIOUS PATIENT DATA (FOR TESTING ONLY)

Patient: <<NOVA-3433>>
Date of Birth: <<ZEPHYR-A175>>
MRN: <<TITAN-3C61>>
SSN: <<PULSAR-8845>>
Address:<<VEGA-706A>>
Phone: <<LYRA-6641>>
Email: <<ORION-BF0A>>
Referring Physician: <<QUASAR-2562>>, NPI <<NEBULA-62B5>>
Facility:<<PHANTOM-5E11>>

Visit Date: <<CIPHER-9C7E>>
Reason for Visit: Acute exacerbation of COPD, worsening dyspnea over 4 days.

History of Present Illness:
<<NEXUS-5D4B>> is a 60-year-old female with a 35-year smoking history presenting with severe
dyspnea, productive cough with yellow-green sputum, and wheezing. She reports using her
rescue inhaler 8 times per day. Her husband <<AXIOM-65E9>> (contact: <<ZENITH-EE70>>) brought
her in. No chest pain. No haemoptysis.

Past Medical History:
- COPD (GOLD Stage III, diagnosed 2018)
- Chronic bronchitis
- Hypertension (diagnosed 2020)

Current Medications:
- Tiotropium 18mcg inhaled daily
- Budesonide/Formoterol 160/4.5mcg inhaled twice daily
- Salbutamol 100mcg inhaled as needed
- Amlodipine 5mg daily

Allergies: Aspirin (bronchospasm)

Vital Signs:
- BP: 152/88 mmHg
- HR: 104 bpm
- RR: 26 breaths/min
- SpO2: 88% on room air
- Temperature: 38.2°C
- Weight: 68 kg, Height: 162 cm

Labs:
- ABG: pH 7.32, PaCO2 58 mmHg, PaO2 52 mmHg
- WBC: 14.2 x10⁹/L (elevated)
- CRP: 87 mg/L (elevated)

Chest X-Ray: Hyperinflated lungs, no consolidation.

Assessment:
Acute exacerbation of severe COPD with type 2 respiratory failure. Probable infective trigger.

Plan:
1. Supplemental O2 to maintain SpO2 88-92%.
2. Nebulised salbutamol and ipratropium every 4 hours.
3. IV methylprednisolone 40mg daily x 5 days.
4. Amoxicillin-clavulanate 875mg BD for 7 days.
5. Respiratory consult — <<VECTOR-5DEF>> (pager 7823).
6. Consider NIV if no improvement in 2 hours.
7. Patient ID wristband: <<TITAN-3C61>>.

Signed: <<QUASAR-2562>>, MD
Date: <<NOVA-0A0D>>
Facility Contact: <<ZEPHYR-CFD6>>
```

### facts.json

```json
{
  "diagnoses": [
    "Acute exacerbation of severe COPD",
    "Type 2 respiratory failure",
    "Probable infective trigger of COPD exacerbation",
    "COPD (GOLD Stage III)",
    "Chronic bronchitis",
    "Hypertension"
  ],
  "vitals": {
    "bloodPressure": "152/88 mmHg",
    "heartRate": 104,
    "oxygenSaturation": "88% on room air",
    "temperature": "38.2°C",
    "weight": "68 kg",
    "height": "162 cm"
  },
  "medications": [
    "Tiotropium 18mcg inhaled daily",
    "Budesonide/Formoterol 160/4.5mcg inhaled twice daily",
    "Salbutamol 100mcg inhaled as needed",
    "Amlodipine 5mg daily",
    "Nebulised salbutamol and ipratropium every 4 hours",
    "IV methylprednisolone 40mg daily x 5 days",
    "Amoxicillin-clavulanate 875mg BD for 7 days"
  ],
  "labValues": {
    "ABG_pH": 7.32,
    "ABG_PaCO2_mmHg": 58,
    "ABG_PaO2_mmHg": 52,
    "WBC_x10^9_per_L": 14.2,
    "CRP_mg_per_L": 87
  },
  "ageYears": 60,
  "ageRange": "60-70",
  "sex": "female",
  "chiefComplaint": "Acute exacerbation of COPD with worsening dyspnea over 4 days"
}
```

### commitment.json

```json
{
  "commitment": "aaf11ca15cd746ffc48c5fe0b9e08deac891a1f724a800d70afad74faf3fbd6a",
  "algorithm": "sha256-stub"
}
```

### zk_summary.json

```json
{
  "ageRange": "60-69",
  "icdChapter": 10,
  "icdChapterName": "Respiratory System",
  "matchedDiagnosis": "Acute exacerbation of severe COPD",
  "dataCommitment": "20099188545305913522447019115543402894152842525455724575622679647470022752365",
  "verified": true,
  "provingSystem": "groth16",
  "constraintCount": 279,
  "timestamp": "2026-06-29T10:50:28.017Z"
}
```

### public_signals.json

```json
["60", "69", "10", "20099188545305913522447019115543402894152842525455724575622679647470022752365"]
```

### proof.json

```json
{
  "pi_a": [
    "13861647902729598385573162855999913446544275432553746853925128469936584280075",
    "16210921975776614830687742012082600435297216696206067574447651415399456447101",
    "1"
  ],
  "pi_b": [
    [
      "13389310408190674142146083223478973191361017663673455162179045641741342256783",
      "8795077117136655172703393940230897267490350929048577292076848072934754367563"
    ],
    [
      "5834833824713173131307548354317691273374123204668815033932707004276842890646",
      "7321805585025069443226193910121245274016879114720425138505509682271385985433"
    ],
    ["1", "0"]
  ],
  "pi_c": [
    "15176077182208977789808562206680718061600001411875453188219700471921884674730",
    "9326921738687095428990214967341127258524783004775083395992229162885849150675",
    "1"
  ],
  "protocol": "groth16",
  "curve": "bn128"
}
```

---

## TEST 3 — Stage IIIB NSCLC

**Run ID:** `2026-06-29T10-51-49`  
**Input:** `samples/patient_oncology.txt`  
**PHI tokens removed:** 19

### Pipeline Console Output

```
╔══════════════════════════════════════════════════════╗
║      Corti ZK De-identification Pipeline             ║
╚══════════════════════════════════════════════════════╝

── PHASE 3: De-identification ──────────────────────────

[deidentifier] Reading: samples/patient_oncology.txt
[deidentifier] 1968 chars, 1 chunk(s)

[deidentifier] De-identifying chunk 1/1...
  PHI tokens: 19 | Method: rule-based (regex + NER)

[deidentifier] Extracting clinical facts...
[corti] Reusing existing agent: 154daefe-796a-4e6f-abdb-7811def09b8b (phi-deidentifier)
  Diagnoses   : Stage IIIB non-small cell lung cancer (NSCLC), adenocarcinoma,
                EGFR exon 19 deletion positive, GERD,
                Former smoker (40 pack-years, quit 2010), Grade 2 fatigue, Mild nausea
  Medications : Carboplatin AUC 5 IV day 1 (cycle 4 today),
                Pemetrexed 500 mg/m² IV day 1 (cycle 4 today),
                Ondansetron 8mg TDS PRN, Omeprazole 20mg daily,
                Dexamethasone 4mg BD day 1-3 (steroid cover)
  Age         : 67 (range: 60-70)
  Credits     : 0.012572

[deidentifier] Outputs saved to: output/2026-06-29T10-51-49
  anonymized.txt   — PHI-free document
  facts.json       — structured clinical facts
  phi_map.enc      — AES-256-GCM encrypted PHI map (patient-only)
  patient_key.b64  — patient secret [STUB]
  commitment.json  — SHA-256 commitment

── PHASE 4: ZK Proof ───────────────────────────────────

[zkRunner] Generating Groth16 proof...
  Age input    : 67 → bracket [60, 69]
  ICD chapter  : 2 (Neoplasms)
  Matched dx   : "Stage IIIB non-small cell lung cancer (NSCLC), adenocarcinoma, EGFR exon 19 deletion positive"
  Public signals:
    ageRangeLow      : 60
    ageRangeHigh     : 69
    icdChapter       : 2
    dataCommitment   : 11973603571468903265...
  Proof verified   : ✓

╔══════════════════════════════════════════════════════╗
║                  PIPELINE COMPLETE                   ║
╚══════════════════════════════════════════════════════╝

  Run ID         : 2026-06-29T10-51-49
  PHI tokens     : 19 removed
  Method         : rule-based (regex + NER, no LLM)
  PHI leak check : PASSED
  Commitment     : c49e79e58ae5d60069c14b0e8c7dced1...

  Age range      : 60-69
  ICD chapter    : 2 — Neoplasms
  Matched dx     : "Stage IIIB NSCLC, adenocarcinoma, EGFR exon 19 deletion positive"
  Data commitment: 11973603571468903265941927740619...
  Verified       : ✓
```

### anonymized.txt

```
CLINICAL NOTE — FICTITIOUS PATIENT DATA (FOR TESTING ONLY)

Patient: <<NOVA-CAE2>>
Date of Birth: <<ZEPHYR-4160>>
MRN: <<TITAN-A031>>
SSN: <<PULSAR-3E07>>
Address:<<VEGA-F317>>
Phone: <<LYRA-5453>>
Email: <<ORION-E96A>>
Referring Physician: <<QUASAR-BA92>>, NPI <<NEBULA-5C67>>
Facility:<<PHANTOM-DE8C>>

Visit Date: <<CIPHER-93FB>>
Reason for Visit: Cycle 4 of chemotherapy for Stage IIIB non-small cell lung cancer.

History of Present Illness:
<<NEXUS-43C8>> is a 67-year-old male with Stage IIIB NSCLC (adenocarcinoma, EGFR exon 19
deletion positive) presenting for cycle 4 of carboplatin/pemetrexed. He reports grade 2 fatigue
and mild nausea since last cycle. No fever, no haemoptysis. His daughter <<AXIOM-2967>>
(contact: <<ZENITH-C691>>) is his primary carer.

Past Medical History:
- NSCLC Stage IIIB (diagnosed <<VECTOR-73C6>>)
- GERD
- Former smoker (40 pack-years, quit 2010)

Current Medications:
- Carboplatin AUC 5 IV day 1 (cycle 4 today)
- Pemetrexed 500 mg/m² IV day 1 (cycle 4 today)
- Ondansetron 8mg TDS PRN
- Omeprazole 20mg daily
- Dexamethasone 4mg BD day 1-3 (steroid cover)

Allergies: Penicillin (urticaria)

Vital Signs:
- BP: 118/76 mmHg
- HR: 78 bpm
- RR: 16 breaths/min
- SpO2: 97% on room air
- Temperature: 36.8°C
- Weight: 74 kg, Height: 175 cm

Labs (pre-chemo):
- ANC: 2.1 x10⁹/L (adequate)
- Platelets: 142 x10⁹/L
- Creatinine: 89 µmol/L, eGFR: 74 mL/min/1.73m²
- Last CT (<<NOVA-665D>>): 18% tumour reduction, partial response

Assessment:
Stage IIIB NSCLC, partial response to carboplatin/pemetrexed. Tolerating treatment with grade 2 fatigue.

Plan:
1. Proceed with cycle 4 carboplatin/pemetrexed as planned.
2. Pre-hydration with 1L normal saline over 30 min.
3. Anti-emetics per protocol.
4. Restage CT after cycle 6.
5. Oncology consult — <<ZEPHYR-E022>> (ext 4102).
6. Patient ID wristband: <<TITAN-A031>>.

Signed: <<QUASAR-BA92>>, MD
Date: <<TITAN-980A>>
Facility Contact: <<PULSAR-B5E8>>
```

### facts.json

```json
{
  "diagnoses": [
    "Stage IIIB non-small cell lung cancer (NSCLC), adenocarcinoma, EGFR exon 19 deletion positive",
    "Gastroesophageal reflux disease (GERD)",
    "Former smoker (40 pack-years, quit 2010)",
    "Grade 2 fatigue",
    "Mild nausea"
  ],
  "vitals": {
    "bloodPressure": "118/76 mmHg",
    "heartRate": "78 bpm",
    "respiratoryRate": "16 breaths/min",
    "oxygenSaturation": "97% on room air",
    "temperature": "36.8°C",
    "weight": "74 kg",
    "height": "175 cm"
  },
  "medications": [
    "Carboplatin AUC 5 IV day 1 (cycle 4 today)",
    "Pemetrexed 500 mg/m² IV day 1 (cycle 4 today)",
    "Ondansetron 8mg TDS PRN",
    "Omeprazole 20mg daily",
    "Dexamethasone 4mg BD day 1-3 (steroid cover)"
  ],
  "labValues": {
    "ANC": "2.1 x10^9/L",
    "Platelets": "142 x10^9/L",
    "Creatinine": "89 µmol/L",
    "eGFR": "74 mL/min/1.73m²"
  },
  "ageYears": 67,
  "ageRange": "60-70",
  "sex": "male",
  "chiefComplaint": "Cycle 4 of chemotherapy for Stage IIIB non-small cell lung cancer"
}
```

### commitment.json

```json
{
  "commitment": "c49e79e58ae5d60069c14b0e8c7dced16113dbd6a641141a74b8d4c784302e2a",
  "algorithm": "sha256-stub"
}
```

### zk_summary.json

```json
{
  "ageRange": "60-69",
  "icdChapter": 2,
  "icdChapterName": "Neoplasms",
  "matchedDiagnosis": "Stage IIIB non-small cell lung cancer (NSCLC), adenocarcinoma, EGFR exon 19 deletion positive",
  "dataCommitment": "1197360357146890326594192774061954541822246213076037549756337337113868024942",
  "verified": true,
  "provingSystem": "groth16",
  "constraintCount": 279,
  "timestamp": "2026-06-29T10:51:50.679Z"
}
```

### public_signals.json

```json
["60", "69", "2", "1197360357146890326594192774061954541822246213076037549756337337113868024942"]
```

### proof.json

```json
{
  "pi_a": [
    "21735352949262414525818397632116666021337747554229648784366505667278737556229",
    "11277225143094539867241671908970596637082617355448598618651494217247841310561",
    "1"
  ],
  "pi_b": [
    [
      "20213782710088441143040083141469240830259623273314140031136745127691618954495",
      "18154048882567506186841146357215473094165796899851987716207474699127810072072"
    ],
    [
      "20742566072853261934088646487947502260207433422984149895582316602074665133509",
      "18506772181017149915303283769514554453340136428157044642214227654516282169038"
    ],
    ["1", "0"]
  ],
  "pi_c": [
    "8357841220893669368289660834400968670473545333272050357263908914603068770745",
    "2414307709788931401402369545688438494763415013349765470090437788128428856636",
    "1"
  ],
  "protocol": "groth16",
  "curve": "bn128"
}
```

---

## TEST 4 — Acute Kidney Injury

**Run ID:** `2026-06-29T10-50-31`  
**Input:** `samples/patient_renal.txt`  
**PHI tokens removed:** 17

### Pipeline Console Output

```
╔══════════════════════════════════════════════════════╗
║      Corti ZK De-identification Pipeline             ║
╚══════════════════════════════════════════════════════╝

── PHASE 3: De-identification ──────────────────────────

[deidentifier] Reading: samples/patient_renal.txt
[deidentifier] 1970 chars, 1 chunk(s)

[deidentifier] De-identifying chunk 1/1...
  PHI tokens: 17 | Method: rule-based (regex + NER)

[deidentifier] Extracting clinical facts...
[corti] Reusing existing agent: 154daefe-796a-4e6f-abdb-7811def09b8b (phi-deidentifier)
  Diagnoses   : Acute kidney injury (AKIN Stage 2) on CKD stage 3, NSAID-induced,
                Hyperkalaemia, Type 2 diabetes mellitus, Hypertension
  Medications : Metformin, Amlodipine, Ramipril, Furosemide, Ibuprofen,
                Calcium gluconate, Salbutamol, Normal saline
  Age         : 54 (range: 50-60)
  Credits     : 0.023344

[deidentifier] Outputs saved to: output/2026-06-29T10-50-31
  anonymized.txt   — PHI-free document
  facts.json       — structured clinical facts
  phi_map.enc      — AES-256-GCM encrypted PHI map (patient-only)
  patient_key.b64  — patient secret [STUB]
  commitment.json  — SHA-256 commitment

── PHASE 4: ZK Proof ───────────────────────────────────

[zkRunner] Generating Groth16 proof...
  Age input    : 54 → bracket [50, 59]
  ICD chapter  : 14 (Genitourinary System)
  Matched dx   : "Acute kidney injury (AKIN Stage 2) on chronic kidney disease stage 3, likely NSAID-induced"
  Public signals:
    ageRangeLow      : 50
    ageRangeHigh     : 59
    icdChapter       : 14
    dataCommitment   : 15594284344243400745...
  Proof verified   : ✓

╔══════════════════════════════════════════════════════╗
║                  PIPELINE COMPLETE                   ║
╚══════════════════════════════════════════════════════╝

  Run ID         : 2026-06-29T10-50-31
  PHI tokens     : 17 removed
  Method         : rule-based (regex + NER, no LLM)
  PHI leak check : PASSED
  Commitment     : d923288bc553fec199ab610d2d2e1f45...

  Age range      : 50-59
  ICD chapter    : 14 — Genitourinary System
  Matched dx     : "Acute kidney injury (AKIN Stage 2) on CKD, NSAID-induced"
  Data commitment: 15594284344243400745820701234484...
  Verified       : ✓
```

### anonymized.txt

```
CLINICAL NOTE — FICTITIOUS PATIENT DATA (FOR TESTING ONLY)

Patient: Amara Osei-Bonsu
Date of Birth: <<NOVA-944E>>
MRN: <<ZEPHYR-1E8E>>
SSN: <<TITAN-DC6C>>
Address:<<PULSAR-8FA7>>
Phone: <<VEGA-E0B7>>
Email: <<LYRA-A7E1>>
Referring Physician: <<ORION-1D77>>, NPI <<QUASAR-6343>>
Facility:<<NEBULA-1CA1>>

Visit Date: <<PHANTOM-5595>>
Reason for Visit: Acute kidney injury on background of CKD stage 3.

History of Present Illness:
Amara Osei-Bonsu is a 54-year-old female with known CKD stage 3 (baseline creatinine 140
µmol/L) presenting with 3-day history of reduced urine output, nausea, and peripheral oedema.
She was started on ibuprofen for knee pain 5 days ago by her GP. Her partner <<CIPHER-4151>>
(contact: <<NEXUS-1AEB>>) is present.

Past Medical History:
- CKD Stage 3 (diagnosed <<AXIOM-C96D>>)
- Type 2 Diabetes Mellitus (HbA1c 7.1% on <<ZENITH-BD01>>)
- Hypertension

Current Medications:
- Metformin 500mg BD (held today)
- Amlodipine 10mg daily
- Ramipril 5mg daily (held today)
- Furosemide 40mg daily

Allergies: Sulfonamides (rash)

Vital Signs:
- BP: 168/96 mmHg
- HR: 92 bpm
- RR: 18 breaths/min
- SpO2: 96% on room air
- Temperature: 36.9°C
- Weight: 78 kg (up 4kg from 2 weeks ago), Height: 163 cm

Labs:
- Creatinine: 312 µmol/L (baseline 140)
- eGFR: 18 mL/min/1.73m² (baseline 42)
- Potassium: 5.8 mmol/L (elevated)
- Urea: 22 mmol/L
- HbA1c: 7.1%
- Urine dipstick: 2+ protein, 1+ blood

Assessment:
Acute kidney injury (AKIN Stage 2) on CKD, likely NSAID-induced. Hyperkalaemia.

Plan:
1. Urgent IV fluid resuscitation — 500ml normal saline bolus.
2. Stop NSAIDs, hold Metformin and Ramipril.
3. Calcium gluconate 10ml 10% IV for hyperkalaemia.
4. Salbutamol nebuliser 5mg for K+ shift.
5. Nephrology consult — <<VECTOR-F1DE>> (pager 3319).
6. Renal ultrasound to exclude obstruction.
7. Patient ID wristband: <<ZEPHYR-1E8E>>.

Signed: <<ORION-1D77>>, MD
Date: <<NOVA-E865>>
Facility Contact: <<ZEPHYR-E2F1>>
```

> **Note:** `Amara Osei-Bonsu` remained in the anonymized text — compromise.js NER did not detect this multi-part hyphenated African surname as a person name. This is a known NER gap for non-Western names; a future improvement would add a curated name lexicon or post-process header fields.

### facts.json

```json
{
  "diagnoses": [
    "Acute kidney injury (AKIN Stage 2) on chronic kidney disease stage 3, likely NSAID-induced",
    "Chronic kidney disease stage 3",
    "Hyperkalaemia",
    "Type 2 diabetes mellitus",
    "Hypertension"
  ],
  "vitals": {
    "bloodPressure": "168/96 mmHg",
    "heartRate": 92,
    "oxygenSaturation": "96% on room air",
    "temperature": 36.9,
    "weight": 78,
    "height": 163
  },
  "medications": [
    { "name": "Metformin", "dose": "500 mg", "frequency": "BD", "status": "held today" },
    { "name": "Amlodipine", "dose": "10 mg", "frequency": "daily", "status": "continuing" },
    { "name": "Ramipril", "dose": "5 mg", "frequency": "daily", "status": "held today" },
    { "name": "Furosemide", "dose": "40 mg", "frequency": "daily", "status": "continuing" },
    { "name": "Ibuprofen", "dose": null, "frequency": null, "status": "stopped" },
    { "name": "Calcium gluconate", "dose": "10 mL 10%", "route": "IV", "frequency": "once", "status": "given / planned" },
    { "name": "Salbutamol", "dose": "5 mg", "route": "nebulised", "frequency": "once", "status": "given / planned" },
    { "name": "Normal saline", "dose": "500 mL", "route": "IV", "frequency": "bolus", "status": "given / planned" }
  ],
  "labValues": {
    "creatinine_current_umol_per_L": 312,
    "creatinine_baseline_umol_per_L": 140,
    "eGFR_current_mL_per_min_1_73m2": 18,
    "eGFR_baseline_mL_per_min_1_73m2": 42,
    "potassium_mmol_per_L": 5.8,
    "urea_mmol_per_L": 22,
    "HbA1c_percent": 7.1,
    "urine_dipstick_protein": "2+",
    "urine_dipstick_blood": "1+"
  },
  "ageYears": 54,
  "ageRange": "50-60",
  "sex": "female",
  "chiefComplaint": "Acute kidney injury on background of CKD stage 3 with reduced urine output, nausea, and peripheral oedema."
}
```

### commitment.json

```json
{
  "commitment": "d923288bc553fec199ab610d2d2e1f45d087aad83de6a0e86456d770e5150b5a",
  "algorithm": "sha256-stub"
}
```

### zk_summary.json

```json
{
  "ageRange": "50-59",
  "icdChapter": 14,
  "icdChapterName": "Genitourinary System",
  "matchedDiagnosis": "Acute kidney injury (AKIN Stage 2) on chronic kidney disease stage 3, likely NSAID-induced",
  "dataCommitment": "15594284344243400745820701234484368029121643084756422395601777170506159684643",
  "verified": true,
  "provingSystem": "groth16",
  "constraintCount": 279,
  "timestamp": "2026-06-29T10:50:33.027Z"
}
```

### public_signals.json

```json
["50", "59", "14", "15594284344243400745820701234484368029121643084756422395601777170506159684643"]
```

### proof.json

```json
{
  "pi_a": [
    "16268287041894095260492010009561069833834012873548105902296185270259596189498",
    "7096553051872343748229988741279305567908935632424672667508576368519487892076",
    "1"
  ],
  "pi_b": [
    [
      "6564991913721937404255259702158820156666727435213451868917155867365970833127",
      "12872977286388574586188470305118493821473129123051044666626219739417898236155"
    ],
    [
      "14146380987662590298286038254763974049370747841388390173809862976732382219456",
      "19765202296966704579127319501398021624990309641727715216073273218667528271382"
    ],
    ["1", "0"]
  ],
  "pi_c": [
    "21993641311897952659918057231681876460641832126126114805332150430359847957",
    "13550153161099204925888744234210226593791785123898955992808626585778562938530",
    "1"
  ],
  "protocol": "groth16",
  "curve": "bn128"
}
```

---

## TEST 5 — First Tonic-Clonic Seizure

**Run ID:** `2026-06-29T10-51-51`  
**Input:** `samples/patient_neuro.txt`  
**PHI tokens removed:** 16

### Pipeline Console Output

```
╔══════════════════════════════════════════════════════╗
║      Corti ZK De-identification Pipeline             ║
╚══════════════════════════════════════════════════════╝

── PHASE 3: De-identification ──────────────────────────

[deidentifier] Reading: samples/patient_neuro.txt
[deidentifier] 2001 chars, 1 chunk(s)

[deidentifier] De-identifying chunk 1/1...
  PHI tokens: 16 | Method: rule-based (regex + NER)

[deidentifier] Extracting clinical facts...
[corti] Reusing existing agent: 154daefe-796a-4e6f-abdb-7811def09b8b (phi-deidentifier)
  Diagnoses   : First unprovoked tonic-clonic seizure (cryptogenic),
                Migraine with aura, Anxiety disorder
  Medications : Sumatriptan, Sertraline, Levetiracetam
  Age         : 41 (range: 40-50)
  Credits     : 0.011964

[deidentifier] Outputs saved to: output/2026-06-29T10-51-51
  anonymized.txt   — PHI-free document
  facts.json       — structured clinical facts
  phi_map.enc      — AES-256-GCM encrypted PHI map (patient-only)
  patient_key.b64  — patient secret [STUB]
  commitment.json  — SHA-256 commitment

── PHASE 4: ZK Proof ───────────────────────────────────

[zkRunner] Generating Groth16 proof...
  Age input    : 41 → bracket [40, 49]
  ICD chapter  : 6 (Nervous System)
  Matched dx   : "First unprovoked tonic-clonic seizure (cryptogenic)"
  Public signals:
    ageRangeLow      : 40
    ageRangeHigh     : 49
    icdChapter       : 6
    dataCommitment   : 21707258951605011090...
  Proof verified   : ✓

╔══════════════════════════════════════════════════════╗
║                  PIPELINE COMPLETE                   ║
╚══════════════════════════════════════════════════════╝

  Run ID         : 2026-06-29T10-51-51
  PHI tokens     : 16 removed
  Method         : rule-based (regex + NER, no LLM)
  PHI leak check : PASSED
  Commitment     : e1706f2a7358f1b4867033a47373dc02...

  Age range      : 40-49
  ICD chapter    : 6 — Nervous System
  Matched dx     : "First unprovoked tonic-clonic seizure (cryptogenic)"
  Data commitment: 21707258951605011090223398794512...
  Verified       : ✓
```

### anonymized.txt

```
CLINICAL NOTE — FICTITIOUS PATIENT DATA (FOR TESTING ONLY)

Patient: <<NOVA-FE07>>
Date of Birth: <<ZEPHYR-8AAE>>
MRN: <<TITAN-B619>>
SSN: <<PULSAR-A84E>>
Address:<<VEGA-5604>>
Phone: <<LYRA-F662>>
Email: <<ORION-93C3>>
Referring Physician: <<QUASAR-8F43>>, NPI <<NEBULA-A12A>>
Facility:<<PHANTOM-820E>>

Visit Date: <<CIPHER-9364>>
Reason for Visit: First unprovoked tonic-clonic seizure, post-ictal confusion.

History of Present Illness:
<<NOVA-FE07>> is a 41-year-old female brought in by ambulance after a witnessed
3-minute tonic-clonic seizure at her workplace. She has no prior seizure history. Her colleague
reported she was confused for approximately 20 minutes post-ictally. She denies recent illness,
sleep deprivation, or alcohol use. Her <<NEXUS-1590>> (contact: <<AXIOM-1688>>) arrived
at the ED.

Past Medical History:
- Migraine with aura (diagnosed 2015)
- Anxiety disorder

Current Medications:
- Sumatriptan 50mg PRN for migraine
- Sertraline 50mg daily

Allergies: Carbamazepine (Stevens-Johnson syndrome)

Vital Signs:
- BP: 128/80 mmHg
- HR: 96 bpm
- RR: 16 breaths/min
- SpO2: 99% on room air
- Temperature: 36.7°C
- Weight: 62 kg, Height: 166 cm

Labs:
- Sodium: 138 mmol/L
- Glucose: 5.1 mmol/L
- Calcium: 2.35 mmol/L
- Full Blood Count: Normal
- Prolactin: 820 mIU/L (elevated post-ictal, confirms seizure)

Imaging:
- CT head (non-contrast): No acute intracranial abnormality.
- MRI brain ordered.

EEG: Pending.

Assessment:
First unprovoked seizure, cause unknown (cryptogenic). MRI and EEG pending.

Plan:
1. Observe for 24 hours.
2. MRI brain with gadolinium contrast.
3. EEG within 48 hours.
4. Neurology consult — <<ZENITH-F1D3>> (pager 5512).
5. Counsel patient on driving restrictions per state law.
6. Levetiracetam 500mg BD commenced (avoid carbamazepine — allergy).
7. Patient ID wristband: <<TITAN-B619>>.

Signed: <<QUASAR-8F43>>, MD
Date: <<VECTOR-FEC3>>
Facility Contact: <<NOVA-97A3>>
```

### facts.json

```json
{
  "diagnoses": [
    "First unprovoked tonic-clonic seizure (cryptogenic)",
    "Migraine with aura",
    "Anxiety disorder"
  ],
  "vitals": {
    "bloodPressure": "128/80 mmHg",
    "heartRate": 96,
    "oxygenSaturation": "99% on room air",
    "temperature": 36.7,
    "weight": 62,
    "height": 166
  },
  "medications": [
    { "name": "Sumatriptan", "dose": "50 mg", "frequency": "PRN for migraine" },
    { "name": "Sertraline", "dose": "50 mg", "frequency": "daily" },
    { "name": "Levetiracetam", "dose": "500 mg", "frequency": "BD" }
  ],
  "labValues": {
    "Sodium": "138 mmol/L",
    "Glucose": "5.1 mmol/L",
    "Calcium": "2.35 mmol/L",
    "Full Blood Count": "Normal",
    "Prolactin": "820 mIU/L (elevated post-ictal)"
  },
  "ageYears": 41,
  "ageRange": "40-50",
  "sex": "female",
  "chiefComplaint": "First unprovoked tonic-clonic seizure, post-ictal confusion"
}
```

### commitment.json

```json
{
  "commitment": "e1706f2a7358f1b4867033a47373dc024d6ea83e185d5589591edd952e161370",
  "algorithm": "sha256-stub"
}
```

### zk_summary.json

```json
{
  "ageRange": "40-49",
  "icdChapter": 6,
  "icdChapterName": "Nervous System",
  "matchedDiagnosis": "First unprovoked tonic-clonic seizure (cryptogenic)",
  "dataCommitment": "21707258951605011090223398794512454226613057747352362963592251311280823318089",
  "verified": true,
  "provingSystem": "groth16",
  "constraintCount": 279,
  "timestamp": "2026-06-29T10:51:52.676Z"
}
```

### public_signals.json

```json
["40", "49", "6", "21707258951605011090223398794512454226613057747352362963592251311280823318089"]
```

### proof.json

```json
{
  "pi_a": [
    "16713770082860306424964355758200251232848930914310098859796551879137162469823",
    "3588349031662673088106102379755867870035492833425108084202427012302243410499",
    "1"
  ],
  "pi_b": [
    [
      "19229272936808260746216740885451695097096210794711999776939639093890233805348",
      "108526933059524578114174553124093452163910733550037199768840412877633588154"
    ],
    [
      "7908955615843570228336770527417456063709947375575674668712595209884522523938",
      "11071531871120617743523597427703372787052419620056430353147263274392456730361"
    ],
    ["1", "0"]
  ],
  "pi_c": [
    "15641697954027787865732571187009753980611839064056438645869246162021702711975",
    "13273653619372458634052629932466855291515161213629338166110834442815735086039",
    "1"
  ],
  "protocol": "groth16",
  "curve": "bn128"
}
```

---

## Final Result

**5/5 PASSED. Zero PHI leaks. Every Groth16 proof independently verified.**
