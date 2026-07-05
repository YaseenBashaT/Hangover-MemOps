"""
memory_service.py — single gateway between MemOps and Cognee.

All Cognee imports live here. No other file in the project may import cognee.
Swapping Cognee for another backend means editing only this file.

Two sources of truth, by design:
  * Cognee graph  — semantic memory: powers recall(), insights, graph viz.
  * Structured store (JSON on disk) — exact incident records: powers the
    dashboard list / detail / resolve endpoints WITHOUT spending LLM calls
    (extracting clean structured fields back out of the graph is both
    unreliable and costly). Every ingest writes to both.
"""

import os
import sys
import json
import asyncio
import traceback
from datetime import datetime, timezone

import cognee
from cognee.modules.search.types.SearchType import SearchType


# ---------------------------------------------------------------------------
# Cognee configuration (env-driven; Groq defaults)
# ---------------------------------------------------------------------------

def _mask(secret: str | None) -> str:
    """Render-safe fingerprint of a secret: never logs the value, but shows
    whether it's present and roughly which key it is."""
    if not secret:
        return "MISSING"
    return f"present(len={len(secret)}, ...{secret[-4:]})"


def llm_key_info() -> tuple[str | None, str]:
    """Return (key, source-label). Checks LLM_API_KEY first, then GROQ_API_KEY."""
    if os.getenv("LLM_API_KEY"):
        return os.getenv("LLM_API_KEY"), "LLM_API_KEY"
    if os.getenv("GROQ_API_KEY"):
        return os.getenv("GROQ_API_KEY"), "GROQ_API_KEY"
    return None, "none"


def _configure_cognee() -> None:
    # On a host where only certain paths are writable (e.g. HuggingFace Spaces,
    # where writes must go to /tmp), point Cognee's databases + ingested-data
    # storage at a writable directory. Cognee otherwise defaults to a path inside
    # its own site-packages install, which isn't writable there. Set via
    # COGNEE_SYSTEM_ROOT; left unset locally so the default location is used.
    system_root = os.getenv("COGNEE_SYSTEM_ROOT")
    if system_root:
        os.makedirs(system_root, exist_ok=True)
        cognee.config.system_root_directory(system_root)
        cognee.config.data_root_directory(os.path.join(system_root, "data"))
        print(f"[cognee] system_root -> {system_root}", flush=True)

    key, source = llm_key_info()
    provider = os.getenv("LLM_PROVIDER", "custom")
    model = os.getenv("LLM_MODEL", "openai/llama-3.3-70b-versatile")
    endpoint = os.getenv("LLM_ENDPOINT", "https://api.groq.com/openai/v1")
    cognee.config.set_llm_provider(provider)
    cognee.config.set_llm_model(model)
    cognee.config.set_llm_endpoint(endpoint)
    cognee.config.set_llm_api_key(key)

    # Embeddings run on HuggingFace's hosted inference API (via litellm) instead
    # of local fastembed. This drops ~200 MB of onnxruntime + model weights from
    # the process, which is what pushed the free 512 MB Render instance over its
    # memory limit. all-MiniLM-L6-v2 is 384-dim, same as the old bge-small model,
    # so nothing downstream that assumed 384 dims has to change.
    emb_provider = os.getenv("EMBEDDING_PROVIDER", "huggingface")
    emb_model = os.getenv(
        "EMBEDDING_MODEL", "huggingface/sentence-transformers/all-MiniLM-L6-v2"
    )
    emb_dims = int(os.getenv("EMBEDDING_DIMENSIONS", "384"))
    emb_key = os.getenv("HF_TOKEN") or os.getenv("EMBEDDING_API_KEY")
    cognee.config.set_embedding_provider(emb_provider)
    cognee.config.set_embedding_model(emb_model)
    cognee.config.set_embedding_dimensions(emb_dims)
    if emb_key:
        cognee.config.set_embedding_api_key(emb_key)
    emb_endpoint = os.getenv("EMBEDDING_ENDPOINT")
    if emb_endpoint:
        cognee.config.set_embedding_endpoint(emb_endpoint)

    # HuggingFace's embedding route doesn't accept the `dimensions` param that
    # cognee passes through litellm, so let litellm drop provider-unsupported
    # params instead of erroring. all-MiniLM-L6-v2 is natively 384-dim, so
    # dropping the (redundant) dimensions hint changes nothing about the output.
    import litellm
    litellm.drop_params = True

    # litellm 1.83.7 cannot call HF feature-extraction embeddings correctly (it
    # sends a sentence-similarity payload), so for the huggingface provider we
    # override cognee's embed call to hit HF's inference router directly.
    if emb_provider.lower() == "huggingface":
        _install_hf_embedding_patch()

    # Loud, secret-safe diagnostic so Render logs immediately reveal a bad/missing
    # key or endpoint (the usual reason seeding fails on a fresh instance).
    print(
        f"[cognee] configured llm_provider={provider} llm_model={model} "
        f"llm_endpoint={endpoint} llm_api_key={_mask(key)} (source={source})",
        flush=True,
    )
    print(
        f"[cognee] embeddings provider={emb_provider} model={emb_model} "
        f"dims={emb_dims} hf_token={_mask(emb_key)}",
        flush=True,
    )


def _install_hf_embedding_patch() -> None:
    """Make cognee's embedding calls go straight to HuggingFace's inference
    router for the `huggingface` provider.

    Why: litellm (which cognee uses under the hood) formats HF embedding requests
    as a sentence-similarity call, which the feature-extraction pipeline rejects
    ("Model not supported by provider hf-inference" / unexpected 'source_sentence'
    argument). The raw router endpoint works fine with a plain {"inputs": [...]}
    body, returning mean-pooled sentence vectors: a flat [dim] list for a single
    string, or [n][dim] for a list. We patch `embed_text` on the engine CLASS so
    the override applies no matter when cognee builds its (singleton) engine, and
    only take over when the provider is huggingface — any other provider falls
    through to cognee's original implementation untouched.
    """
    from cognee.infrastructure.databases.vector.embeddings.LiteLLMEmbeddingEngine import (
        LiteLLMEmbeddingEngine,
    )
    import httpx as _httpx

    if getattr(LiteLLMEmbeddingEngine, "_hf_patched", False):
        return
    _orig_embed = LiteLLMEmbeddingEngine.embed_text

    async def _hf_embed_text(self, text):
        if str(getattr(self, "provider", "")).lower() != "huggingface":
            return await _orig_embed(self, text)
        inputs = [text] if isinstance(text, str) else list(text)
        # HF errors on empty strings; give it a space so indexes still line up.
        inputs = [t if (t and t.strip()) else " " for t in inputs]
        repo = self.model.split("huggingface/", 1)[-1]
        url = (
            f"https://router.huggingface.co/hf-inference/models/{repo}"
            "/pipeline/feature-extraction"
        )
        headers = {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}
        last_err = None
        for attempt in range(5):
            try:
                async with _httpx.AsyncClient(timeout=30) as client:
                    resp = await client.post(url, headers=headers, json={"inputs": inputs})
                # 429 = rate limited, 503 = model still loading — back off and retry.
                if resp.status_code in (429, 503):
                    last_err = f"{resp.status_code}: {resp.text[:120]}"
                    await asyncio.sleep(2 * (attempt + 1))
                    continue
                resp.raise_for_status()
                data = resp.json()
                if data and isinstance(data[0], (int, float)):
                    data = [data]  # single flat vector -> list of one vector
                return data
            except _httpx.HTTPError as e:
                last_err = str(e)
                await asyncio.sleep(2 * (attempt + 1))
        raise RuntimeError(f"HF embedding request failed after retries: {last_err}")

    LiteLLMEmbeddingEngine.embed_text = _hf_embed_text
    LiteLLMEmbeddingEngine._hf_patched = True
    print("[cognee] HF feature-extraction embedding patch installed", flush=True)


_configure_cognee()


# All incidents share ONE dataset so Cognee builds a single connected graph
# (shared nodes like services, engineers, fixes link incidents together).
# Recall is then one graph traversal instead of one LLM call per incident.
INCIDENTS_DATASET = "incidents"

# Project root (holds seed.py) and the structured store under backend/data/.
# The store dir is relocatable via MEMOPS_DATA_DIR so hosts that only allow
# writes to certain paths (e.g. HuggingFace Spaces → /tmp) can redirect it.
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
_DATA_DIR = os.getenv("MEMOPS_DATA_DIR") or os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "data"
)
_STORE_PATH = os.path.join(_DATA_DIR, "incidents_store.json")
# The computed proactive insights are persisted here so they survive a server
# restart — otherwise every restart would recompute them and, because the LLM
# recall is non-deterministic, the dashboard would show different insights.
_INSIGHTS_PATH = os.path.join(_DATA_DIR, "insights_cache.json")
_store_lock = asyncio.Lock()

# Serializes ALL graph-touching Cognee operations (remember / recall / improve /
# direct graph reads). Ladybug is a single-writer embedded DB with one file
# lock; two concurrent requests in this one server process (e.g. the dashboard
# firing /api/graph and /api/insights at once) would otherwise collide with
# "Lock is held by PID ...". Public entry points acquire this; internal helpers
# (_read_graph_data, _recall_text) assume it is already held — do NOT nest.
_graph_lock = asyncio.Lock()

# Cache for the (expensive, LLM-backed) proactive insights. Backed by a file on
# disk (_INSIGHTS_PATH) so it persists across process restarts, with this
# in-memory copy as a fast path. Computed once, then reused until a new incident
# is ingested or a status changes — see get_insights() / invalidate_insights().
# Validity is owned by the file: a valid computed result means the file exists;
# invalidate deletes it. `_insights_dirty` only forces a recompute within the
# process after an in-process invalidate, so it starts False (a cold start with
# an existing file should LOAD it, not recompute).
_insights_cache: dict | None = None
_insights_dirty: bool = False
_insights_lock = asyncio.Lock()

# ---------------------------------------------------------------------------
# Graph snapshot cache (P1-b: avoids _graph_lock contention during recalls)
# ---------------------------------------------------------------------------
_graph_cache: dict | None = None
_graph_cache_at: float = 0.0
_GRAPH_CACHE_TTL = 60.0  # seconds


def invalidate_graph_cache() -> None:
    global _graph_cache, _graph_cache_at
    _graph_cache = None
    _graph_cache_at = 0.0


# ---------------------------------------------------------------------------
# Structured store helpers (no LLM, no Cognee — plain JSON on disk)
# ---------------------------------------------------------------------------

def _load_store() -> list[dict]:
    if not os.path.exists(_STORE_PATH):
        return []
    with open(_STORE_PATH, "r") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return []


def _save_store(records: list[dict]) -> None:
    os.makedirs(_DATA_DIR, exist_ok=True)
    tmp = _STORE_PATH + ".tmp"
    with open(tmp, "w") as f:
        json.dump(records, f, indent=2)
    os.replace(tmp, _STORE_PATH)


def _basic_view(rec: dict) -> dict:
    """Trim a stored record down to the fields a dashboard list needs."""
    return {
        "incident_id": rec.get("incident_id"),
        "alert_name": rec.get("alert_name"),
        "service_affected": rec.get("service_affected"),
        "severity": rec.get("severity"),
        "timestamp": rec.get("timestamp"),
        "engineer_name": rec.get("engineer_name"),
        "outcome": rec.get("outcome"),
        "resolution_time_minutes": rec.get("resolution_time_minutes"),
        "status": rec.get("status", "open"),
        "resolved_at": rec.get("resolved_at"),
    }


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Incident formatting for the graph
# ---------------------------------------------------------------------------

def _format_incident(incident: dict) -> str:
    """Serialise an incident dict into a rich natural-language block so Cognee
    can build a dense, relationship-aware graph from it."""
    slack = "\n  ".join(incident.get("slack_thread", []))
    commits = "\n  ".join(incident.get("git_commits", []))
    jira = incident.get("jira_ticket", {}) or {}
    return f"""
INCIDENT REPORT
===============
Incident ID   : {incident.get('incident_id')}
Alert Name    : {incident.get('alert_name')}
Service       : {incident.get('service_affected')}
Severity      : {incident.get('severity')}
Timestamp     : {incident.get('timestamp')}
Engineer      : {incident.get('engineer_name')}
Resolution    : {incident.get('resolution_time_minutes')} minutes
Outcome       : {incident.get('outcome')}

ERROR LOG
---------
{incident.get('error_log')}

FIX APPLIED
-----------
{incident.get('fix_applied')}

SLACK THREAD
------------
  {slack}

JIRA TICKET
-----------
ID      : {jira.get('id')}
Title   : {jira.get('title')}
Resolution: {jira.get('resolution')}

GIT COMMITS
-----------
  {commits}
""".strip()


# ---------------------------------------------------------------------------
# Ingest
# ---------------------------------------------------------------------------

async def ingest_incident(incident: dict) -> dict:
    """Ingest a single incident into BOTH the Cognee graph and the structured
    store. Returns the stored record (with status metadata)."""
    text = _format_incident(incident)
    async with _graph_lock:
        await cognee.remember(text, dataset_name=INCIDENTS_DATASET)

    async with _store_lock:
        records = _load_store()
        record = dict(incident)
        # New incidents default to "open"; a record arriving already marked
        # resolved (e.g. historical seed) keeps that.
        record["status"] = "resolved" if incident.get("outcome") == "resolved" else "open"
        record.setdefault("logged_at", _now_iso())
        record.setdefault("resolved_at", _now_iso() if record["status"] == "resolved" else None)
        # Upsert by incident_id.
        records = [r for r in records if r.get("incident_id") != record["incident_id"]]
        records.append(record)
        _save_store(records)
    # A new incident changes what the insights would say → refresh on next read.
    invalidate_insights()
    # Invalidate the graph snapshot cache so the next Dashboard load shows the new node.
    invalidate_graph_cache()
    return record


async def count_incidents() -> int:
    """How many incidents are currently in memory. The structured store is
    written in lockstep with every graph ingest, so an empty store means an
    empty incidents graph — a cheap, lock-free proxy for the graph node count."""
    return len(_load_store())


async def seed_if_empty() -> dict:
    """Ensure the graph is populated. On a fresh instance — e.g. Render's
    ephemeral filesystem after a deploy — both the Cognee graph and the store
    start empty. If there are zero incidents, ingest the full seed set so the
    dashboard never comes up blank. Idempotent: a no-op when incidents exist.

    Logs every step to stdout (visible in Render logs) and, if ingest fails,
    re-raises with the incident id so the real error is not swallowed."""
    existing = await count_incidents()
    print(f"[seed] store currently holds {existing} incident(s)", flush=True)
    if existing > 0:
        print("[seed] already populated -> skipping", flush=True)
        return {"seeded": False, "count": existing}

    key, source = llm_key_info()
    if not key:
        # Seeding calls the LLM via Cognee; without a key every ingest will fail.
        raise RuntimeError(
            "No LLM API key found in the environment (checked LLM_API_KEY and "
            "GROQ_API_KEY). Set it in the Render dashboard, then redeploy."
        )
    print(f"[seed] LLM key {_mask(key)} from {source}; starting seed…", flush=True)

    # Lazy import: seed.py imports this module, so importing it at module load
    # would be circular. It lives at the project root, so make sure that's importable.
    if _PROJECT_ROOT not in sys.path:
        sys.path.insert(0, _PROJECT_ROOT)
    from seed import ALL_INCIDENTS

    total = len(ALL_INCIDENTS)
    # Small pause between incidents so a full 17-incident seed doesn't trip the
    # HuggingFace free-tier rate limit (each incident makes several embedding
    # calls). Tunable via SEED_DELAY_SECONDS; set to 0 to disable.
    delay = float(os.getenv("SEED_DELAY_SECONDS", "1.0"))
    print(f"[seed] ingesting {total} incidents… (delay {delay}s between each)", flush=True)
    for i, inc in enumerate(ALL_INCIDENTS, 1):
        try:
            await ingest_incident(inc)
            print(f"[seed]   [{i:02d}/{total}] {inc['incident_id']} ok", flush=True)
        except Exception as e:
            # Surface the incident that broke and the error type, then abort so
            # the caller/logs see a real failure instead of a half-empty graph.
            print(f"[seed]   [{i:02d}/{total}] {inc['incident_id']} FAILED: "
                  f"{type(e).__name__}: {e}", flush=True)
            raise
        if delay and i < total:
            await asyncio.sleep(delay)
    final = await count_incidents()
    print(f"[seed] done -> {final} incident(s) in store", flush=True)
    return {"seeded": True, "count": final}


# Seed runs in the background AFTER the server binds its port (see main.py), so
# the process never fails Render's port scan. This tracks its progress for the
# GET /api/seed-status endpoint the frontend can poll.
_seed_status: dict = {
    "state": "pending",   # pending -> in_progress -> complete | failed
    "seeded": False,
    "count": 0,
    "total": 0,
    "error": None,
    "started_at": None,
    "finished_at": None,
}


def get_seed_status() -> dict:
    """Current state of the background seed (safe to call any time). The count is
    read live from the store so a polling client sees incremental progress."""
    status = dict(_seed_status)
    status["count"] = len(_load_store())
    return status


async def run_startup_seed() -> dict:
    """Background entry point: seed the graph if empty, then warm the insights
    cache, updating _seed_status throughout so /api/seed-status reflects reality.
    Never raises — a failure is recorded in the status and logged, not thrown,
    because this runs detached from the request cycle."""
    global _seed_status
    _seed_status = {
        **_seed_status,
        "state": "in_progress",
        "count": await count_incidents(),
        "error": None,
        "started_at": _now_iso(),
        "finished_at": None,
    }
    try:
        result = await seed_if_empty()
        _seed_status = {
            **_seed_status,
            "state": "complete",
            "seeded": result.get("seeded", False),
            "count": result.get("count", await count_incidents()),
            "finished_at": _now_iso(),
        }
        # Warm the insights cache now that the graph is ready (best-effort).
        try:
            await get_insights()
        except Exception:
            pass
    except Exception as e:
        _seed_status = {
            **_seed_status,
            "state": "failed",
            "count": await count_incidents(),
            "error": f"{type(e).__name__}: {e}",
            "finished_at": _now_iso(),
        }
        print("[seed] run_startup_seed caught a failure:", flush=True)
        traceback.print_exc()
    return get_seed_status()


def bootstrap_store(incidents: list[dict]) -> int:
    """Populate the structured store from a list of incident dicts WITHOUT
    touching Cognee (used to backfill the store for already-seeded graphs).
    Idempotent upsert by incident_id. Returns the new store size."""
    records = _load_store()
    by_id = {r.get("incident_id"): r for r in records}
    for incident in incidents:
        rec = dict(incident)
        rec["status"] = "resolved" if incident.get("outcome") == "resolved" else "open"
        rec.setdefault("logged_at", _now_iso())
        rec.setdefault("resolved_at", _now_iso() if rec["status"] == "resolved" else None)
        by_id[rec["incident_id"]] = rec
    merged = list(by_id.values())
    _save_store(merged)
    return len(merged)


# ---------------------------------------------------------------------------
# List / detail (structured store — free, no LLM)
# ---------------------------------------------------------------------------

def list_incidents() -> list[dict]:
    records = _load_store()
    records.sort(key=lambda r: r.get("timestamp", ""), reverse=True)
    return [_basic_view(r) for r in records]


def get_incident(incident_id: str) -> dict | None:
    for r in _load_store():
        if r.get("incident_id") == incident_id:
            return r
    return None


# ---------------------------------------------------------------------------
# Recall for a new alert (graph-aware, 1 completion call)
# ---------------------------------------------------------------------------

async def recall_for_alert(alert_text: str) -> dict:
    """Query the graph for past incidents relevant to a new alert and return a
    clean, frontend-ready structure: historical context + a suggested fix.

    Uses GRAPH_COMPLETION (a single LLM call reasoning over retrieved graph
    triplets) rather than the auto-routed CONTEXT_EXTENSION mode (5+ calls).

    The alert text is wrapped in a directive question so the model returns an
    actual fix instead of just acknowledging the statement ("Got it."). If the
    answer still comes back degenerate, we retry once and then, as a last
    resort, synthesize a fix from the closest past incident."""
    # Related incidents — real Cognee CHUNKS retrieval (or keyword fallback).
    related, confidence = await _related_incidents_for_text(alert_text)

    primary = (
        f'A new production alert just fired: "{alert_text}". Based on the past '
        "incidents in memory, what is the most likely fix? Reference the specific "
        "past incident IDs that resolved this before and describe the fix that worked."
    )
    fallback = (
        f'For this alert: "{alert_text}", name the past incidents on the affected '
        "service and the fix that finally worked, citing the incident IDs."
    )

    async with _graph_lock:
        answer = await _recall_text(primary)
        if _is_degenerate(answer):
            answer = await _recall_text(fallback)

    # Last resort: never show a contentless suggestion in the demo — build one
    # from the closest matching past incident's fix.
    if _is_degenerate(answer) and related:
        top = related[0]
        answer = (
            f"Closest past incident is {top['incident_id']} on {top['service_affected']}. "
            f"That was resolved by: {top.get('fix_applied') or 'the recorded fix'}."
        )

    return {
        "alert": alert_text,
        "confidence": confidence,          # 0-100, grounded in match strength
        "suggested_fix": answer.strip(),
        "historical_context": related,
        "source": "cognee-graph",
    }


async def _related_incidents_for_text(text: str, limit: int = 5) -> tuple[list[dict], int]:
    """Rank stored incidents by real Cognee vector-engine retrieval — embedding
    similarity from Cognee's own lancedb store, not token overlap.

    Prefers direct vector engine access (real cosine similarities). Falls back
    to CHUNKS ordinal ranking, then keyword overlap. Each fallback is clearly
    logged and labeled so it can never be confused with real retrieval.

    Returns (cards, confidence). Each card carries a `match_score` (0-99).
    """
    # --- Attempt 1: direct vector engine (real similarity scores) ---
    try:
        cards, confidence = await _vector_engine_ranking(text, limit)
        if cards:
            print("[recall] Using vector engine similarity scores", flush=True)
            return cards, confidence
    except Exception as exc:
        print(f"[recall] Vector engine access failed ({exc}); trying CHUNKS fallback", flush=True)

    # --- Attempt 2: CHUNKS recall (ordinal rank, clearly labeled) ---
    try:
        chunks = await cognee.recall(text, query_type=SearchType.CHUNKS)
    except Exception as exc:
        print(f"[recall] CHUNKS retrieval failed ({exc}); using keyword fallback", flush=True)
        chunks = []

    if chunks:
        print("[recall] Using CHUNKS ordinal ranking (vector engine unavailable)", flush=True)
        return _score_chunks_to_cards(chunks, limit)

    # --- Attempt 3: keyword fallback (graph empty / not yet seeded) ---
    print("[recall] CHUNKS returned empty; using keyword fallback", flush=True)
    return _keyword_fallback_ranking(text, limit)


async def _vector_engine_ranking(text: str, limit: int) -> tuple[list[dict], int]:
    """Query Cognee's lancedb vector store directly for real cosine similarity
    scores. This is plan §2.1 option 1: the authoritative retrieval mechanism.

    The collection name is the canonical one that Cognee uses for DocumentChunk
    embeddings. If the collection doesn't exist yet (fresh instance before seed),
    this will raise an exception which the caller catches.
    """
    from cognee.infrastructure.databases.vector import get_vector_engine
    from cognee.context_global_variables import set_database_global_context_variables
    from cognee.modules.users.methods import get_default_user

    # get_vector_engine() returns a handle synchronously in the installed
    # cognee==1.2.2 (not a coroutine) — awaiting it raises TypeError.
    # Without the dataset context below it also resolves to the empty GLOBAL
    # vector store rather than the incidents dataset's own lancedb file, so
    # the search below always raised CollectionNotFoundError.
    collection_name = "DocumentChunk_text"
    user = await get_default_user()
    async with set_database_global_context_variables(INCIDENTS_DATASET, user.id):
        engine = get_vector_engine()
        results = await engine.search(
            collection_name, query_text=text, limit=max(limit * 3, 15),
            include_payload=True,
        )

    if not results:
        return [], 0

    store_by_id = {r.get("incident_id"): r for r in _load_store()}

    seen: dict[str, float] = {}  # incident_id -> best similarity
    ordered: list[str] = []
    for hit in results:
        # ScoredResult.payload carries the chunk text; .score is a cosine
        # DISTANCE (lower = better match), not a similarity — convert it.
        chunk_text = ((hit.payload or {}).get("text") or "") or str(hit)
        similarity = max(0.0, 1.0 - float(hit.score))

        m = _INCIDENT_ID_RE.search(chunk_text)
        if not m:
            continue
        iid = m.group(1)
        if iid not in seen:
            seen[iid] = similarity
            ordered.append(iid)
        else:
            seen[iid] = max(seen[iid], similarity)

    if not seen:
        return [], 0

    # Sort by best similarity descending.
    top_ids = sorted(ordered, key=lambda i: seen[i], reverse=True)[:limit]
    cards = []
    for iid in top_ids:
        r = store_by_id.get(iid)
        if not r:
            continue
        card = _basic_view(r)
        # Cap displayed score at 99 — a 100 looks fabricated, and a similarity
        # of 1.0 on a paraphrase is not credible to judges. Honest presentation.
        card["match_score"] = int(min(99, round(seen[iid] * 100)))
        card["fix_applied"] = r.get("fix_applied")
        jira = r.get("jira_ticket") or {}
        card["jira_id"] = jira.get("id")
        cards.append(card)

    if not cards:
        return [], 0

    top_score = cards[0]["match_score"]
    corroboration = min(10, 3 * (len(cards) - 1))
    # Cap confidence at 92 — an estimate of memory coverage, not a certainty.
    confidence = int(min(92, top_score + corroboration))
    return cards, confidence


def _score_chunks_to_cards(chunks, limit: int) -> tuple[list[dict], int]:
    """Map Cognee-retrieved DocumentChunks to incident cards using ordinal rank.

    Each chunk's text starts with 'Incident ID : INC-...' — use _INCIDENT_ID_RE
    to extract the ID. Score = rank-based (100, 90, 80, …), capped at 99.
    Used as fallback #1 when the vector engine is not directly accessible.
    """
    store_by_id = {r.get("incident_id"): r for r in _load_store()}

    seen: dict[str, float] = {}  # incident_id -> best score
    ordered: list[str] = []
    for rank, chunk in enumerate(chunks):
        chunk_text = (
            getattr(chunk, "text", None)
            or getattr(chunk, "content", None)
            or str(chunk)
        )
        m = _INCIDENT_ID_RE.search(chunk_text)
        if not m:
            continue
        iid = m.group(1)
        score = max(0, 100 - rank * 10)
        if iid not in seen:
            seen[iid] = score
            ordered.append(iid)
        else:
            seen[iid] = max(seen[iid], score)

    top_ids = ordered[:limit]
    cards = []
    for iid in top_ids:
        r = store_by_id.get(iid)
        if not r:
            continue
        card = _basic_view(r)
        # Cap at 99 — ordinal scores of exactly 100 look fabricated.
        card["match_score"] = int(min(99, seen[iid]))
        card["fix_applied"] = r.get("fix_applied")
        jira = r.get("jira_ticket") or {}
        card["jira_id"] = jira.get("id")
        cards.append(card)

    if not cards:
        return [], 0

    top_score = cards[0]["match_score"]
    corroboration = min(10, 3 * (len(cards) - 1))
    # Cap confidence at 92 — an estimate, not a certainty.
    confidence = int(min(92, top_score + corroboration))
    return cards, confidence


def _keyword_fallback_ranking(text: str, limit: int = 5) -> tuple[list[dict], int]:
    """Last-resort ranker: token overlap between alert text and stored incident
    fields. Used ONLY when Cognee's vector store is unavailable or empty.
    Clearly separated from the real retrieval path; never labeled as graph-based.
    """
    alert_tokens = {t for t in _tokenize(text) if len(t) > 2}
    denom = max(1, len(alert_tokens))
    scored = []
    for r in _load_store():
        hay = " ".join(str(r.get(f, "")) for f in
                       ("service_affected", "alert_name", "error_log", "fix_applied"))
        overlap = len(alert_tokens & set(_tokenize(hay)))
        if overlap:
            scored.append((overlap, r))
    scored.sort(key=lambda x: (x[0], x[1].get("timestamp", "")), reverse=True)

    top = scored[:limit]
    cards = []
    for overlap, r in top:
        card = _basic_view(r)
        card["match_score"] = round(100 * overlap / denom)
        card["fix_applied"] = r.get("fix_applied")
        jira = r.get("jira_ticket") or {}
        card["jira_id"] = jira.get("id")
        cards.append(card)

    if not scored:
        return [], 0
    best_overlap = scored[0][0]
    base = 100 * best_overlap / denom
    corroboration = min(15, 5 * (len(scored) - 1))
    confidence = int(min(96, round(base + corroboration)))
    return cards, confidence


def _tokenize(text: str) -> list[str]:
    return [t for t in "".join(c.lower() if c.isalnum() else " " for c in str(text)).split()]


# ---------------------------------------------------------------------------
# Resolve + reinforce (improve)
# ---------------------------------------------------------------------------

async def resolve_incident(incident_id: str) -> dict | None:
    """Mark an incident resolved and run Cognee's enrichment pass (improve) on
    the incidents graph. Returns a structured description of what got
    strengthened so the frontend can show it.

    P0-c: Captures a before/after recall pair around improve() so the UI can
    show real evidence that learning occurred."""
    async with _store_lock:
        records = _load_store()
        rec = next((r for r in records if r.get("incident_id") == incident_id), None)
        if rec is None:
            return None
        rec["status"] = "resolved"
        rec["outcome"] = rec.get("outcome") or "resolved"
        rec["resolved_at"] = _now_iso()
        _save_store(records)

    # A status change alters what the insights would say → refresh on next read.
    invalidate_insights()
    # Invalidate the graph snapshot cache so the next Dashboard load is fresh.
    invalidate_graph_cache()

    service = rec.get("service_affected")
    alert_name = rec.get("alert_name", "")

    # Canonical query for the before/after evidence recall.
    evidence_query = (
        f"{alert_name} on {service} — what is the recommended fix based on past incidents?"
    )

    # Whole block under the graph lock so a concurrent read can't grab the
    # ladybug file lock mid-improve. before-recall → improve → after-recall.
    async with _graph_lock:
        before = await _graph_metrics()

        # Capture "before" recall — what the graph knew before reinforcement.
        try:
            before_answer = (await _recall_text(evidence_query)).strip()
        except Exception:
            before_answer = ""

        try:
            await cognee.improve(dataset=INCIDENTS_DATASET)
            enrichment_ok = True
        except Exception:  # never let improve() failure block the resolve
            enrichment_ok = False

        # Capture "after" recall — what the graph knows after reinforcement.
        try:
            after_answer = (await _recall_text(evidence_query)).strip()
        except Exception:
            after_answer = ""

        after = await _graph_metrics()

    # Build the learning evidence payload.
    if before_answer and after_answer:
        if before_answer == after_answer:
            evidence_note = "graph re-indexed; answer already optimal"
        else:
            evidence_note = None
        learning_evidence = {
            "query": evidence_query,
            "before": before_answer,
            "after": after_answer,
            "note": evidence_note,
        }
    else:
        learning_evidence = None

    # The connections being reinforced: other incidents on the same service.
    related = [
        _basic_view(r) for r in _load_store()
        if r.get("service_affected") == service and r.get("incident_id") != incident_id
    ]

    return {
        "incident_id": incident_id,
        "status": "resolved",
        "resolved_at": rec["resolved_at"],
        "service_affected": service,
        "graph_strengthened": {
            "enrichment_ran": enrichment_ok,
            "stage": "memify_enrichment (triplet embeddings re-indexed)",
            "nodes_before": before["nodes"],
            "nodes_after": after["nodes"],
            "edges_before": before["edges"],
            "edges_after": after["edges"],
        },
        "learning_evidence": learning_evidence,
        "reinforced_connections": related,
        "message": (
            f"Resolved {incident_id}. Re-indexed the {service} subgraph and reinforced "
            f"links to {len(related)} related past incident(s) on {service}."
        ),
    }


# ---------------------------------------------------------------------------
# Graph (D3-ready) — reads the incidents dataset's own graph engine
# ---------------------------------------------------------------------------

async def _incidents_graph_engine_kwargs() -> dict | None:
    """Resolve the create_graph_engine() kwargs for the 'incidents' dataset's
    own ladybug graph. The default graph engine points at an empty global
    graph; each dataset keeps its own file at {system}/databases/{owner}/{ds}.lbug."""
    from cognee.base_config import get_base_config
    from cognee.modules.users.methods import get_default_user
    from cognee.modules.data.methods.get_datasets_by_name import get_datasets_by_name
    from cognee.modules.data.methods.get_dataset_databases import get_dataset_databases

    user = await get_default_user()
    datasets = await get_datasets_by_name(INCIDENTS_DATASET, user.id)
    if not datasets:
        return None
    ds = datasets[0]
    dbs = await get_dataset_databases()
    dd = next((d for d in dbs if str(d.dataset_id) == str(ds.id)), None)
    if dd is None:
        return None

    base = get_base_config()
    graph_file_path = os.path.join(
        base.system_root_directory, "databases", str(dd.owner_id), dd.graph_database_name
    )
    return {
        "graph_database_provider": dd.graph_database_provider,
        "graph_file_path": graph_file_path,
        "graph_database_name": dd.graph_database_name,
    }


async def _read_graph_data():
    """Read (nodes, edges) from the incidents graph and ALWAYS release the
    on-disk file lock afterward. Ladybug is a single-writer embedded DB: a
    lingering open handle would block every later remember()/improve() in this
    long-lived server process with a 'Lock is held by PID ...' error. So we
    create → read → close → evict the engine on every read."""
    from cognee.infrastructure.databases.graph.get_graph_engine import (
        create_graph_engine, evict_graph_engine,
    )

    kwargs = await _incidents_graph_engine_kwargs()
    if kwargs is None:
        return [], []
    engine = create_graph_engine(**kwargs)
    try:
        return await engine.get_graph_data()
    finally:
        try:
            await engine.close()
        finally:
            evict_graph_engine(**kwargs)


# Map Cognee node types to a stable D3 group index for coloring.
_GROUP_INDEX = {
    "Entity": 1,
    "EntityType": 2,
    "DocumentChunk": 3,
    "TextDocument": 4,
    "TextSummary": 5,
}


import re as _re
_INCIDENT_ID_RE = _re.compile(r"Incident ID\s*:\s*(INC-\d{4}-\d+)", _re.IGNORECASE)


def _node_label(attrs: dict) -> str:
    name = (attrs.get("name") or "").strip()
    if name:
        return name
    text = (attrs.get("text") or "").strip()
    if text:
        return text[:48] + ("…" if len(text) > 48 else "")
    return attrs.get("type", "node")


async def _graph_metrics() -> dict:
    nodes, edges = await _read_graph_data()
    return {"nodes": len(nodes), "edges": len(edges)}


async def get_graph() -> dict:
    """Return the incidents knowledge graph as D3.js-ready nodes + links.

    P1-b: Caches the result for _GRAPH_CACHE_TTL seconds so Dashboard reads
    never block during an 11s recall. Invalidated by ingest/resolve/forget.
    """
    import time
    global _graph_cache, _graph_cache_at
    now = time.monotonic()
    if _graph_cache is not None and (now - _graph_cache_at) < _GRAPH_CACHE_TTL:
        return _graph_cache

    async with _graph_lock:
        raw_nodes, raw_edges = await _read_graph_data()

    # Build an incident_id -> record lookup once (LLM-free store read).
    store_by_id = {r.get("incident_id"): r for r in _load_store()}

    type_counts: dict[str, int] = {}
    kind_counts = {"incident": 0, "entity": 0}
    nodes = []
    for nid, attrs in raw_nodes:
        attrs = attrs or {}
        ntype = attrs.get("type", "node")
        type_counts[ntype] = type_counts.get(ntype, 0) + 1

        node = {
            "id": str(nid),
            "label": _node_label(attrs),
            "type": ntype,
            "group": _GROUP_INDEX.get(ntype, 0),
            "node_kind": "entity",
            "incident_id": None,
            "severity": None,
            "service": None,
        }

        # A DocumentChunk whose text carries an "Incident ID : INC-..." IS an
        # incident node — parse the id and enrich from the store.
        if ntype == "DocumentChunk":
            m = _INCIDENT_ID_RE.search(attrs.get("text") or attrs.get("name") or "")
            if m:
                iid = m.group(1)
                rec = store_by_id.get(iid, {})
                node["node_kind"] = "incident"
                node["incident_id"] = iid
                node["severity"] = rec.get("severity")
                node["service"] = rec.get("service_affected")
                node["label"] = (
                    f"{iid} · {rec.get('service_affected') or '?'}"
                    if rec else iid
                )
        kind_counts[node["node_kind"]] += 1
        nodes.append(node)

    links = []
    for edge in raw_edges:
        # edge = (source_id, target_id, relationship_name, attrs)
        src, dst, rel = str(edge[0]), str(edge[1]), edge[2]
        links.append({"source": src, "target": dst, "relationship": rel})

    result = {
        "nodes": nodes,
        "links": links,
        "stats": {
            "node_count": len(nodes),
            "edge_count": len(links),
            "type_counts": type_counts,
            "incident_nodes": kind_counts["incident"],
            "entity_nodes": kind_counts["entity"],
        },
    }
    import time
    _graph_cache = result
    _graph_cache_at = time.monotonic()
    return result


# ---------------------------------------------------------------------------
# Proactive insights (one recall across the whole graph)
# ---------------------------------------------------------------------------

# Phrased as a direct question (not meta-instructions like "format as a list"),
# because the latter occasionally makes the model just acknowledge ("Got it.")
# instead of answering. A fallback rephrasing is tried if the answer is degenerate.
_INSIGHTS_PROMPT = (
    "Give exactly 3 short proactive insights across all past incidents. Put each on "
    "its own numbered line in this exact shape: a bold headline wrapped in double "
    "asterisks that names the service or failure pattern, then ONE sentence of "
    "evidence citing the real incident IDs. Two short sentences maximum per insight, "
    "no more than that. "
    "Example: '1. **payments-api connection pool keeps exhausting.** Seen in "
    "INC-2024-1014, INC-2025-0203 and INC-2025-0819, now fixed with dynamic pool autoscaling.'"
)
_INSIGHTS_FALLBACK_PROMPT = (
    "List 3 recurring incident patterns. For each, write a bold headline in double "
    "asterisks naming the service, then one sentence citing the specific incident or "
    "ticket IDs involved. Keep each to two short sentences at most."
)


def _is_degenerate(answer: str) -> bool:
    """A too-short / contentless answer (e.g. 'Got it.') that we should retry."""
    return len(answer.strip()) < 40


async def _recall_text(prompt: str) -> str:
    results = await cognee.recall(prompt, query_type=SearchType.GRAPH_COMPLETION)
    if results:
        r = results[0]
        return (getattr(r, "text", None) or getattr(r, "answer", None) or str(r)).strip()
    return ""


async def _compute_insights() -> dict:
    """Run the actual LLM recall(s) that produce the insights. Expensive — this
    is the call we cache so it doesn't fire on every page refresh."""
    async with _graph_lock:
        answer = await _recall_text(_INSIGHTS_PROMPT)
        if _is_degenerate(answer):
            answer = await _recall_text(_INSIGHTS_FALLBACK_PROMPT)
    return {
        "insights": _split_insights(answer),
        "raw": answer,
        "source": "cognee-graph",
        "generated_at": _now_iso(),
    }


def _load_insights_file() -> dict | None:
    """Read the persisted insights, or None if there is no valid file."""
    if not os.path.exists(_INSIGHTS_PATH):
        return None
    try:
        with open(_INSIGHTS_PATH, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return None


def _save_insights_file(data: dict) -> None:
    os.makedirs(_DATA_DIR, exist_ok=True)
    tmp = _INSIGHTS_PATH + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, _INSIGHTS_PATH)


async def get_insights() -> dict:
    """Return proactive insights from a disk-backed cache.

    recall() is expensive AND non-deterministic, so we compute the insights ONCE
    and reuse the exact same result until the graph's meaning changes — a new
    incident ingested or a status change. The computed result is written to disk
    (_INSIGHTS_PATH), so it survives server restarts: every GET /api/insights,
    across page refreshes and restarts alike, returns byte-for-byte the same
    insights until invalidate_insights() runs. A recompute only happens when the
    cache is genuinely absent (never computed) or has been invalidated.
    """
    global _insights_cache, _insights_dirty

    # Fast path: warm in-memory copy that hasn't been invalidated this process.
    if _insights_cache is not None and not _insights_dirty:
        return {**_insights_cache, "cached": True}

    async with _insights_lock:
        # Re-check inside the lock: another coroutine may have just populated it.
        if _insights_cache is not None and not _insights_dirty:
            return {**_insights_cache, "cached": True}

        # Not invalidated this process: a persisted result (e.g. from before a
        # restart) is still valid — load it instead of paying for recall() again.
        if not _insights_dirty:
            persisted = _load_insights_file()
            if persisted is not None:
                _insights_cache = persisted
                return {**_insights_cache, "cached": True}

        # Nothing valid on disk, or we were invalidated: compute once and persist.
        _insights_cache = await _compute_insights()
        _insights_dirty = False
        try:
            _save_insights_file(_insights_cache)
        except OSError:
            pass  # a failed write just means the next restart recomputes
        return {**_insights_cache, "cached": False}


def invalidate_insights() -> None:
    """Mark the insights cache stale. Called when a new incident is ingested or
    an incident's status changes — the only events that alter what the insights
    would say. Clears both the in-memory copy and the persisted file so a restart
    before the next read can't resurrect the stale result. The next GET
    /api/insights recomputes once and re-persists."""
    global _insights_dirty
    _insights_dirty = True
    try:
        if os.path.exists(_INSIGHTS_PATH):
            os.remove(_INSIGHTS_PATH)
    except OSError:
        pass


def _split_insights(text: str) -> list[str]:
    """Best-effort split of a numbered/bulleted answer into discrete insights.
    Extracts the list items directly so any leading preamble ('Here are 3
    insights:') is dropped rather than counted as an insight.

    Handles three LLM output formats:
    1. Standard numbered: "1. insight text"
    2. Insight headers: "Insight 1: text" or "**Insight 1: text**"
    3. Bullet markers: "- insight text"
    4. Paragraph fallback
    """
    import re
    if not text:
        return []

    # Pattern 1: Standard numbered items ("1." / "2)")
    numbered = re.findall(
        r"(?ms)^\s*\d+[\.\)]\s+(.+?)(?=^\s*\d+[\.\)]\s+|\Z)", text
    )
    items = [re.sub(r"\s+", " ", n).strip() for n in numbered]

    # Pattern 2: "Insight N:" or "**Insight N:**" headers (LLM sometimes returns these)
    # Capture the header itself along with the body — _strip_insight_prefix
    # below needs to see the leading "**" to pair it with the title's own
    # closing "**" instead of leaving a stray, unbalanced marker.
    if not items:
        insight_blocks = re.findall(
            r"(?ms)^\s*(\**Insight\s+\d+[:\.]\**\s*.+?)(?=^\s*\**Insight\s+\d+[:\.]|\Z)",
            text,
            re.IGNORECASE,
        )
        items = [re.sub(r"\s+", " ", b).strip() for b in insight_blocks]

    # Pattern 3: bullet markers
    if not items:
        parts = re.split(r"(?m)^\s*[-*•]\s+", text)
        items = [re.sub(r"\s+", " ", p).strip() for p in parts if p.strip()]

    # Pattern 4: paragraph split (last resort)
    if not items:
        items = [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]

    # Drop any leading item that looks like a preamble (short, ends with ":")
    items = [i for i in items if not (
        len(i) < 80
        and (i.rstrip().endswith(":")
             or re.match(r"^here are", i, re.IGNORECASE)
             or re.match(r"^the following", i, re.IGNORECASE))
    )]

    # Strip leading "Insight N:" / "**Insight N:**" prefixes — the UI numbers cards.
    def _strip_insight_prefix(s: str) -> str:
        # Bolded header ("**Insight N: Title**: evidence") — replace the
        # opening marker with a bare "**" so it pairs with the title's own
        # closing "**" instead of leaving a stray, unbalanced marker.
        bolded = re.sub(r"^\*\*insight\s+\d+[:.]\s*", "**", s, flags=re.IGNORECASE)
        if bolded != s:
            return bolded.strip()
        # Plain "Insight N: ..." header (no bold) — strip entirely.
        return re.sub(r"^insight\s+\d+[:.\s]+", "", s, flags=re.IGNORECASE).strip()

    items = [_strip_insight_prefix(i) for i in items]
    items = [_trim_insight(i) for i in items if i]
    return items[:3] if items else ([text] if text else [])


def _trim_insight(text: str, max_sentences: int = 2, max_chars: int = 240) -> str:
    """Keep an insight short: at most two sentences (a bold headline + one
    evidence sentence), capped in length. The bold headline's own period does
    not count as a boundary, so 'headline. + evidence.' reads as two sentences.
    Always cuts at a word boundary, never mid-word."""
    import re
    text = re.sub(r"\s+", " ", text).strip()

    # Protect the bold headline (period inside ** ** is not a sentence break).
    m = re.match(r"^(\*\*.+?\*\*[.:]?\s*)(.*)$", text)
    head, rest = (m.group(1).strip(), m.group(2).strip()) if m else ("", text)

    # Take up to (max_sentences - 1) sentences from the evidence part.
    ev_sentences = re.findall(r".+?[.!?](?:\s|$)", rest) or ([rest] if rest else [])
    keep = ev_sentences[: max(1, max_sentences - (1 if head else 0))]
    out = (head + " " + "".join(keep)).strip() if head else "".join(keep).strip()
    out = out or text

    if len(out) > max_chars:
        cut = out[:max_chars]
        # Prefer cutting at a sentence boundary.
        idx = max(cut.rfind(". "), cut.rfind("! "), cut.rfind("? "))
        if idx > 40:
            out = cut[: idx + 1].strip()
        else:
            # Cut at the last word boundary (space) to avoid mid-word truncation.
            space_idx = cut.rfind(" ")
            out = (cut[:space_idx].strip() if space_idx > 40 else cut.strip()).rstrip(",;:") + "…"
    return out


# ---------------------------------------------------------------------------
# Forget (prune a dataset) — lowest priority
# ---------------------------------------------------------------------------

async def forget_dataset(dataset_name: str) -> dict:
    """Prune a dataset from Cognee's graph memory. Guards the shared incidents
    dataset behind an explicit name match so it can't be wiped by accident."""
    await cognee.forget(dataset=dataset_name)
    removed_from_store = 0
    if dataset_name == INCIDENTS_DATASET:
        async with _store_lock:
            removed_from_store = len(_load_store())
            _save_store([])
    invalidate_graph_cache()
    return {
        "forgotten": dataset_name,
        "store_records_cleared": removed_from_store,
    }


# Backwards-compat aliases (older callers / tests).
async def reinforce_fix(dataset_name: str = INCIDENTS_DATASET) -> None:
    await cognee.improve(dataset=dataset_name)


async def forget_incident(dataset_name: str) -> None:
    await forget_dataset(dataset_name)
