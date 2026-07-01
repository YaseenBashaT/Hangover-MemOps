import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

import cognee
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routes.health import router as health_router
from backend.routes.incidents import router as incidents_router
from backend.routes.alerts import router as alerts_router
from backend.routes.graph import router as graph_router
from backend.routes.insights import router as insights_router
from backend.routes.forget import router as forget_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # memory_service configures Cognee on import; nothing else needed at startup
    import backend.services.memory_service  # noqa: F401 — triggers _configure_cognee()
    yield


app = FastAPI(title="MemOps API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(incidents_router)
app.include_router(alerts_router)
app.include_router(graph_router)
app.include_router(insights_router)
app.include_router(forget_router)
