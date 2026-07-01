# MemOps Build Checklist

## Phase 0 — Cognee Verified ✅
- [x] Cognee v1.2.2 installed
- [x] Real API confirmed: remember(), recall(), improve(), forget()
- [x] Groq LLM configured (custom provider, llama-3.3-70b-versatile)
- [x] fastembed configured for local embeddings (BAAI/bge-small-en-v1.5)
- [x] Live ingest → recall cycle verified (graph-aware, GRAPH_COMPLETION_CONTEXT_EXTENSION)

## Phase 1 — Memory Service Layer + FastAPI Skeleton ✅
- [x] Project folder structure created (backend/, services/, routes/, models/)
- [x] memory_service.py: single Cognee gateway with 4 clean async functions
  - [x] ingest_incident(incident: dict) -> None
  - [x] recall_for_alert(alert_text: str) -> dict
  - [x] reinforce_fix(dataset_name: str) -> None
  - [x] forget_incident(dataset_name: str) -> None
- [x] No other file imports cognee directly
- [x] schemas.py: Pydantic models for Incident, JiraTicket, RecallRequest, HealthResponse
- [x] main.py: FastAPI with CORS (localhost:5173), lifespan init, health route
- [x] GET /api/health returns {"status": "ok"}
- [x] test_phase1.py: ingests 2 incidents, recalls, shows graph-aware output
- [x] test_phase1.py verified: both incidents ingested, graph-aware recall confirmed
- [x] Committed: "feat: Phase 1 -- memory service layer and FastAPI skeleton"

## Phase 2 — Seed Incidents + Verified Cross-Incident Recall ✅
- [x] 17 incidents authored in seed.py (3 clusters + standalones)
  - payments-api escalation arc (connection pool 10→50 → PgBouncer → dynamic autoscaling)
  - recommendation-service root-cause arc (memory leak REC-512 → REC-688)
  - api-gateway arc (manual cert renewal → cert-manager automated renewal)
  - same-service distractor (INC-2025-0118 payments-api, different problem) to test precision
- [x] Consolidated dataset architecture: all incidents ingested into ONE shared
      `incidents` dataset (constant INCIDENTS_DATASET in memory_service.py) so Cognee
      builds a single connected graph. Shared nodes (services, engineers, fixes) link
      incidents, making recall one graph traversal instead of one LLM call per dataset.
- [x] Eliminated per-incident-dataset fan-out: recall dropped from ~17 LLM calls
      (one per old dataset) to a flat **2 calls/recall** that does NOT scale with
      incident count.
- [x] recall_for_alert uses SearchType.GRAPH_COMPLETION (1 completion call) instead of
      the auto-routed GRAPH_COMPLETION_CONTEXT_EXTENSION (5+ calls) — cheaper + avoids
      rate limits.
- [x] 3 verification recalls run with litellm cost tracking (test_phase2.py):
  - Recall 1 "payments-api connection issues"        → 2 calls, $0.0031
  - Recall 2 "recommendation-service high memory usage" → 2 calls, $0.0039
  - Recall 3 "api-gateway certificate problem"       → 2 calls, $0.0037
  - Seed (17 incidents → graph): 35 calls, $0.0328
  - **TOTAL this run: $0.0435** (well under the $2 hard cap)
- [x] Graph-aware cross-incident reasoning confirmed: Recall 3 reconstructed the full
      manual→automated cert arc across INC-2024-0301, INC-2024-0905, INC-2025-0301.
- [x] Committed: "feat: Phase 2 -- seed 17 incidents into consolidated graph, verified cross-incident recall with cost tracking"

## Phase 3 — Full FastAPI Backend (8 endpoints) ✅
Architecture rule held: routes import only `memory_service`; cognee stays behind
that one gateway. Two sources of truth — Cognee graph (semantic recall / insights
/ graph viz) + a structured JSON store (exact records for list/detail/resolve,
keeps those endpoints LLM-free). Every endpoint built AND tested with a real
response before moving on.

- [x] POST /api/incidents — logs incident into consolidated graph (remember) + store; optional fields default
- [x] GET /api/incidents — dashboard list (basic fields, newest-first) — no LLM
- [x] GET /api/incidents/{id} — full detail incl. slack/jira/commits; 404 on miss — no LLM
- [x] POST /api/alerts — recall() → suggested_fix + ranked historical_context cards (graph-aware)
- [x] PATCH /api/incidents/{id}/resolve — marks resolved + runs improve(); returns graph delta + reinforced same-service connections
- [x] GET /api/graph — D3-ready {nodes:[{id,label,type,group}], links:[{source,target,relationship}], stats} from the live Cognee graph (166 nodes / 387 edges)
- [x] GET /api/insights — 2-3 proactive insights from a recall across the whole graph (numbered-list parsing + degenerate-answer retry)
- [x] POST /api/forget — prunes a named dataset; guards the shared `incidents` dataset

**Key fix — ladybug single-writer lock:** each dataset has its own `.lbug` graph
file; the default engine reads an empty global graph. memory_service resolves the
`incidents` dataset's own engine, and ALWAYS closes+evicts it after each read
(`_read_graph_data`) — otherwise a lingering open handle blocks every later
remember()/improve() in the server process with "Lock is held by PID …".

- [x] test_endpoints.py — exercises the real ASGI app in-process via httpx (sandbox reaps detached uvicorn)
- [x] bootstrap_store.py — repopulates the gitignored runtime store from seed (no LLM)
- [x] backend/data/ gitignored (runtime state, regenerable)
- [x] Phase 3 LLM spend ≈ <$0.02 (cumulative well under the $2 cap)

## Phase 4 — React Frontend (Vite + Tailwind + D3) ✅
Three screens, React Router, all data from the live FastAPI backend
(http://localhost:8000). No mock data. Dark "Recall" theme.

- [x] frontend/ scaffolded with Vite + React 19; Tailwind v3; react-router-dom v7; d3 v7
- [x] src/api.js — single backend client (VITE_API_BASE, default :8000); shared severity palette
- [x] Top bar — Recall logo + Dashboard / New Alert links (React Router)
- [x] Screen 1 Dashboard (/):
  - left: fleet stats (total / open / resolved / critical) from GET /api/incidents + recent list
  - center: **D3 force graph from GET /api/graph** — incident nodes colored by severity
    (red/orange/yellow/green), entity nodes gray, edges, hover tooltip, click → detail, zoom/pan, legend
  - right: 3 proactive insights from GET /api/insights (bold markdown rendered)
- [x] Screen 2 New Alert (/alert): textarea → POST /api/alerts; two columns (raw | analysis);
  match-confidence gauge, ranked historical incident cards (% match + severity), suggested fix, Approve/Reject
- [x] Screen 3 Incident Detail (/incidents/:id): full incident (service/severity/date/engineer/
  resolution/error log/slack/jira/commits/fix/outcome); status panel; **Approve Fix → PATCH resolve →
  improve() → animated green "Memory reinforced" (memify) card** showing graph delta + reinforced connections

**Backend touch-ups for the frontend (still behind memory_service):**
- [x] GET /api/graph enriched: incident nodes carry node_kind/incident_id/severity/service (parsed from
  chunk text, joined to store) so the graph can color by severity and route clicks
- [x] POST /api/alerts returns a real `confidence` (0-100) + per-card `match_score` from overlap strength
- [x] **Concurrency fix:** added an async `_graph_lock` serializing all graph-touching Cognee ops
  (remember/recall/improve/graph read). The dashboard fires /api/graph + /api/insights together; without
  the lock they collided on the single-writer ladybug file ("Lock is held by PID …" → 500). Dashboard also
  chains insights after the graph so the graph stays instant.

**Verified by headless render (Playwright/Chromium):** dashboard graph draws 166 circles / 18
severity-colored incident nodes with real IDs; detail + memify + alert-analysis flows all render;
0 console errors; 0 backend 500s. Screens screenshotted and visually reviewed.

- Node LTS installed to ~/.local (no root); frontend deps via npm. `npm run dev` (5173) + backend (8000).
- Phase 4 LLM spend negligible (~a few recalls for insights/alerts during render tests).

## Phase 4.1 — Insights caching (cost control) ✅
recall() is the expensive part; it must not fire on every page refresh.
- [x] Backend: in-memory insights cache (`_insights_cache` + dirty flag + `_insights_lock`).
  `get_insights()` returns the cache; recomputes only when cold/dirty. Warmed once at startup
  (background task in lifespan). Response carries `cached` + `generated_at`.
- [x] Invalidate ONLY on the events that change what insights say: `ingest_incident` (new incident)
  and `resolve_incident` (status change) call `invalidate_insights()`. Next GET recomputes once.
- [x] Frontend: `loadInsightsOnce()` memoizes the fetch at module level; Dashboard calls it once on
  mount and shares the result across remounts / in-app navigation — no refetch on every render.
- [x] Verified: 3 repeat GETs → all `cached:true`, same timestamp (no recall); after a resolve →
  one `cached:false` recompute (new timestamp), then cached again. Frontend issued exactly 1
  /api/insights request across 3 Dashboard↔Alert round-trips.

## Phase 5 — Full demo loop, end to end ✅
The complete 90-second demo path works cleanly.

- [x] Clean data reset to exactly **17 incidents** (removed the stray INC-2025-0930 from testing); `reseed17.py` wipes graph+store and re-ingests the 17 seed incidents.
- [x] **New Alert fully working:** textarea → POST /api/alerts. Right column shows a circular
  **match-confidence ring** (ScoreRing), ranked historical cards with **dates + Jira IDs + the fix
  that worked**, and a suggested-fix card. Approve Fix / Reject.
- [x] Backend: /api/alerts cards enriched with `fix_applied` + `jira_id`; real `confidence` + `match_score`.
- [x] **Approve Fix** resolves the most relevant historical incident (top card) → PATCH
  /api/incidents/{id}/resolve (loading spinner while in flight). **Reject** resets the form.
- [x] **The memify moment (signature):** on resolve, a green "Memory reinforced" panel slides in
  (nodes/edges, reinforced connections), then auto-navigates to the dashboard where the reinforced
  nodes render **brighter/larger with pulsing green halos and thick green edges** — you watch the
  memory get stronger. Reinforced ids passed via router state; GraphView `highlightIds`.
- [x] **Incident Detail fully working:** all fields (service/severity/date/engineer/resolution/error
  log/slack/jira/commits/fix/outcome/status); right panel **Related Incidents** (same-service
  connections, clickable); status **dropdown** with all options (selecting Resolved triggers resolve).
- [x] **Autonomous feel:** "Graph last analyzed <time>" with a live green pulse under the insights
  panel (uses insights `generated_at`).
- [x] **End-to-end demo path VERIFIED (headless Playwright, `demo_e2e.mjs`):** dashboard shows 17
  incident nodes → insight readable + last-analyzed cue → New Alert with the exact demo text →
  Analyze → all three payments-api incidents (INC-2024-1014 / INC-2025-0203 / INC-2025-0819) with the
  evolved fix (pool 10→50 → PgBouncer → dynamic autoscaling) → Approve Fix → green memify panel →
  dashboard graph highlights 4 reinforced nodes (green halos/edges) → click a payments-api node →
  full incident detail. **0 console errors, 0 backend 500s.**

## Phase 6 — Final polish before submission ✅
The last pass before the hackathon submission: tighten the insight copy, polish every
screen, and write a README a human would actually write.

- [x] **Insights trimmed to 2 short sentences.** `_INSIGHTS_PROMPT` /
  `_INSIGHTS_FALLBACK_PROMPT` now demand a bold headline naming the service/pattern plus
  ONE evidence sentence that cites the real incident IDs, two sentences max. Added a
  `_trim_insight()` safety net (protects the bold-headline period, keeps ≤2 sentences,
  caps length at a sentence boundary) applied in `_split_insights`. No more paragraph-long
  insights.
- [x] **Fixed the "Got it." degenerate alert answer.** `recall_for_alert()` now asks a
  directive question ("what is the most likely fix? Reference the specific past incident
  IDs…"), retries with a second phrasing if the first answer is degenerate, and if both
  fail synthesizes an answer from the top related incident's recorded fix. Verified 3×
  (435 / 387 / 242-char answers, no "Got it.").
- [x] **UI polish at 1920x1080** across Dashboard, New Alert (before + after analysis),
  and Incident Detail — spacing, graph legend clarity, memify green-panel visibility.
  Captured with `frontend/polish_shots.mjs` (Playwright, 1920x1080) and reviewed.
- [x] **README.md rewritten** in a strict human style (banned-word/no-em-dash/no-rule-of-
  three/vary-sentence-length rules). Sections: The problem (3am, the engineer who left) ·
  What MemOps does · **How Cognee powers the memory** (all four operations detailed —
  remember/recall/improve/forget — the judging criterion) · The demo (numbered) · Tech
  stack · Setup (exact commands) · AI declaration (Claude Code used throughout).
- [x] **Self-review pass:** mechanical grep (no banned words, em dashes, emoji, or banned
  sentence starts) + manual "what makes this obviously AI generated?" read — rewrote a
  triad and an AI-transition phrase that failed it.
- [x] `requirements.txt` added (cognee==1.2.2, fastapi, uvicorn, python-dotenv, httpx) so
  the Setup steps actually run from a clean clone.
- [x] Cumulative LLM spend still well under the $2 cap (no new seeding; a handful of
  verification recalls).
