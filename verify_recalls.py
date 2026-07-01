"""
Phase 2 verification — runs the 3 recall queries against the already-seeded graph.
LLM config (Gemini) comes from .env via memory_service. Ingestion is already done;
this only reads from the graph and generates the completion.
"""

import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

# memory_service configures Cognee (Gemini) from .env on import
from backend.services.memory_service import recall_for_alert

VERIFICATIONS = [
    "payments-api connection issues",
    "recommendation-service high memory usage",
    "api-gateway certificate problem",
]


async def run():
    print("\n" + "="*60)
    print("PHASE 2 — VERIFICATION RECALLS (Gemini 2.5 Flash)")
    print("="*60)

    for idx, query in enumerate(VERIFICATIONS, 1):
        if idx > 1:
            # Stay under Gemini free-tier 5 requests/minute ceiling
            print("\n   (spacing 20s to respect free-tier rate limit...)")
            await asyncio.sleep(20)

        print(f"\n{'='*60}")
        print(f"RECALL {idx}: {query!r}")
        print("="*60)

        result = await recall_for_alert(query)
        print(f"\nQuery : {result['query']}")
        print(f"Count : {result['count']} result(s)\n")

        for j, r in enumerate(result["results"]):
            print(f"--- Result {j+1} ---")
            print(f"  type        : {r['type']}")
            print(f"  source      : {r['source']}")
            print(f"  search_type : {r['search_type']}")
            print(f"  dataset     : {r['dataset_name']}")
            print(f"  text        : {r['text']}")
            print(f"  raw         : {r['raw']}")
            print()

    print("="*60)
    print("END OF VERIFICATION RECALLS")
    print("="*60)


asyncio.run(run())
