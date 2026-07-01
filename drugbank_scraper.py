#!/usr/bin/env python3
"""
Corti DrugBank Scraper
Loops through 20 drugs, queries Corti drugbank-expert agent, stores results as JSON.
"""

import json
import time
import uuid
import os
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime

# ── Config ──────────────────────────────────────────────────────────────────
CLIENT_ID     = "zkip-default_client"
CLIENT_SECRET = "vSsRTbl2WJcSPmDnVN3EnWF6cyb3YYKi"
AUTH_URL      = "https://auth.eu.corti.app/realms/base/protocol/openid-connect/token"
API_BASE      = "https://api.eu.corti.app"
TENANT        = "base"
AGENT_ID      = "8e518e68-c869-4491-8bec-ae377bd09861"   # drugbank-scraper agent

DRUGS = [
    "Ibuprofen",
    "Amoxicillin",
    "Metformin",
    "Atorvastatin",
    "Lisinopril",
    "Omeprazole",
    "Sertraline",
    "Metoprolol",
    "Amlodipine",
    "Albuterol",
    "Warfarin",
    "Gabapentin",
    "Hydrochlorothiazide",
    "Prednisone",
    "Azithromycin",
    "Clopidogrel",
    "Losartan",
    "Levothyroxine",
    "Acetaminophen",
    "Ciprofloxacin",
]

PROMPT_TEMPLATE = (
    "Get the complete drug profile for {drug}. Include: "
    "generic name, brand names, drug class, mechanism of action, "
    "indications, dosage forms, common side effects, serious adverse effects, "
    "contraindications, and key drug-drug interactions. "
    "Return as structured information."
)

OUTPUT_DIR = "output/drugbank"


# ── Helpers ──────────────────────────────────────────────────────────────────
def http_post(url, data, headers):
    body = json.dumps(data).encode() if isinstance(data, dict) else urllib.parse.urlencode(data).encode()
    req  = urllib.request.Request(url, data=body, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def get_token():
    data = {
        "grant_type":    "client_credentials",
        "client_id":     CLIENT_ID,
        "client_secret": CLIENT_SECRET,
    }
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    body = urllib.parse.urlencode(data).encode()
    req  = urllib.request.Request(AUTH_URL, data=body, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())["access_token"]


def send_message(token, drug_name):
    url  = f"{API_BASE}/agents/{AGENT_ID}/v1/message:send"
    headers = {
        "Authorization": f"Bearer {token}",
        "Tenant-Name":   TENANT,
        "Content-Type":  "application/json",
    }
    payload = {
        "message": {
            "messageId": str(uuid.uuid4()),
            "role":      "user",
            "kind":      "message",
            "parts": [
                {
                    "kind": "text",
                    "text": PROMPT_TEMPLATE.format(drug=drug_name),
                }
            ],
        }
    }
    return http_post(url, payload, headers)


def extract_text(response):
    try:
        task     = response.get("task", response)
        artifacts = task.get("artifacts", [])
        if artifacts:
            parts = artifacts[0].get("parts", [])
            if parts:
                return parts[0].get("text", "")
        # fallback: status message
        msg = task.get("status", {}).get("message", {})
        parts = msg.get("parts", [])
        if parts:
            return parts[0].get("text", "")
    except Exception:
        pass
    return ""


def extract_credits(response):
    try:
        task = response.get("task", response)
        return task.get("metadata", {}).get("credits", 0)
    except Exception:
        return 0


# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    run_ts    = datetime.utcnow().strftime("%Y-%m-%dT%H-%M-%SZ")
    summary   = []
    total_credits = 0.0

    print(f"DrugBank Scraper — {len(DRUGS)} drugs — output: {OUTPUT_DIR}/\n")

    token = get_token()
    print("Token obtained.\n")

    for i, drug in enumerate(DRUGS, 1):
        print(f"[{i:02d}/{len(DRUGS)}] {drug} ...", end=" ", flush=True)

        # Refresh token every 10 drugs (tokens expire in ~5 min)
        if i % 10 == 0:
            token = get_token()

        try:
            resp    = send_message(token, drug)
            text    = extract_text(resp)
            credits = extract_credits(resp)
            total_credits += credits

            record = {
                "drug":       drug,
                "timestamp":  datetime.utcnow().isoformat() + "Z",
                "credits":    credits,
                "data":       text,
                "raw":        resp,
            }

            fname = os.path.join(OUTPUT_DIR, f"{drug.lower().replace(' ', '_')}.json")
            with open(fname, "w") as f:
                json.dump(record, f, indent=2)

            summary.append({"drug": drug, "credits": credits, "ok": bool(text), "file": fname})
            print(f"OK  ({credits:.4f} credits)")

        except Exception as e:
            print(f"ERROR: {e}")
            summary.append({"drug": drug, "credits": 0, "ok": False, "error": str(e)})

        # Small delay to avoid rate limiting
        if i < len(DRUGS):
            time.sleep(1)

    # ── Write summary ──
    summary_path = os.path.join(OUTPUT_DIR, f"summary_{run_ts}.json")
    with open(summary_path, "w") as f:
        json.dump({
            "run":           run_ts,
            "total_drugs":   len(DRUGS),
            "total_credits": round(total_credits, 6),
            "results":       summary,
        }, f, indent=2)

    print(f"\n{'─'*50}")
    print(f"Done. {sum(r['ok'] for r in summary)}/{len(DRUGS)} drugs extracted.")
    print(f"Total credits used: {total_credits:.4f}")
    print(f"Summary: {summary_path}")


if __name__ == "__main__":
    main()
