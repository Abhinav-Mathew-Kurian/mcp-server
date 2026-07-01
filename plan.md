# Corti ZK De-identification Agent — Project Plan

> A planning document for building a privacy-preserving clinical data pipeline on the Corti Agentic Framework. This is a thinking document — not implementation. Every section is a discussion starting point.

---

## 1. What We're Building

A multi-agent system on Corti's Agentic Framework that does three things in sequence:

1. **Parse** — extract structured clinical data from PDFs or other clinical documents
2. **De-identify** — strip all PII from the extracted data (HIPAA Safe Harbor)
3. **ZK Prove** — run a zero-knowledge proof over the de-identified data via our existing Circom/SnarkJS stack

The end product is submitted to Corti's Agent Library as a listed agent for other healthtech developers to use.

---

## 2. Agent Architecture (High Level)

```
User / Caller
     │
     ▼
Orchestrator Agent          ← top-level, routes tasks, enforces sequence
     │
     ├── Expert 1: Document Parser     ← PDF/doc → structured JSON
     ├── Expert 2: De-identifier       ← structured JSON → PII-stripped JSON
     └── Expert 3: ZK Runner           ← PII-stripped JSON → ZK proof (via MCP)
```

### Questions to discuss before building:

- Should the three experts be **inline** (defined inside the orchestrator on creation) or **registered separately** and referenced by name? Separate registration is cleaner for reuse and updates.
- Should experts be stateless per-call or maintain **thread/context memory** across a session? Relevant if a patient has multiple documents in one session.
- Do we want the orchestrator to be able to **retry a failed expert** or just fail fast? Healthcare pipelines usually need retry logic.

---

## 3. The Three Experts

### Expert 1 — Document Parser

**Job:** Accept raw clinical text or a PDF and return a structured JSON object with two top-level buckets — patient identifiers and clinical data.

**Things to decide:**
- How does the document actually arrive? As raw text in the message, or as a file upload via Corti's `/recordings` or `/documents` endpoint?
- Do we use Corti's built-in **Memory expert** for large-document context, or handle chunking ourselves?
- What's the output schema exactly? Need to define every field we expect — diagnoses, meds, dates, provider IDs, etc. — so the de-identifier knows what to operate on.
- Do we use **FactsR™** (Corti's real-time entity extraction API) as a pre-pass before this expert, for better PII detection accuracy?

### Expert 2 — De-identifier

**Job:** Take the structured output from Expert 1 and return a version with all 18 HIPAA Safe Harbor identifiers removed or masked.

**Things to decide:**
- **Masking strategy:** replace with `[NAME]`, pseudonymize with a consistent fake value, or generalize (e.g., exact DOB → year only)? Different use cases need different strategies — we should make this configurable via `configSchema`.
- **Consistency:** if the same patient MRN appears in three places in the record, all three must get the same pseudonym. How do we track this within a single call?
- Do we need a **de-identification audit log** — a record of what was removed and where — as part of the output? Almost certainly yes for compliance/audit trail.
- Should this expert call FactsR™ directly, or rely purely on its own LLM reasoning? FactsR™ will catch more named entities but adds latency.

### Expert 3 — ZK Runner

**Job:** Take the de-identified record and produce a Groth16 ZK proof over it via our MCP server.

**Things to decide:**
- What exactly does the circuit **prove**? Options:
  - That the original record was validly de-identified (prove knowledge of PII without revealing it)
  - That the de-identified record is structurally valid (schema compliance)
  - That specific clinical facts are present (e.g., a diagnosis code exists) without revealing the full record
  - All of the above as separate public signals
- This decision drives the **circuit design** — which may require changes to existing ZKIP-CLINICAL circuits or new circuits entirely.
- What goes into **public signals** vs. stays private? Public signals are what verifiers see on-chain or in audit trails.
- Should the proof be **stored somewhere** (IPFS, on-chain, database) or just returned to the caller?

---

## 4. The MCP Server (ZK Prover)

This is a separate service we build and host, exposed as an MCP-compliant HTTP server. The ZK Runner expert calls it.

**Proposed tools to expose:**
- `generate_proof` — takes de-identified record, returns proof + public signals + proof ID
- `verify_proof` — takes proof + public signals, returns boolean
- `get_public_signals` — retrieves public signals by proof ID

**Things to decide:**
- **Transport type:** Streamable HTTP or SSE? Streamable HTTP is simpler and Corti supports it.
- **Auth:** Bearer token is the simplest. Corti passes it in headers when calling the MCP server.
- **Where does it run?** Needs to be publicly reachable. Options: Vercel, Railway, Fly.io, our own VPS.
- **Circuit inputs:** Circom circuits only accept BigInt field elements. The de-identified record (a JSON object) needs to be hashed/encoded into circuit-compatible inputs. We need to decide the encoding strategy — probably SHA-256 of the canonical JSON string, converted to BigInt.
- **Proof storage:** In-memory is fine for MVP. For production, use Redis or a database — proof IDs need to survive server restarts if verification happens later.
- **Latency:** Groth16 proof generation is slow (seconds to tens of seconds depending on circuit size). Is this acceptable? If not, consider PLONK or FFLONK which have faster proving times.

---

## 5. Data Flow (End to End)

```
1. Caller sends clinical document text to Orchestrator
        │
2. Orchestrator calls Document Parser expert
   → Returns: { patientIdentifiers: {...}, clinicalData: {...} }
        │
3. Orchestrator calls De-identifier expert with Parser output
   → Returns: { deidentifiedRecord: {...}, deidentificationLog: [...] }
        │
4. Orchestrator calls ZK Runner expert with De-identifier output
   → ZK Runner calls MCP server → generate_proof → verify_proof
   → Returns: { zkProof: {...}, publicSignals: [...], proofHash: "...", verified: true }
        │
5. Orchestrator assembles final response:
   {
     deidentifiedRecord: {...},
     deidentificationLog: [...],
     zkProof: {...},
     publicSignals: [...],
     proofHash: "...",
     auditTrail: { timestamp, method, circuitId }
   }
```

---

## 6. Open Questions Before Writing Any Code

These need answers before implementation starts:

### Circuit / ZK Questions
- Do existing ZKIP-CLINICAL circuits work for this use case, or do we need new ones?
- What is the circuit's input signal structure? This determines how we encode the de-identified record.
- Do we want on-chain attestation (Sepolia) as part of the output, or off-chain proof only for now?

### Corti Platform Questions
- Are we creating the experts as **ephemeral** (temporary, not listed) during development, then making them permanent for production?
- Does Corti's Agent Library listing require a formal review process, or is there a self-serve path? (Current understanding: it's a manual review — contact `help.corti.app`.)
- What does Corti's **revenue share model** look like for Agent Library listings? Need to ask them directly.

### Product / Scope Questions
- What is the **minimum viable output** that Corti would accept to list this in the Agent Library?
- Do we need a demo environment with synthetic patient data to show Corti during review?
- Is the MCP server part of what we "sell" (i.e., customers bring their own ZK stack), or do we host it as a shared service?

---

## 7. Phases

### Phase 1 — Foundation
- Set up Corti console account, generate credentials
- Build and deploy the MCP server locally (ngrok for dev)
- Validate that Corti can reach the MCP server and call tools successfully
- No agents yet — just confirm the MCP connection works

### Phase 2 — Experts
- Create Document Parser expert, test in isolation
- Create De-identifier expert, test in isolation with Parser output
- Create ZK Runner expert, test with MCP server end-to-end
- Confirm each expert's output schema is clean and consistent

### Phase 3 — Orchestration
- Create Orchestrator agent referencing all three experts
- Run full end-to-end pipeline with a synthetic clinical document
- Validate: de-identification is complete, ZK proof verifies successfully

### Phase 4 — Hardening
- Handle edge cases: malformed documents, missing fields, MCP server failures
- Add retry logic for ZK proof generation (it can be flaky)
- Add de-identification audit log to every response
- Performance test: what's the end-to-end latency?

### Phase 5 — Agent Library Submission
- Write agent description and documentation for Corti's listing
- Prepare a demo with synthetic patient data
- Contact Corti at `help.corti.app` to initiate review
- Negotiate revenue share / licensing terms

---

## 8. Key Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| ZK proof generation is too slow for real-time use | High | Test latency early; consider async proof flow |
| Corti's Agent Library has no public self-serve listing path | High | Contact Corti early in Phase 1 to confirm the process |
| De-identifier LLM misses some PII | Critical | Add FactsR™ as pre-pass; add deterministic regex post-pass as safety net |
| MCP server goes down mid-pipeline | Medium | Add health check + graceful error response from ZK Runner expert |
| Circuit inputs don't match de-identified record structure | Medium | Design circuit inputs and record schema together before building either |

---

## 9. References

- Corti Console: https://console.corti.app
- Corti Docs: https://docs.corti.ai
- Corti Agent API: https://docs.corti.ai/agentic/agents/create-agent
- Corti MCP Auth: https://docs.corti.ai/agentic/mcp-authentication
- Corti Agent Library: https://www.corti.ai/agents
- SnarkJS: https://github.com/iden3/snarkjs
- Circom: https://docs.circom.io
- HIPAA Safe Harbor: https://www.hhs.gov/hipaa/for-professionals/privacy/special-topics/de-identification