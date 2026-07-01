"""Graph endpoint — D3.js-ready nodes + links from the Cognee graph."""

from fastapi import APIRouter

from backend.services import memory_service

router = APIRouter()


@router.get("/api/graph")
async def get_graph():
    """Return the incidents knowledge graph formatted for D3.js."""
    return await memory_service.get_graph()
