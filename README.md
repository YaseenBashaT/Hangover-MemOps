# MemOps

Ops-memory system that uses Cognee's knowledge graph to surface past incident context when a new alert fires.

## Stack
- **Graph memory**: Cognee v1.2.2
- **LLM**: Groq (llama-3.3-70b-versatile) via OpenAI-compatible endpoint
- **Embeddings**: fastembed (BAAI/bge-small-en-v1.5, local — no extra API key)
- **Backend**: FastAPI
- **Frontend**: (Phase 3)

## Setup

```bash
cd MemOps
python -m venv venv
source venv/bin/activate
pip install cognee fastapi uvicorn python-dotenv fastembed
```

Copy `.env` and fill in your Groq API key (`LLM_API_KEY`).

## Run API

```bash
uvicorn backend.main:app --reload
```

Health check: `GET http://localhost:8000/api/health`

## Architecture rule

**Only `backend/services/memory_service.py` imports cognee.**  
Switching backends = editing one file.

## Phases

| Phase | Status | Description |
|-------|--------|-------------|
| 0 | ✅ Done | Cognee verified, Groq + fastembed configured |
| 1 | ✅ Done | Memory service layer + FastAPI skeleton |
| 2 | Pending | — |
