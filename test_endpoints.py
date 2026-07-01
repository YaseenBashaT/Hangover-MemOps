"""
Phase 3 endpoint tests — exercises the real FastAPI app in-process via httpx's
ASGITransport (genuine HTTP request/response through routes -> memory_service ->
Cognee). Used because detached uvicorn servers get reaped in this sandbox; the
app stack exercised here is byte-for-byte the same one uvicorn would serve.

Run from MemOps/: venv/bin/python test_endpoints.py [endpoint]
where [endpoint] in: graph insights forget resolve  (default: all)
"""
import asyncio, json, os, sys

sys.path.insert(0, os.getcwd())
from dotenv import load_dotenv
load_dotenv(".env")

import httpx
from httpx import ASGITransport
import cognee  # test harness only — used to stage a throwaway dataset for forget
from backend.main import app


def show(title, resp):
    print("\n" + "=" * 70)
    print(title, "->", resp.status_code)
    print("=" * 70)
    try:
        print(json.dumps(resp.json(), indent=2)[:4000])
    except Exception:
        print(resp.text[:2000])


async def main(which):
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test", timeout=300) as client:
        if which in ("all", "graph"):
            r = await client.get("/api/graph")
            data = r.json()
            print("\n" + "=" * 70)
            print("GET /api/graph ->", r.status_code)
            print("=" * 70)
            print("stats:", json.dumps(data.get("stats"), indent=2))
            print("sample nodes:", json.dumps(data.get("nodes", [])[:5], indent=2))
            print("sample links:", json.dumps(data.get("links", [])[:5], indent=2))

        if which in ("all", "resolve"):
            r = await client.patch("/api/incidents/INC-2025-0930/resolve")
            show("PATCH /api/incidents/INC-2025-0930/resolve", r)

        if which in ("all", "insights"):
            r = await client.get("/api/insights")
            show("GET /api/insights", r)

        if which in ("all", "forget"):
            # Stage a throwaway dataset so we never touch 'incidents'.
            await cognee.remember("Throwaway doc for forget test.", dataset_name="temp_forget_test")
            r = await client.post("/api/forget", json={"dataset_name": "temp_forget_test"})
            show("POST /api/forget (dataset=temp_forget_test)", r)


if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    asyncio.run(main(which))
