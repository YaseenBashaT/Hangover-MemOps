"""
Phase 2 (consolidated) — re-seed all incidents into ONE shared dataset, then run
the 3 verification recalls with per-recall LLM call counting and cost.

Proves recall dropped from ~17 LLM calls (one per old per-incident dataset) to ~1.
Groq llama-3.3-70b-versatile pricing: $0.59/1M input, $0.79/1M output.
"""

import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

import litellm
from litellm.integrations.custom_logger import CustomLogger

# memory_service configures Cognee (Groq) from .env on import
from backend.services.memory_service import ingest_incident, recall_for_alert
import cognee
from seed import ALL_INCIDENTS, VERIFICATIONS

IN_PRICE = 0.59 / 1_000_000   # $ per input token
OUT_PRICE = 0.79 / 1_000_000  # $ per output token


class CallTracker(CustomLogger):
    """Counts successful LLM completion calls + tokens via litellm callbacks."""
    def __init__(self):
        self.reset()

    def reset(self):
        self.calls = 0
        self.in_tok = 0
        self.out_tok = 0

    def _record(self, response_obj):
        try:
            u = getattr(response_obj, "usage", None)
            if u is not None:
                self.calls += 1
                self.in_tok += getattr(u, "prompt_tokens", 0) or 0
                self.out_tok += getattr(u, "completion_tokens", 0) or 0
        except Exception:
            pass

    def log_success_event(self, kwargs, response_obj, start_time, end_time):
        self._record(response_obj)

    async def async_log_success_event(self, kwargs, response_obj, start_time, end_time):
        self._record(response_obj)

    def cost(self):
        return self.in_tok * IN_PRICE + self.out_tok * OUT_PRICE

    def summary(self):
        return (f"calls={self.calls}  in_tok={self.in_tok}  out_tok={self.out_tok}  "
                f"cost=${self.cost():.4f}")


tracker = CallTracker()
litellm.callbacks = [tracker]


async def run():
    print("\n" + "="*64)
    print("PHASE 2 (CONSOLIDATED) — single shared 'incidents' dataset")
    print("="*64)

    print("\n[0] Wiping all existing data (the old 17 per-incident datasets)...")
    await cognee.forget(everything=True)
    print("    Wiped.\n")

    print(f"[1] Seeding {len(ALL_INCIDENTS)} incidents into ONE shared dataset...")
    tracker.reset()
    for i, incident in enumerate(ALL_INCIDENTS, 1):
        iid = incident["incident_id"]
        print(f"    [{i:02d}/{len(ALL_INCIDENTS)}] {iid} ({incident['service_affected']})...",
              end=" ", flush=True)
        await ingest_incident(incident)
        print("done.")
    print(f"\n    SEED COST: {tracker.summary()}\n")
    seed_cost = tracker.cost()

    print("="*64)
    print("VERIFICATION RECALLS (per-recall call count + cost)")
    print("="*64)

    grand = seed_cost
    for idx, query in enumerate(VERIFICATIONS, 1):
        tracker.reset()
        result = await recall_for_alert(query)
        grand += tracker.cost()

        print(f"\n{'='*64}")
        print(f"RECALL {idx}: {query!r}")
        print(f"  >> LLM CALLS: {tracker.calls}   COST: ${tracker.cost():.4f}   "
              f"({tracker.in_tok} in / {tracker.out_tok} out tokens)")
        print("="*64)
        print(f"  Count : {result['count']} result(s)")
        for j, r in enumerate(result["results"]):
            print(f"  --- Result {j+1} ---")
            print(f"    search_type : {r['search_type']}")
            print(f"    dataset     : {r['dataset_name']}")
            print(f"    text        : {r['text']}")

    print("\n" + "="*64)
    print(f"TOTAL COST THIS RUN (seed + 3 recalls): ${grand:.4f}")
    print("="*64)


if __name__ == "__main__":
    asyncio.run(run())
