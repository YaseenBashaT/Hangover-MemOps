"""
Populate the structured incident store (backend/data/incidents_store.json) from
the seed incidents WITHOUT touching Cognee — pure disk write, no LLM calls.

Use this on a fresh clone (the store is gitignored runtime state) so the
dashboard list/detail endpoints have data. The Cognee graph itself is seeded
separately via seed.py.

Run from MemOps/: venv/bin/python bootstrap_store.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dotenv import load_dotenv
load_dotenv(".env")

from seed import ALL_INCIDENTS
from backend.services import memory_service

if __name__ == "__main__":
    n = memory_service.bootstrap_store(ALL_INCIDENTS)
    print(f"Structured store populated: {n} incidents -> {memory_service._STORE_PATH}")
