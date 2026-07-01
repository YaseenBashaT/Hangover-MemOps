"""Insights endpoint — proactive insights from a recall across the whole graph."""

from fastapi import APIRouter

from backend.services import memory_service

router = APIRouter()


@router.get("/api/insights")
async def get_insights():
    """Return 2-3 proactive insights generated across the full incident graph."""
    return await memory_service.get_insights()
