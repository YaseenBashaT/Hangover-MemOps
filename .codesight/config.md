# Config

## Environment Variables

- `ALLOWED_ORIGINS` **required** — backend/main.py
- `COGNEE_SYSTEM_ROOT` **required** — backend/services/memory_service.py
- `EMBEDDING_API_KEY` **required** — backend/services/memory_service.py
- `EMBEDDING_DIMENSIONS` (has default) — backend/.env
- `EMBEDDING_ENDPOINT` **required** — backend/services/memory_service.py
- `EMBEDDING_MODEL` (has default) — backend/.env
- `EMBEDDING_PROVIDER` (has default) — backend/.env
- `GROQ_API_KEY` **required** — backend/services/memory_service.py
- `HF_TOKEN` (has default) — backend/.env
- `LLM_API_KEY` (has default) — backend/.env
- `LLM_ENDPOINT` (has default) — backend/.env
- `LLM_MODEL` (has default) — backend/.env
- `LLM_PROVIDER` (has default) — backend/.env
- `MEMOPS_DATA_DIR` **required** — backend/services/memory_service.py
- `SEED_DELAY_SECONDS` **required** — backend/services/memory_service.py
- `SHOT_DIR` **required** — frontend/demo_e2e.mjs
- `VITE_API_BASE` **required** — frontend/src/api.js

## Config Files

- `Dockerfile`
- `frontend/tailwind.config.js`
- `frontend/vite.config.js`
- `render.yaml`
