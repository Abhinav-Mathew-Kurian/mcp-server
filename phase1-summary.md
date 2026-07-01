# Phase 1 Summary — Foundation
**Completed**: 2026-06-26  
**Status**: ✅ PASSED

---

## What Was Built

| File | Purpose |
|------|---------|
| `package.json` | Project dependencies and npm scripts |
| `tsconfig.json` | TypeScript compiler config (ES2020, strict mode, commonjs) |
| `config.json` | Single source of truth for all behaviour — PHI categories, agent settings, output dir, chunk size, encryption algo. No secrets. |
| `src/config.ts` | Loads and validates `config.json` at startup. Throws descriptive errors on missing fields. |
| `src/corti.ts` | Full Corti API client: token fetch, auto-refresh, agent create/reuse, sendMessage, deleteAgent |
| `.gitignore` | Protects credentials, agent state, output files, circuit build artifacts |
| `.agent-state.json` | Auto-created on first run — persists the Corti agent ID so it is reused across all subsequent runs |

---

## Your Live Corti Agent

| Field | Value |
|-------|-------|
| **Agent ID** | `cd1817f8-7c31-4968-97fd-061615362700` |
| **Agent Name** | `phi-deidentifier` |
| **Tenant** | `base` |
| **Region** | `eu` (Europe) |
| **API Base** | `https://api.eu.corti.app` |
| **Auth URL** | `https://auth.eu.corti.app/realms/base/protocol/openid-connect/token` |
| **State file** | `.agent-state.json` (project root) |
| **Experts attached** | `memory-expert` (in-context recall) |

To view this agent in the Corti console (if access is available):
```
https://console.corti.app/agents/cd1817f8-7c31-4968-97fd-061615362700
```

---

## Smoke Test Results

```
=== Corti Client Smoke Test ===

1. Fetching token...              OK  (200, Bearer token 300s TTL)
2. Getting/creating agent...      OK  (201 Created, ID saved to .agent-state.json)
3. Sending test message...        OK  (Response: "READY", contextId returned)
4. Multi-turn follow-up...        OK  (Agent recalled its role from prior message)
5. Agent reuse (2nd instance)...  OK  (Same agent ID returned — no duplicate created)

=== Smoke test PASSED ===
```

---

## Key Design Decisions

**Config-driven, zero hardcoding**
All PHI categories, agent name/description, chunk sizes, output paths, and encryption algorithm live in `config.json`. Changing behaviour never requires touching source files.

**Agent reuse via `.agent-state.json`**
First run creates the Corti agent and persists its ID. Every subsequent run reuses it. If the agent is externally deleted, the client detects the 404 and creates a fresh one automatically.

**Token auto-refresh**
`getToken()` checks `exp - now < 60s` before every API call. If within the 60s buffer, it re-fetches. Tokens are 300s TTL — this means at most one extra fetch per 4 minutes, never an expired-token error mid-pipeline.

**`.env.local` loading**
Used `dotenv.config({ path: '.env.local' })` explicitly — not `dotenv/config` which only reads `.env`.

---

## How to Run

```bash
# Install dependencies (first time only)
npm install

# Run Phase 1 smoke test
npx ts-node src/corti.ts

# Expected output
# Agent ID: cd1817f8-7c31-4968-97fd-061615362700
# Smoke test PASSED
```

---

## Files Created This Phase

```
corti-AI-agent/
├── package.json          ✅ new
├── tsconfig.json         ✅ new
├── config.json           ✅ new
├── .gitignore            ✅ new
├── .agent-state.json     ✅ auto-created on first run
└── src/
    ├── config.ts         ✅ new
    └── corti.ts          ✅ new
```

---

## What Phase 2 Built On Top

Phase 2 (Document Ingestion) imports `loadConfig()` from `src/config.ts` and uses `config.deidentification.chunkSize` / `chunkOverlap` directly — no repeated config logic.
