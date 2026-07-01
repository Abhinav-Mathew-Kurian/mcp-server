# Current Corti Problem: API Agent vs Console UI Visibility

**Project:** ZKIP — `8a9184e2-d7ba-4eda-b52b-ca225e265376`
**Tenant:** `base` | **Region:** EU
**Date:** 2026-06-29
**Status:** UNRESOLVED — awaiting Corti support

---

## The Problem in One Line

Agents created via the Corti API are **never visible** in the Corti Console browser UI under "My agents", and agents created in the browser cannot be accessed via the API.

---

## What We Expected

After creating an agent programmatically using `@corti/sdk` with a personal API client (`zkip-abhinav`), the agent should appear in:
```
console.corti.app → My agents → phi-deidentifier
```
...and be chattable directly in the browser without running any code.

---

## What Actually Happens

The agent is created successfully via the API (HTTP 201, valid agent ID returned), works correctly for all API calls, but **does not appear in the browser console under "My agents"**. The tab only ever shows "Prebuilt agents".

---

## Attempts Made

### Attempt 1 — Service account `zkip-default_client`

**Credentials used:**
```
CORTI_CLIENT_ID=zkip-default_client
CORTI_CLIENT_SECRET=vSsRTbl2WJcSPmDnVN3EnWF6cyb3YYKi
```

**Agent created:**
```json
{ "agentId": "bf9ab41d-0f53-4d8d-80da-545235823e5a", "agentName": "phi-deidentifier" }
```

**Result:** Agent created and fully functional via API. Not visible in browser console.

**Why it failed:** `zkip-default_client` is a service account auto-created by the platform. Agents it creates are owned by the service principal, not the personal user account. Console "My agents" only shows personal account agents.

---

### Attempt 2 — Console-created agent, accessed via service account

User manually created `phi-deidentifier` in the browser console:
```
Agent ID: a9a92890-b41a-43b4-b4ba-54ff01da1a55
```

Code then tried to reuse this agent via the service account API client.

**API response:**
```
GET /agents/a9a92890-b41a-43b4-b4ba-54ff01da1a55
→ 404 Not Found
```

**Why it failed:** Console agents are owned by the personal user login session. Service account API clients cannot access agents owned by a different identity — even within the same project.

---

### Attempt 3 — "My clients" tab (locked)

Discovered "My clients" tab in the API Clients section of the console. This is the intended path for creating a personal API client that shares the user's identity.

**Result:** Tab was locked/greyed out — feature is gated behind a higher plan tier.

---

### Attempt 4 — Personal API client `zkip-abhinav`

Clicking "Create API client" caused the previously greyed-out "My clients" tab to become active. A personal client `zkip-abhinav` was created through it.

**Agent created:**
```json
{ "agentId": "154daefe-796a-4e6f-abdb-7811def09b8b", "agentName": "phi-deidentifier" }
```

**API works perfectly:**
```
[corti] Created new agent: 154daefe-796a-4e6f-abdb-7811def09b8b (phi-deidentifier)
Smoke test PASSED — Auth OK, messages sent, context maintained, agent reused
```

**Browser result:** Still only shows "Prebuilt agents". Agent not visible.

**Why it failed:** Personal API clients are still a separate identity from the browser login session. The console "My agents" tab is scoped to the interactive user session (OAuth browser login) only — not API clients, even personal ones.

---

### Attempt 5 — Console-created agent accessed via personal client

User created a new agent directly in browser console:
```
Agent ID: d87a5626-2372-4226-94c1-50d7737f49e5
```

Code updated `.agent-state.json` to use this ID, then called GET with `zkip-abhinav`.

**API response:**
```
GET /agents/d87a5626-2372-4226-94c1-50d7737f49e5
→ 404 Not Found
```

**Why it failed:** Console browser session agents and API client agents are completely isolated — even when the API client is personal. There is no cross-access between identities.

---

## Root Cause

Corti's platform enforces strict identity isolation between:

| Identity Type | Who it is | Can access |
|---|---|---|
| Browser session | User logged into console.corti.app | Own console-created agents only |
| Service account (`zkip-default_client`) | Auto-created service principal | Own API-created agents only |
| Personal API client (`zkip-abhinav`) | Named API client under user | Own API-created agents only |

**None of these identities can access agents created by another identity — even within the same project.**

---

## Current State

| Agent | ID | Visible in browser | Works via API |
|---|---|---|---|
| Browser-created `phi-deidentifier` | `d87a5626-2372-4226-94c1-50d7737f49e5` | YES | NO (404) |
| API-created `phi-deidentifier` | `154daefe-796a-4e6f-abdb-7811def09b8b` | NO | YES (fully working) |

---

## What Needs to Happen

Contact Corti support at **help.corti.app** with the following request:

> "Agents created via API client `zkip-abhinav` in project `8a9184e2-d7ba-4eda-b52b-ca225e265376` do not appear in the console under 'My agents' for account `kottackalabhinav@gmail.com`. The browser session and API client identities are completely isolated. Please either:
> 1. Link API client `zkip-abhinav` to my personal account so its agents appear in 'My agents', or
> 2. Allow agent `154daefe-796a-4e6f-abdb-7811def09b8b` to be transferred to / accessed from the browser session."

---

## Impact on Pipeline

**Zero.** The pipeline runs entirely via the API. De-identification, ZK proofs, patient re-identification, and encrypted output all work without needing browser visibility. This is purely a developer experience issue — the agent cannot be chatted with directly in the browser.
