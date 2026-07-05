---
title: memops-api
emoji: 🧠
sdk: docker
app_port: 7860
---

# MemOps

**Live demo:** [mem-ops.vercel.app](https://mem-ops.vercel.app) · **Backend API:** [beyanki-memops-api.hf.space](https://beyanki-memops-api.hf.space)

MemOps remembers how your team fixed production incidents, so the next person who gets paged does not start from nothing.

## The problem

It is 3am and the payments API is down. Connection pool errors are filling the logs, checkout is failing for real customers, and the pager will not stop. You open the runbook. It says "escalate to Sarah." Sarah left the company six months ago.

This failure has happened before. In October 2024 Sarah raised the connection pool from 10 to 50 and the service recovered (INC-2024-1014). In February 2025 Raj hit the same wall, except the pool was already at 50, so he put PgBouncer in front of it and raised the limit to 100 (INC-2025-0203). By August the team stopped raising the number by hand and shipped dynamic autoscaling instead (INC-2025-0819). Three different engineers hit the same wall, and each one left the fix a little better than they found it. None of that is in the runbook. It lives in old Slack threads and closed Jira tickets, and in the heads of the people who have since moved on.

So at 3am you rediscover what the team already knew. You raise the pool size and restart, and you hope it holds until morning. That is the tax MemOps is built to remove.

## What MemOps does

Every resolved incident goes into a knowledge graph. The service, the error log, the Slack thread, the Jira ticket, the git commits, and the fix that actually worked all get stored together. Seventeen real incidents are seeded in, covering payments-api, recommendation-service, api-gateway, and seven other services.

When a new alert fires, an engineer pastes the alert text into MemOps. The system reads it, walks the graph for anything related, and answers with two things: a suggested fix drawn from past resolutions, and the specific incidents behind that suggestion. For the payments-api pool alert it returns INC-2024-1014, INC-2025-0203, and INC-2025-0819, ranked by how closely each one matches, and every card shows its date and the fix that was applied. The suggested fix is not generic advice about connection pools. It describes dynamic autoscaling with a floor of 50 connections and a ceiling of 200, because that is what the August incident recorded.

The engineer reads the history, decides the suggestion is right, and clicks Approve Fix. Two things happen. The incident is marked resolved, and the graph runs an enrichment pass that strengthens the links between that incident and the ones it connects to. Back on the dashboard, the nodes that were reinforced grow brighter and their edges thicken. You watch the memory get stronger at the moment the fix is approved. That loop is the reason the tool exists. The more the team feeds it, the sharper its recall gets.

The dashboard draws the whole graph as a D3 force layout. Incident nodes are colored by severity, from red for critical down to green for low, and the gray nodes are the entities that tie incidents together. Click any incident node and its detail page opens: the error log, the Slack thread as it actually happened, the Jira ticket, the commits, and the other incidents that share its service. A small line under the insights panel shows when the graph last ran its analysis, so the system reads as something that keeps watching rather than something you have to poke.

## How Cognee powers the memory

MemOps uses Cognee 1.2.2 as its memory layer. Every call into Cognee lives behind a single file, `backend/services/memory_service.py`, so no route or component ever touches the graph directly. Four operations do the work.

**remember() stores each incident.** On ingest, MemOps formats an incident into one text block that carries its ID, service, severity, error log, Slack thread, Jira ticket, git commits, and applied fix, then calls `remember()` against a shared dataset named `incidents`. Cognee pulls entities and relationships out of that text and writes them into the graph. Because every incident lands in the same dataset, the payments-api node created by INC-2024-1014 is the same node that INC-2025-0203 and INC-2025-0819 attach to. That shared node is how three separate incidents become one connected story instead of three isolated records.

**recall() finds related incidents when a new alert fires.** MemOps turns the alert text into a direct question and calls `recall()` with the GRAPH_COMPLETION search type for the suggested fix. For the ranked "Related Past Incidents" cards, it uses `recall()` with `SearchType.CHUNKS` — Cognee's vector store returns the most relevant document chunks, each tagged with an Incident ID, and those IDs are mapped to their structured incident cards. The ranking is real embedding similarity from Cognee's own vector store (HuggingFace `all-MiniLM-L6-v2`), not keyword matching. For the payments-api pool alert, INC-2024-1014, INC-2025-0203, and INC-2025-0819 rank above INC-2025-0118 because the embedding space separates pool-exhaustion incidents from the unrelated auth outage on the same service.

**improve() strengthens fix patterns when an engineer approves.** Approving a fix calls `improve()` on the `incidents` dataset. Cognee re-runs its enrichment pipeline and re-indexes the triplet embeddings around the resolved incident and its neighbors. To make the learning visible, MemOps captures a before-recall and an after-recall (using the same canonical query) around the `improve()` call and returns both to the frontend. The MemifyCard's "See what changed" section shows the two answers side-by-side so the judge can see whether the graph's answer evolved. If the answers are identical the card says "graph re-indexed; answer already optimal" — never a fabricated diff.

**forget() prunes closed datasets.** When a dataset is done, `forget()` drops it from the graph. MemOps puts an explicit name check in front of the shared `incidents` dataset so a stray call cannot erase the seeded history by accident.

## The four Cognee primitives — all live in the UI

| Primitive | What MemOps does | Where to trigger it |
|---|---|---|
| `remember()` | Formats an incident into a text block and ingests it into the Cognee graph | **Log Incident** page → fill form → submit |
| `recall()` | Retrieves relevant chunks (ranking) + GRAPH_COMPLETION (suggested fix) | **New Alert** page → paste alert → Analyze |
| `improve()` | Re-indexes graph triplets after a resolution; before/after evidence captured | **New Alert** or **Incident Detail** → Approve Fix |
| `forget()` | Prunes a named dataset from graph memory | Demonstrated in the demo video against a scratch dataset |

The LLM provider is a config value, not a hard dependency. It is read from environment variables in that same file, and MemOps runs on Groq's `llama-3.3-70b-versatile` right now. Switching to another OpenAI-compatible endpoint is a config change rather than a rewrite, because the embeddings stay local and the graph never has to be rebuilt.

## The demo

1. Open [mem-ops.vercel.app](https://mem-ops.vercel.app).
2. Look at the knowledge graph. Seventeen incident nodes, colored by severity, connected through services and fixes.
3. Read one of the proactive insights on the right. Each names a service and cites real incident IDs.
4. Click **New Alert** and paste: `payments-api is throwing connection pool errors, pool appears exhausted, service degraded`
5. Click **Analyze**. Watch the three progress stages: embedding → graph traversal → synthesis. Results show the three payments-api incidents ranked by Cognee retrieval, the distractor (INC-2025-0118, different problem same service, scored far lower), and a suggested fix from the most recent resolution.
6. Click **Approve Fix → Reinforce Memory**. The MemifyCard appears — expand "See what changed" to view the before/after recall evidence of what the graph learned.
7. Watch the return to the dashboard. The reinforced nodes are highlighted green.
8. Click **Log Incident** in the nav. Fill out the form and submit — watch a new node appear in the graph (`remember()` live).

## Tech stack

The backend is FastAPI. The memory layer is Cognee, which runs its LLM calls against Groq (`llama-3.3-70b-versatile`) and computes embeddings through HuggingFace's hosted inference API (`all-MiniLM-L6-v2`), which keeps the backend's memory footprint low enough to deploy on a small instance. The graph itself lives in Cognee's embedded ladybug store. The frontend is React, built with Vite and styled with Tailwind. The graph view is D3.js, and it draws the real nodes and edges the backend returns rather than any canned layout.

## Setup

You need Python 3.12 or newer, Node 18 or newer, and a Groq API key.

Clone the repo:

```
git clone https://github.com/YaseenBashaT/Hangover-MemOps.git
cd Hangover-MemOps
```

Install the backend:

```
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Configure the environment. Create a file named `.env` in the project root, and a second copy at `backend/.env` with the same contents. The scripts read the root file and the API server reads the backend one, so both need to exist:

```
LLM_API_KEY=your_groq_api_key
LLM_PROVIDER=custom
LLM_MODEL=openai/llama-3.3-70b-versatile
LLM_ENDPOINT=https://api.groq.com/openai/v1
HF_TOKEN=your_huggingface_read_token
EMBEDDING_PROVIDER=huggingface
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
EMBEDDING_DIMENSIONS=384
```

Seed the graph with the seventeen incidents. This wipes any existing data, ingests every incident, and fills the structured store the dashboard reads:

```
python reseed17.py
```

Run the backend:

```
uvicorn backend.main:app --port 8000
```

In a second terminal, run the frontend:

```
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The API serves on port 8000, and CORS is set for the Vite dev server on port 5173.

## AI declaration

I built MemOps with Claude Code as my AI coding assistant throughout, which the hackathon rules require me to state. Claude Code wrote and revised the backend, the Cognee integration, and the React frontend under my direction, and I reviewed and tested the output at each step before it went in.
