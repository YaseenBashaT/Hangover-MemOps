# MemOps — AI Context Map

> **Stack:** fastapi | none | react | python

> 10 routes | 0 models | 8 components | 11 lib files | 17 env vars | 0 middleware | 30% test coverage
> **Token savings:** this file is ~1,500 tokens. Without it, AI exploration would cost ~19,100 tokens. **Saves ~17,600 tokens per conversation.**
> **Last scanned:** 2026-07-05 14:26 — re-run after significant changes

---

# Routes

## CRUD Resources

- **`/api/incidents`** GET | POST | GET/:id → Incident

## Other Routes

- `POST` `/api/alerts` params() → in: AlertRequest
- `POST` `/api/forget` params() → in: ForgetRequest ✓
- `GET` `/api/graph` params() ✓
- `GET` `/api/health` params() → out: HealthResponse
- `PATCH` `/api/incidents/{incident_id}/resolve` params(incident_id)
- `GET` `/api/insights` params() ✓
- `GET` `/api/seed-status` params()

---

# Components

- **App** — `frontend/src/App.jsx`
- **GraphView** — props: data, onIncidentClick, highlightIds — `frontend/src/components/GraphView.jsx`
- **MemifyCard** — props: result, onOpenRelated — `frontend/src/components/MemifyCard.jsx`
- **ScoreRing** — props: value, size, stroke, label — `frontend/src/components/ScoreRing.jsx`
- **BoldText** — props: text — `frontend/src/components/ui.jsx`
- **Dashboard** — `frontend/src/pages/Dashboard.jsx`
- **IncidentDetail** — `frontend/src/pages/IncidentDetail.jsx`
- **NewAlert** — `frontend/src/pages/NewAlert.jsx`

---

# Libraries

- `backend/main.py` — function lifespan: (app)
- `backend/models/schemas.py`
  - class JiraTicket
  - class Incident
  - class RecallRequest
  - class AlertRequest
  - class ForgetRequest
  - class HealthResponse
- `backend/services/memory_service.py`
  - function llm_key_info: () -> tuple[str | None, str]
  - function get_seed_status: () -> dict
  - function bootstrap_store: (incidents) -> int
  - function list_incidents: () -> list[dict]
  - function get_incident: (incident_id) -> dict | None
  - function invalidate_insights: () -> None
  - _...11 more_
- `explore_cognee.py` — function run: ()
- `frontend/src/api.js`
  - function loadInsightsOnce: () => void
  - function sevColor: (sev) => void
  - const api
  - const SEV_COLORS
- `reseed17.py` — function run: ()
- `seed.py` — function run: ()
- `test_endpoints.py` — function show: (title, resp), function main: (which)
- `test_phase1.py` — function run: ()
- `test_phase2.py` — function run: (), class CallTracker
- `verify_recalls.py` — function run: ()

---

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

---

# Dependency Graph

## Most Imported Files (change these carefully)

- `frontend/src/api.js` — imported by **6** files
- `frontend/src/components/ui.jsx` — imported by **3** files
- `frontend/src/components/MemifyCard.jsx` — imported by **2** files
- `frontend/src/pages/Dashboard.jsx` — imported by **1** files
- `frontend/src/pages/NewAlert.jsx` — imported by **1** files
- `frontend/src/pages/IncidentDetail.jsx` — imported by **1** files
- `frontend/src/App.jsx` — imported by **1** files
- `frontend/src/components/GraphView.jsx` — imported by **1** files
- `frontend/src/components/ScoreRing.jsx` — imported by **1** files

## Import Map (who imports what)

- `frontend/src/api.js` ← `frontend/src/components/GraphView.jsx`, `frontend/src/components/MemifyCard.jsx`, `frontend/src/components/ui.jsx`, `frontend/src/pages/Dashboard.jsx`, `frontend/src/pages/IncidentDetail.jsx` +1 more
- `frontend/src/components/ui.jsx` ← `frontend/src/pages/Dashboard.jsx`, `frontend/src/pages/IncidentDetail.jsx`, `frontend/src/pages/NewAlert.jsx`
- `frontend/src/components/MemifyCard.jsx` ← `frontend/src/pages/IncidentDetail.jsx`, `frontend/src/pages/NewAlert.jsx`
- `frontend/src/pages/Dashboard.jsx` ← `frontend/src/App.jsx`
- `frontend/src/pages/NewAlert.jsx` ← `frontend/src/App.jsx`
- `frontend/src/pages/IncidentDetail.jsx` ← `frontend/src/App.jsx`
- `frontend/src/App.jsx` ← `frontend/src/main.jsx`
- `frontend/src/components/GraphView.jsx` ← `frontend/src/pages/Dashboard.jsx`
- `frontend/src/components/ScoreRing.jsx` ← `frontend/src/pages/NewAlert.jsx`

---

# Test Coverage

> **30%** of routes and models are covered by tests
> 3 test files found

## Covered Routes

- POST:/api/forget
- GET:/api/graph
- GET:/api/insights

---

_Generated by [codesight](https://github.com/Houseofmvps/codesight) — see your codebase clearly_