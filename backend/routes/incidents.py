"""Incident endpoints — log, list, detail, resolve. Routes never import cognee;
they call through memory_service only."""

from fastapi import APIRouter, HTTPException

from backend.models.schemas import Incident
from backend.services import memory_service

router = APIRouter()


@router.post("/api/incidents")
async def log_incident(incident: Incident):
    """Log a new incident into the consolidated graph (and structured store)."""
    record = await memory_service.ingest_incident(incident.model_dump())
    return {"status": "logged", "incident": record}


@router.get("/api/incidents")
async def list_incidents():
    """List all incidents with basic info for the dashboard."""
    items = memory_service.list_incidents()
    return {"count": len(items), "incidents": items}


@router.get("/api/incidents/{incident_id}")
async def get_incident(incident_id: str):
    """Full detail for one incident."""
    rec = memory_service.get_incident(incident_id)
    if rec is None:
        raise HTTPException(status_code=404, detail=f"incident {incident_id} not found")
    return rec


@router.patch("/api/incidents/{incident_id}/resolve")
async def resolve_incident(incident_id: str):
    """Mark an incident resolved and reinforce the graph (improve())."""
    result = await memory_service.resolve_incident(incident_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"incident {incident_id} not found")
    return result
