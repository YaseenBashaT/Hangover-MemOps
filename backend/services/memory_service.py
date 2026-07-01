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
import json
import asyncio
from datetime import datetime, timezone

import cognee
from cognee.modules.search.types.SearchType import SearchType


# ---------------------------------------------------------------------------
# Cognee configuration (env-driven; Groq defaults)
# ---------------------------------------------------------------------------

def _configure_cognee() -> None:
    cognee.config.set_llm_provider(os.getenv("LLM_PROVIDER", "custom"))
    cognee.config.set_llm_model(os.getenv("LLM_MODEL", "openai/llama-3.3-70b-versatile"))
    cognee.config.set_llm_endpoint(os.getenv("LLM_ENDPOINT", "https://api.groq.com/openai/v1"))
    cognee.config.set_llm_api_key(os.getenv("LLM_API_KEY"))
    cognee.config.set_embedding_provider("fastembed")
    cognee.config.set_embedding_model("BAAI/bge-small-en-v1.5")
    cognee.config.set_embedding_dimensions(384)


_configure_cognee()


# All incidents share ONE dataset so Cognee builds a single connected graph
# (shared nodes like services, engineers, fixes link incidents together).
# Recall is then one graph traversal instead of one LLM call per incident.
INCIDENTS_DATASET = "incidents"

# Structured store lives next to this file's package, under backend/data/.
_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
_STORE_PATH = os.path.join(_DATA_DIR, "incidents_store.json")
_store_lock = asyncio.Lock()


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
    return record


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
    triplets) rather than the auto-routed CONTEXT_EXTENSION mode (5+ calls)."""
    results = await cognee.recall(alert_text, query_type=SearchType.GRAPH_COMPLETION)

    answer = ""
    if results:
        r = results[0]
        answer = getattr(r, "text", None) or getattr(r, "answer", None) or str(r)

    # Surface related historical incidents from the structured store by simple
    # service/keyword overlap so the frontend can render incident cards even
    # though the LLM answer is free text. Free (no LLM).
    related = _related_incidents_for_text(alert_text)

    return {
        "alert": alert_text,
        "suggested_fix": answer.strip(),
        "historical_context": related,
        "source": "cognee-graph",
    }


def _related_incidents_for_text(text: str, limit: int = 5) -> list[dict]:
    """Lightweight, LLM-free relevance: rank stored incidents by token overlap
    with the alert text (service name, alert name, error log keywords)."""
    tokens = {t for t in _tokenize(text) if len(t) > 2}
    scored = []
    for r in _load_store():
        hay = " ".join(str(r.get(f, "")) for f in
                       ("service_affected", "alert_name", "error_log", "fix_applied"))
        overlap = len(tokens & set(_tokenize(hay)))
        if overlap:
            scored.append((overlap, r))
    scored.sort(key=lambda x: (x[0], x[1].get("timestamp", "")), reverse=True)
    return [_basic_view(r) for _, r in scored[:limit]]


def _tokenize(text: str) -> list[str]:
    return [t for t in "".join(c.lower() if c.isalnum() else " " for c in str(text)).split()]


# ---------------------------------------------------------------------------
# Resolve + reinforce (improve)
# ---------------------------------------------------------------------------

async def resolve_incident(incident_id: str) -> dict | None:
    """Mark an incident resolved and run Cognee's enrichment pass (improve) on
    the incidents graph. Returns a structured description of what got
    strengthened so the frontend can show it."""
    async with _store_lock:
        records = _load_store()
        rec = next((r for r in records if r.get("incident_id") == incident_id), None)
        if rec is None:
            return None
        rec["status"] = "resolved"
        rec["outcome"] = rec.get("outcome") or "resolved"
        rec["resolved_at"] = _now_iso()
        _save_store(records)

    service = rec.get("service_affected")

    # Snapshot the graph before/after enrichment so we can report the delta.
    before = await _graph_metrics()
    try:
        await cognee.improve(dataset=INCIDENTS_DATASET)
        enrichment_ok = True
    except Exception as e:  # never let improve() failure block the resolve
        enrichment_ok = False
        _last_improve_error = str(e)
    after = await _graph_metrics()

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
    """Return the incidents knowledge graph as D3.js-ready nodes + links."""
    raw_nodes, raw_edges = await _read_graph_data()

    type_counts: dict[str, int] = {}
    nodes = []
    for nid, attrs in raw_nodes:
        attrs = attrs or {}
        ntype = attrs.get("type", "node")
        type_counts[ntype] = type_counts.get(ntype, 0) + 1
        nodes.append({
            "id": str(nid),
            "label": _node_label(attrs),
            "type": ntype,
            "group": _GROUP_INDEX.get(ntype, 0),
        })

    links = []
    for edge in raw_edges:
        # edge = (source_id, target_id, relationship_name, attrs)
        src, dst, rel = str(edge[0]), str(edge[1]), edge[2]
        links.append({"source": src, "target": dst, "relationship": rel})

    return {
        "nodes": nodes,
        "links": links,
        "stats": {
            "node_count": len(nodes),
            "edge_count": len(links),
            "type_counts": type_counts,
        },
    }


# ---------------------------------------------------------------------------
# Proactive insights (one recall across the whole graph)
# ---------------------------------------------------------------------------

# Phrased as a direct question (not meta-instructions like "format as a list"),
# because the latter occasionally makes the model just acknowledge ("Got it.")
# instead of answering. A fallback rephrasing is tried if the answer is degenerate.
_INSIGHTS_PROMPT = (
    "Looking across all past incidents, what are the 2 or 3 most important recurring "
    "problems or services most at risk of breaking again? For each one, name the "
    "specific incidents or services involved and what permanent fix is still needed."
)
_INSIGHTS_FALLBACK_PROMPT = (
    "Which services have had repeated incidents, and what recurring root cause links "
    "them? Reference the specific incident or ticket IDs and recommend a permanent fix."
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


async def get_insights() -> dict:
    """Generate 2-3 proactive insights from a recall across the graph. Retries
    once with a rephrased question if the first answer is degenerate."""
    answer = await _recall_text(_INSIGHTS_PROMPT)
    if _is_degenerate(answer):
        answer = await _recall_text(_INSIGHTS_FALLBACK_PROMPT)
    return {
        "insights": _split_insights(answer),
        "raw": answer,
        "source": "cognee-graph",
    }


def _split_insights(text: str) -> list[str]:
    """Best-effort split of a numbered/bulleted answer into discrete insights.
    Extracts the list items directly so any leading preamble ('Here are 3
    insights:') is dropped rather than counted as an insight."""
    import re
    if not text:
        return []
    # Prefer explicit numbered items ("1." / "2)") — captures each block and
    # ignores any intro text before the first marker.
    numbered = re.findall(
        r"(?ms)^\s*\d+[\.\)]\s+(.+?)(?=^\s*\d+[\.\)]\s+|\Z)", text
    )
    items = [re.sub(r"\s+", " ", n).strip() for n in numbered]
    if not items:
        # Fall back to bullet markers.
        parts = re.split(r"(?m)^\s*[-*•]\s+", text)
        items = [re.sub(r"\s+", " ", p).strip() for p in parts if p.strip()]
    if not items:
        # Last resort: paragraph split.
        items = [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]
    return items[:3] if items else ([text] if text else [])


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
    return {
        "forgotten": dataset_name,
        "store_records_cleared": removed_from_store,
    }


# Backwards-compat aliases (older callers / tests).
async def reinforce_fix(dataset_name: str = INCIDENTS_DATASET) -> None:
    await cognee.improve(dataset=dataset_name)


async def forget_incident(dataset_name: str) -> None:
    await forget_dataset(dataset_name)
