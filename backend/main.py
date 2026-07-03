import os
import asyncio
from contextlib import asynccontextmanager
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

import cognee
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routes.health import router as health_router
from backend.routes.seed import router as seed_router
from backend.routes.incidents import router as incidents_router
from backend.routes.alerts import router as alerts_router
from backend.routes.graph import router as graph_router
from backend.routes.insights import router as insights_router
from backend.routes.forget import router as forget_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # memory_service configures Cognee on import
    import backend.services.memory_service as memory_service  # triggers _configure_cognee()

    # IMPORTANT: uvicorn runs lifespan startup BEFORE it binds the listening
    # socket, so anything we `await` here delays the port bind. A full seed takes
    # tens of seconds (17 LLM calls), which blew past Render's port scan window
    # and failed the deploy with "No open ports detected". So we do NOT seed here.
    # We only schedule the seed as a detached background task; scheduling returns
    # immediately, lifespan startup completes, the port binds, and the server
    # starts serving right away. The seed then runs concurrently and reports its
    # progress via GET /api/seed-status. On a warm instance seed_if_empty is a
    # no-op, so this costs nothing.
    print("[startup] scheduling background seed (server binds first)…", flush=True)
    app.state.seed_task = asyncio.create_task(memory_service.run_startup_seed())
    yield
    # Shutdown: make sure the background task is cleaned up.
    task = getattr(app.state, "seed_task", None)
    if task and not task.done():
        task.cancel()


app = FastAPI(title="MemOps API", lifespan=lifespan)

# Allowed browser origins for the frontend. Locally this is the Vite dev server;
# in production set ALLOWED_ORIGINS to the deployed frontend URL(s), comma-separated
# (e.g. "https://memops.vercel.app,http://localhost:5173"). If unset we fall back to
# allowing any origin (credentials off) so a fresh deploy works before it's configured.
_origins_env = os.getenv("ALLOWED_ORIGINS", "").strip()
if _origins_env:
    _allowed_origins = [o.strip() for o in _origins_env.split(",") if o.strip()]
    _allow_credentials = True
else:
    _allowed_origins = ["*"]
    _allow_credentials = False

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(seed_router)
app.include_router(incidents_router)
app.include_router(alerts_router)
app.include_router(graph_router)
app.include_router(insights_router)
app.include_router(forget_router)
