# MemOps backend for HuggingFace Spaces (Docker SDK).
# HF serves the container on port 7860 and only guarantees writes to /tmp, so
# HOME, all caches, the structured store, and Cognee's databases are pointed there.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# Build tools for any dependency without a prebuilt wheel (cognee's tree).
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first (into system site-packages, so they survive the ephemeral
# /tmp) for better layer caching.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code.
COPY . .

# --- Runtime environment ---------------------------------------------------
# HuggingFace Spaces only allows writes to /tmp. Send HOME, library caches, the
# structured store (MEMOPS_DATA_DIR), Cognee's logs (COGNEE_LOGS_DIR) and Cognee's
# databases (COGNEE_SYSTEM_ROOT, read in memory_service) all under /tmp.
ENV HOME=/tmp \
    XDG_CACHE_HOME=/tmp/.cache \
    HF_HOME=/tmp/.cache/huggingface \
    COGNEE_SYSTEM_ROOT=/tmp/.cognee_system \
    COGNEE_LOGS_DIR=/tmp/.cognee/logs \
    MEMOPS_DATA_DIR=/tmp/memops_data
# Non-secret app config (secrets LLM_API_KEY and HF_TOKEN come from the Space's
# "Settings -> Variables and secrets", NOT baked into the image).
ENV LLM_PROVIDER=custom \
    LLM_MODEL=openai/llama-3.3-70b-versatile \
    LLM_ENDPOINT=https://api.groq.com/openai/v1 \
    EMBEDDING_PROVIDER=huggingface \
    EMBEDDING_MODEL=huggingface/sentence-transformers/all-MiniLM-L6-v2 \
    EMBEDDING_DIMENSIONS=384

# HuggingFace's default Space port. Seeding runs in the background at startup
# (see backend/main.py lifespan), so the server binds here immediately.
EXPOSE 7860
CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "7860"]
