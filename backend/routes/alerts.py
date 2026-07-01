"""Alert endpoint — recall historical context + suggested fix for a new alert."""

from fastapi import APIRouter

from backend.models.schemas import AlertRequest
from backend.services import memory_service

router = APIRouter()


@router.post("/api/alerts")
async def handle_alert(req: AlertRequest):
    """Take a new alert description, recall against the full graph, and return
    historical context + a suggested fix in a frontend-ready structure."""
    return await memory_service.recall_for_alert(req.alert_text)
