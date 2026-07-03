"""Seed status endpoint — lets the frontend poll whether the background graph
seed (kicked off at startup) is still running, done, or failed."""

from fastapi import APIRouter

from backend.services import memory_service

router = APIRouter()


@router.get("/api/seed-status")
async def seed_status():
    """Report the background seed's progress.

    state is one of: pending, in_progress, complete, failed. `count` is the live
    number of incidents in the store, so a client can show "seeding 7/17" while
    it runs and switch to the real UI once state == complete.
    """
    return memory_service.get_seed_status()
