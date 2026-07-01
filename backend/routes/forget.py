"""Forget endpoint — prune a dataset from graph memory. Lowest priority."""

from fastapi import APIRouter

from backend.models.schemas import ForgetRequest
from backend.services import memory_service

router = APIRouter()


@router.post("/api/forget")
async def forget(req: ForgetRequest):
    """Prune a named dataset from Cognee's graph memory."""
    return await memory_service.forget_dataset(req.dataset_name)
