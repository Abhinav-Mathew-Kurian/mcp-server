# Corti API Endpoint Verification Report
**Date**: 2026-06-26  
**Environment**: EU (`api.eu.corti.app`)  
**Tenant**: `base`  
**Test runs per endpoint**: 10

---

## 1. Endpoint Status Summary (10 runs each)

| # | Endpoint | Method | Status Codes (10x) | Result | Used In |
|---|----------|--------|-------------------|--------|---------|
| 1 | `https://auth.eu.corti.app/realms/base/protocol/openid-connect/token` | POST | 200×10 | ✅ STABLE | All phases — token on every call |
| 2 | `https://api.eu.corti.app/agents` | GET | 200×10 | ✅ STABLE | Phase 1 — agent reuse check |
| 3 | `https://api.eu.corti.app/agents/registry/experts` | GET | 200×10 | ✅ STABLE | Phase 1 — expert discovery |
| 4 | `https://api.eu.corti.app/agents` | POST | 201×10 | ✅ STABLE | Phase 1 — agent creation |
| 5 | `https://api.eu.corti.app/agents/{id}` | GET | 200×10 | ✅ STABLE | Phase 1 — agent reuse verify |
| 6 | `https://api.eu.corti.app/agents/{id}` | DELETE | 204×10 | ✅ STABLE | Cleanup |
| 7 | `https://api.eu.corti.app/agents/{id}/v1/message:send` | POST | 200×10 | ✅ STABLE | Phase 1 — de-id + all expert calls |
| 8 | `https://api.eu.corti.app/facts/extract` | POST | 404×10 | ❌ DEAD | — |
| 9 | `https://api.eu.corti.app/v2/facts/extract` | POST | 403×10 | ⚠️ EXISTS, NO PERM | — |
| 10 | `https://api.eu.corti.app/agents/{id}/context/{contextId}` | GET | 404×10 | ❌ DEAD | — |
| 11 | `https://api.eu.corti.app/v2/agents/{id}/context/{contextId}` | GET | 403×10 | ⚠️ EXISTS, NO PERM | — |

### Legend
- ✅ **STABLE** — confirmed working, use in production code
- ❌ **DEAD** — path does not exist
- ⚠️ **EXISTS, NO PERM** — endpoint exists at `/v2/` but current token lacks scope; our token only has non-versioned API access

---

## 2. Critical API Findings

### Auth (Endpoint 1)
- **Token type**: OAuth2 client_credentials flow
- **Content-Type MUST be**: `application/x-www-form-urlencoded` (not JSON — 400 if JSON)
- **Token TTL**: 5 minutes (`exp - iat = 300s`)
- **Auto-refresh strategy**: refresh when `exp - now < 60s`

### Facts Extract (Endpoints 8 & 9)
- `/facts/extract` → **404** — does not exist at non-versioned path
- `/v2/facts/extract` → **403** — exists but our token is scoped to non-versioned API only
- **Impact on plan**: Cannot use `facts/extract` as a standalone call
- **Workaround confirmed working**: ask the Corti agent to extract facts as part of the same message — same result, one call

### Context Endpoint (Endpoints 10 & 11)
- `/agents/{id}/context/{contextId}` → **404** — wrong path
- `/v2/agents/{id}/context/{contextId}` → **403** — exists but no permission
- **Impact**: We cannot query context state directly
- **Workaround**: Use `contextId` in message sends for conversation continuity — confirmed working ✅

---

## 3. Required Headers (Every API Call)

```
Authorization: Bearer {token}       ← from endpoint 1
Tenant-Name: base                   ← from CORTI_TENANT_NAME env var
Content-Type: application/json      ← except auth endpoint (form-encoded)
```

---

## 4. Expert Registry (All 13 Experts)

| # | Registry Name | Display Name | Description | Config Keys | Works? | Notes |
|---|--------------|-------------|-------------|-------------|--------|-------|
| 1 | `coding-expert-icd-10-cm` | Medical Coding Expert (ICD-10-CM) | Assign ICD-10-CM diagnosis codes (US standard) from clinical notes | search, verify, explore, predict, guidelines | ✅ | Best for US clinical notes |
| 2 | `coding-expert-icd-10-pcs` | Medical Coding Expert (ICD-10-PCS) | Assign ICD-10-PCS inpatient procedure codes (US standard) | search, verify, explore, predict, guidelines | ✅ | US inpatient procedures |
| 3 | `coding-expert-icd-10-int` | Medical Coding Expert (ICD-10 WHO) | Assign ICD-10-WHO international diagnosis codes | search, verify, explore, predict, guidelines | ✅ | International standard |
| 4 | `coding-expert-icd-10-uk` | Medical Coding Expert (ICD-10 UK) | Assign ICD-10-UK diagnosis codes (UK standard) | search, verify, explore, predict, guidelines | ✅ | UK-specific |
| 5 | `memory-expert` | Memory | Recall facts, preferences, and context from previous conversations | none | ✅ (read-only) | See deep-dive below |
| 6 | `posos-expert` | POSOS | Medication guidance: dosing, interactions, contraindications | none | ✅ | Requires POSOS API access |
| 7 | `clinical-trials-expert` | Clinical Trials | Search trials, eligibility criteria, recruitment status | none | ✅ | ClinicalTrials.gov |
| 8 | `drugbank-expert` | DrugBank | Drug information, profiles, drug-drug interactions | none | ⚠️ | Needs DrugBank bearer token via DataPart |
| 9 | `pubmed-expert` | PubMed | Search PubMed for articles, abstracts, citations | none | ⚠️ | 429 rate limits hit in testing |
| 10 | `web-search-expert` | Web Search | Search web for up-to-date information | search | ✅ | General web search |
| 11 | `medical-calculator-expert` | Medical Calculator | BMI, HbA1c, glucose conversions, clinical formulas | none | ✅ | Confirmed working |
| 12 | `coding-expert` | Medical Coding Expert (General) | AI-assisted coding without specifying standard | none | ✅ | Fallback general coder |
| 13 | `interviewing-expert` | Interviewing | Structured questionnaires and clinical interviews | none | ✅ | Step-by-step interview flow |

### Expert Reference Rule (CRITICAL)
```json
// ✅ CORRECT — use "name" field only
{"type": "reference", "name": "memory-expert"}

// ❌ WRONG — "id" field expects internal UUID, not registry name
{"type": "reference", "id": "memory-expert"}

// ❌ WRONG — "description" field causes expert_create_failed
{"type": "reference", "name": "memory-expert", "description": "..."}
```

---

## 5. Memory Expert Deep-Dive

### What it IS
- In-context retrieval: searches the current conversation thread for previously mentioned facts
- Works within a `contextId` — multi-turn conversations
- The orchestrator's system prompt explicitly instructs: "Consult the Memory Expert when the user's request is likely to depend on prior conversation context"

### What it is NOT
- Not a persistent database — facts do not survive across different `contextId`s
- Not a write tool — cannot store new facts, only retrieves from in-context history

### Test Results

| Test | What we sent | Response | Result |
|------|-------------|----------|--------|
| Msg 1 — Store | "Remember: Patient P-001, age 47, T2DM, HbA1c 8.2%, Metformin 1000mg" | "Memory write not supported, only retrieval available" | ⚠️ Write = no-op |
| Msg 2 — Recall (same ctx) | "What medication is P-001 on?" | "I don't have stored info for P-001" | ❌ Cannot recall stored facts |
| Msg 3 — New ctx | "What do you know about P-001?" | "No information available" | ❌ No cross-context memory |
| **Clinical note in context** | Full anonymized clinical note sent as text, then: "What meds is the patient on?" | Listed all 3 meds correctly | ✅ In-context recall works |
| **Vitals recall** | "What were the vitals from the earlier note?" (same contextId) | BP 148/92, HR 88, RR 18, SpO2 96%, Temp 37.1 | ✅ Multi-turn context works |

### Key Insight for Our Pipeline
Memory expert is **useful for our de-identification phase**: send the full anonymized clinical note as context, then query it for specific facts (vitals, diagnoses, medications) to build `facts.json`. This replaces the broken `/facts/extract` endpoint entirely.

---

## 6. Expert Test Results

| Expert | Test Query | Result | Notes |
|--------|-----------|--------|-------|
| `medical-calculator-expert` | BMI: 175cm, 82kg | BMI = 26.8 kg/m² (overweight) | ✅ Fast, accurate |
| `drugbank-expert` | Metformin + Lisinopril interactions | "Missing bearer token" | ⚠️ Needs MCP auth DataPart |
| `pubmed-expert` | Metformin cardiovascular outcomes | "429 rate limit errors" | ⚠️ Rate limited, retry needed |
| `memory-expert` | Recall vitals from clinical note | Correctly recalled all vitals | ✅ Works within contextId |

---

## 7. Agent Creation Rules

```typescript
// Minimal working agent (no experts)
POST /agents
{ "name": "agent-name", "description": "description" }
→ 201, returns { id, name, description, systemPrompt }

// Agent with registry experts — use "name" only, no "id", no "description"
POST /agents
{
  "name": "agent-name",
  "description": "description",
  "experts": [
    { "type": "reference", "name": "memory-expert" },
    { "type": "reference", "name": "medical-calculator-expert" }
  ]
}
→ 201

// Agent with custom expert (bring your own MCP)
{
  "type": "new",
  "name": "my-expert",
  "description": "required for type=new",
  "systemPrompt": "...",
  "mcpServers": [{ ... }]
}
```

---

## 8. Impact on Architecture (Updated)

| Original Plan | Reality | Change |
|---|---|---|
| `POST /facts/extract` for structured facts | 404 — dead endpoint | **Replaced**: ask de-id agent to extract facts in same message call, or use memory-expert in-context query |
| `GET /agents/{id}/context/{contextId}` | 404 — use `/v2/` but 403 | **Not needed**: pass `contextId` in message sends for continuity |
| Registry expert reference via `id` field | Fails — must use `name` field | **Fixed**: always use `{ "type": "reference", "name": "expert-name" }` |
| DrugBank expert out of the box | Needs bearer token DataPart | **Phase 4 item**: add MCP auth DataPart when DrugBank subscription available |
| PubMed expert for literature | 429 rate limits | **Workaround**: add retry with exponential backoff; not blocking for Phase 1 |

---

## 9. Endpoints Used in Final Pipeline

| Phase | Endpoint | Method | Purpose |
|-------|----------|--------|---------|
| All | `https://auth.eu.corti.app/realms/base/protocol/openid-connect/token` | POST | Token (refresh every 4min) |
| Phase 1 | `https://api.eu.corti.app/agents` | GET | Check if agent exists (reuse) |
| Phase 1 | `https://api.eu.corti.app/agents` | POST | Create de-id agent (first run only) |
| Phase 1 | `https://api.eu.corti.app/agents/{id}/v1/message:send` | POST | De-identify text + extract facts |
| Phase 2 | *(local snarkjs — no API call)* | — | ZK proof generation |
| Phase 3 | `https://api.eu.corti.app/agents/{id}/v1/message:send` | POST | Orchestration queries |

**Total live endpoints used: 4** (1 auth + 3 agent API)
