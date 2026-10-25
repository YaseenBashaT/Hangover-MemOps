"""
Build prebuilt/memops_snapshot.tar.gz: the fully seeded Cognee graph plus the
structured store and insights cache, which the backend unpacks on a fresh
instance (memory_service._restore_prebuilt_snapshot) instead of reseeding
every incident through the LLM.

Cognee's database records absolute file paths, so build with the SAME paths
the server uses. For the HuggingFace Space (see Dockerfile):

    COGNEE_SYSTEM_ROOT=/tmp/.cognee_system MEMOPS_DATA_DIR=/tmp/memops_data \
    COGNEE_LOGS_DIR=/tmp/.cognee/logs BUILD_REASONING_EFFORT=low \
    venv/bin/python build_snapshot.py

plus the same LLM_* / EMBEDDING_* / HF_TOKEN settings as the server. Both
directories must start empty. Rebuild after changing seed.py or the
embedding model.
"""
import asyncio
import json
import os
import sys
import tarfile
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dotenv import load_dotenv
load_dotenv(".env")

SYSTEM_ROOT = os.environ["COGNEE_SYSTEM_ROOT"]
DATA_DIR = os.environ["MEMOPS_DATA_DIR"]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "prebuilt", "memops_snapshot.tar.gz")

for d in (SYSTEM_ROOT, DATA_DIR):
    if os.path.exists(d) and os.listdir(d):
        sys.exit(f"{d} is not empty; build from a clean state")
# The build is the seed itself, so it must not restore an older snapshot first.
os.environ.pop("PREBUILT_SNAPSHOT", None)

from backend.services import memory_service

# Optional, for reasoning models such as gpt-oss: at the default effort
# gpt-oss-20b can think past its output limit on graph extraction and return
# nothing. BUILD_REASONING_EFFORT=low keeps it short. Only the build uses it.
_effort = os.getenv("BUILD_REASONING_EFFORT")
if _effort:
    import litellm

    _acompletion = litellm.acompletion

    async def _acompletion_with_effort(*args, **kwargs):
        kwargs.setdefault("extra_body", {})["reasoning_effort"] = _effort
        return await _acompletion(*args, **kwargs)

    litellm.acompletion = _acompletion_with_effort


async def main() -> int:
    result = await memory_service.seed_if_empty()
    await memory_service.get_insights()
    return result["count"]


count = asyncio.run(main())

manifest = {
    "cognee_system_root": SYSTEM_ROOT,
    "memops_data_dir": DATA_DIR,
    "incidents": count,
    "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    "embedding_model": os.getenv("EMBEDDING_MODEL"),
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
manifest_path = os.path.join(DATA_DIR, "..", "memops_snapshot_manifest.json")
with open(manifest_path, "w") as f:
    json.dump(manifest, f, indent=2)
with tarfile.open(OUT, "w:gz") as tar:
    tar.add(manifest_path, arcname="manifest.json")
    tar.add(SYSTEM_ROOT, arcname="cognee_system")
    tar.add(DATA_DIR, arcname="memops_data")
os.remove(manifest_path)
print(f"{count} incidents -> {OUT} ({os.path.getsize(OUT) / 1e6:.1f} MB)")
