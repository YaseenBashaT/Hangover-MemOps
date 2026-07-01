"""Phase 0: Verify live ingest → recall cycle with Groq LLM + fastembed."""
import asyncio
import os
from dotenv import load_dotenv

load_dotenv()

import cognee

cognee.config.set_llm_provider("custom")
cognee.config.set_llm_model("openai/llama-3.3-70b-versatile")
cognee.config.set_llm_endpoint("https://api.groq.com/openai/v1")
cognee.config.set_llm_api_key(os.getenv("LLM_API_KEY"))
cognee.config.set_embedding_provider("fastembed")
cognee.config.set_embedding_model("BAAI/bge-small-en-v1.5")
cognee.config.set_embedding_dimensions(384)

DUMMY_TEXT = (
    "Database connection pool exhausted on payments-api service at 03:14. "
    "On-call engineer restarted the service and increased pool size from 10 to 50. "
    "Incident resolved in 23 minutes."
)

RECALL_QUERY = "has the payments-api had connection issues before"


async def run():
    print("\n[1] Wiping previous test data...")
    try:
        await cognee.forget(everything=True)
        print("    wiped.")
    except Exception as e:
        print(f"    forget failed (ok on first run): {e}")

    print("\n[2] Ingesting dummy incident text via cognee.remember()...")
    result = await cognee.remember(DUMMY_TEXT, dataset_name="test_dataset")
    print(f"    remember() returned: {type(result).__name__}")

    print("\n[3] Recalling...")
    print(f"    query: {RECALL_QUERY!r}")
    results = await cognee.recall(RECALL_QUERY, datasets=["test_dataset"])

    print(f"\n    recall() returned {len(results)} result(s)")
    print("\n=== FULL RAW RECALL OUTPUT ===")
    for i, r in enumerate(results):
        print(f"\n--- Result {i+1} ---")
        print(f"  type:   {type(r).__name__}")
        print(f"  source: {getattr(r, 'source', 'N/A')}")
        for attr in ("text", "answer", "content", "node_id", "relationship_name",
                     "description", "name", "triplet", "context"):
            val = getattr(r, attr, None)
            if val is not None:
                print(f"  {attr}: {str(val)[:400]}")
        print(f"  raw: {r}")
    print("\n=== END RECALL OUTPUT ===")

    print("\n✓ Phase 0 complete.")


asyncio.run(run())
