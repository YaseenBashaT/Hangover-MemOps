"""
Reset MemOps to a clean 17-incident state for the demo: wipe the Cognee graph
AND the structured store, then re-ingest exactly the 17 seed incidents. Removes
any stray incidents added during earlier testing (e.g. INC-2025-0930).

Run from MemOps/: venv/bin/python reseed17.py
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dotenv import load_dotenv
load_dotenv(".env")

import cognee
from seed import ALL_INCIDENTS
from backend.services import memory_service


async def run():
    print(f"[0] Wiping graph + store (currently {len(memory_service._load_store())} store records)...")
    await cognee.forget(everything=True)
    memory_service._save_store([])  # clear the structured store completely
    print("    Wiped.")

    print(f"[1] Ingesting {len(ALL_INCIDENTS)} seed incidents...")
    for i, inc in enumerate(ALL_INCIDENTS, 1):
        await memory_service.ingest_incident(inc)
        print(f"    [{i:02d}/{len(ALL_INCIDENTS)}] {inc['incident_id']} ({inc['service_affected']}) done.")

    store = memory_service._load_store()
    print(f"\n[2] Done. Store now holds {len(store)} incidents.")
    ids = sorted(r["incident_id"] for r in store)
    print("    IDs:", ids)


if __name__ == "__main__":
    asyncio.run(run())
