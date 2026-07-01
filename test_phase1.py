"""
Phase 1 verification: ingest 2 related incidents, then recall across both.
Run from the MemOps/ directory: python test_phase1.py
"""

import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from backend.services.memory_service import ingest_incident, recall_for_alert
import cognee


INCIDENT_1 = {
    "incident_id": "INC-2024-1014",
    "alert_name": "connection_pool_exhausted",
    "service_affected": "payments-api",
    "severity": "critical",
    "timestamp": "2024-10-14T03:14:00Z",
    "error_log": (
        "FATAL: remaining connection slots are reserved for non-replication superuser connections. "
        "psycopg2.OperationalError: connection pool exhausted. "
        "Active connections: 100/100. All slots occupied."
    ),
    "slack_thread": [
        "sarah-chen [03:15]: PagerDuty fired — payments-api is down, DB connections maxed out",
        "sarah-chen [03:21]: Checked pg_stat_activity — 100 active connections, pool_size=10 in config",
        "sarah-chen [03:35]: Increased pool_size from 10 to 50 in database.yml and restarted service. Payments recovering.",
    ],
    "jira_ticket": {
        "id": "PAY-1847",
        "title": "payments-api: connection pool exhaustion at 03:14",
        "resolution": (
            "Root cause: pool_size set to 10, insufficient for peak traffic. "
            "Fix: increased max_pool_size to 50 in database.yml, restarted payments-api. "
            "Monitor connection usage going forward."
        ),
    },
    "git_commits": [
        "a3f9c12 config: increase payments-api DB pool_size from 10 to 50",
        "b7e2a44 chore: restart payments-api after pool config change",
    ],
    "fix_applied": "Increased database connection pool size from 10 to 50 in database.yml and restarted the payments-api service.",
    "outcome": "resolved",
    "engineer_name": "sarah-chen",
    "resolution_time_minutes": 23,
}

INCIDENT_2 = {
    "incident_id": "INC-2025-0203",
    "alert_name": "connection_pool_exhausted",
    "service_affected": "payments-api",
    "severity": "critical",
    "timestamp": "2025-02-03T02:47:00Z",
    "error_log": (
        "FATAL: remaining connection slots are reserved for non-replication superuser connections. "
        "psycopg2.OperationalError: connection pool exhausted. "
        "Active connections: 50/50. Pool size at current maximum."
    ),
    "slack_thread": [
        "raj-patel [02:48]: Same alert as October — payments-api connection pool exhausted again",
        "raj-patel [02:51]: I remember sarah-chen hit this in October (PAY-1847). Pulling that runbook now.",
        "raj-patel [02:55]: Pool at 50/50. We already increased once. This time adding PgBouncer middleware + pool to 100.",
        "raj-patel [02:58]: PgBouncer deployed, pool_size bumped to 100, payments-api restarted. Service recovered.",
    ],
    "jira_ticket": {
        "id": "PAY-2193",
        "title": "payments-api: connection pool exhaustion recurrence — Feb 2025",
        "resolution": (
            "Recurrence of PAY-1847 pattern. Previous fix (pool=50) insufficient for February traffic growth. "
            "Fix: added PgBouncer connection pooling middleware, increased pool_size to 100. "
            "Root cause: traffic growth outpaced the October fix. Recommended: implement connection pool autoscaling."
        ),
    },
    "git_commits": [
        "c9d4b77 infra: deploy PgBouncer connection pooling for payments-api",
        "d1e8f33 config: increase payments-api DB pool_size from 50 to 100",
        "e5a2c11 chore: restart payments-api with new pooling configuration",
    ],
    "fix_applied": (
        "Deployed PgBouncer connection pooling middleware and increased pool_size from 50 to 100. "
        "Raj referenced the October 2024 incident (PAY-1847) and escalated the fix based on prior resolution."
    ),
    "outcome": "resolved",
    "engineer_name": "raj-patel",
    "resolution_time_minutes": 11,
}

RECALL_QUERY = "connection pool exhausted payments-api critical"


async def run():
    print("\n" + "="*60)
    print("PHASE 1 VERIFICATION")
    print("="*60)

    print("\n[1] Wiping all existing data for a clean test...")
    await cognee.forget(everything=True)
    print("    Wiped.")

    print("\n[2] Ingesting Incident 1 (INC-2024-1014 — sarah-chen, October 2024)...")
    await ingest_incident(INCIDENT_1)
    print("    Done.")

    print("\n[3] Ingesting Incident 2 (INC-2025-0203 — raj-patel, February 2025)...")
    await ingest_incident(INCIDENT_2)
    print("    Done.")

    print(f"\n[4] Recalling: {RECALL_QUERY!r}")
    result = await recall_for_alert(RECALL_QUERY)

    print("\n" + "="*60)
    print("FULL RAW RECALL OUTPUT")
    print("="*60)
    print(f"\nQuery  : {result['query']}")
    print(f"Count  : {result['count']} result(s)\n")

    for i, r in enumerate(result["results"]):
        print(f"--- Result {i+1} ---")
        print(f"  type        : {r['type']}")
        print(f"  source      : {r['source']}")
        print(f"  search_type : {r['search_type']}")
        print(f"  dataset     : {r['dataset_name']}")
        print(f"  text        : {r['text']}")
        print(f"  raw         : {r['raw']}")
        print()

    print("="*60)
    print("END OF RECALL OUTPUT")
    print("="*60)


asyncio.run(run())
