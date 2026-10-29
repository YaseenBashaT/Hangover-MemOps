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

Every resolved incident goes into a knowledge graph. The service, the error log, the Slack thread, the Jira ticket, the git commits, and the fix that actually worked all get stored together. Seventeen sample incidents are seeded in, spread across payments-api, recommendation-service, api-gateway, and seven other services from March 2024 to August 2025.

When a new alert fires, the engineer pastes it into the terminal on the **Ask** page. MemOps reads it, walks the graph for anything related, and answers in about ten seconds with a verdict ("This has happened before."), a confidence score, a suggested fix drawn from past resolutions, and the evidence behind it. For the payments-api pool alert it returns INC-2024-1014, INC-2025-0203, and INC-2025-0819, ranked by how closely each one matches, places them on a timeline so you can see the problem coming back, and shows the fix each one applied. The suggested fix is not generic advice about connection pools. It describes PgBouncer and dynamic autoscaling with a floor of 50 connections and a ceiling of 200, because that is what the team's past incidents recorded.

If the suggestion works, the engineer clicks **This fix worked**. MemOps marks the incident resolved and runs an enrichment pass that strengthens the links between that incident and the ones around it, then reports how the graph changed (for example, how many links it has before and after). A link opens the memory map with the re-learned incident ringed. The more the team feeds it, the sharper its recall gets.

The rest of the app:

- **Incidents** lists everything in memory, newest first, with a month-by-month activity chart, filters by service and severity (kept in the URL, so `/incidents?service=payments-api` is shareable), and the patterns MemOps noticed across incidents. Each incident page shows the fix, the error log, the Slack thread as it happened, the Jira ticket, the commits, and the other incidents on the same service. **Add incident** logs a new one into the graph.
- **Memory map** draws the graph four ways, each answering a different question:
  - **Islands**: which services keep having incidents, and which incidents belong together? Each service is an island and the links between incidents act like springs you can drag.
  - **Timeline**: does a problem keep coming back, and how long between each time? One lane per service, incidents on the day they happened.
  - **Orbit**: which services are tied together by shared problems? Services share a ring, sized by incident count, with links across the middle.
  - **Concepts**: what exactly links these incidents? The engineers, tickets, errors, and services that two or more incidents share, wired to those incidents.
  
  "Replay how it learned" adds the incidents back one by one in the order they happened.
- **About** explains what MemOps is, who it is for, and how it works.

The site has a light and a dark theme, and works on phones.

## How Cognee powers the memory

MemOps uses Cognee 1.2.2 as its memory layer. Every call into Cognee lives behind a single file, `backend/services/memory_service.py`, so no route or component ever touches the graph directly. Four operations do the work.

**remember() stores each incident.** On ingest, MemOps formats an incident into one text block that carries its ID, service, severity, error log, Slack thread, Jira ticket, git commits, and applied fix, then calls `remember()` against a shared dataset named `incidents`. Cognee pulls entities and relationships out of that text and writes them into the graph. Because every incident lands in the same dataset, the payments-api node created by INC-2024-1014 is the same node that INC-2025-0203 and INC-2025-0819 attach to. That shared node is how three separate incidents become one connected story instead of three isolated records.

**recall() finds related incidents when a new alert fires.** MemOps turns the alert text into a direct question and calls `recall()` with the GRAPH_COMPLETION search type for the suggested fix. For the ranked "Related Past Incidents" cards, it uses `recall()` with `SearchType.CHUNKS` — Cognee's vector store returns the most relevant document chunks, each tagged with an Incident ID, and those IDs are mapped to their structured incident cards. The ranking is real embedding similarity from Cognee's own vector store (HuggingFace `all-MiniLM-L6-v2`), not keyword matching. For the payments-api pool alert, INC-2024-1014, INC-2025-0203, and INC-2025-0819 rank above INC-2025-0118 because the embedding space separates pool-exhaustion incidents from the unrelated auth outage on the same service.

**improve() strengthens fix patterns when an engineer confirms a fix.** Clicking "This fix worked" (on Ask) or "Re-learn this incident" (on an incident page) calls `improve()` on the `incidents` dataset. Cognee re-runs its enrichment pipeline and re-indexes the triplet embeddings around the resolved incident and its neighbors. MemOps counts the graph's nodes and edges before and after, and also runs the same recall query before and after `improve()`; the API returns both answers in `learning_evidence`, with the note "graph re-indexed; answer already optimal" when they are identical rather than a made-up difference. The UI shows the change in links and the related incidents that were reinforced.

**forget() prunes closed datasets.** When a dataset is done, `forget()` drops it from the graph. MemOps puts an explicit name check in front of the shared `incidents` dataset so a stray call cannot erase the seeded history by accident.

## The four Cognee primitives

| Primitive | What MemOps does | Where to trigger it |
|---|---|---|
| `remember()` | Formats an incident into a text block and ingests it into the Cognee graph | **Incidents → Add incident** → fill the form → submit |
| `recall()` | Retrieves relevant chunks (ranking) + GRAPH_COMPLETION (suggested fix) | **Ask** → paste an alert → Ask memory |
| `improve()` | Re-indexes graph triplets after a resolution; before/after evidence captured | **Ask** → This fix worked, or an incident page → Re-learn this incident |
| `forget()` | Prunes a named dataset from graph memory | `POST /api/forget` with a scratch dataset (the shared `incidents` dataset is protected) |

The LLM provider is a config value, read from environment variables in that same file. MemOps runs on Groq's `openai/gpt-oss-20b` right now. It used `llama-3.3-70b-versatile` until Groq retired that model, then briefly `qwen/qwen3.8-27b`, which Groq's free tier caps at 1,000 output tokens a minute. One graph extraction can ask for more than that, so every call sat waiting. Switching models means changing one environment variable, and any other OpenAI-compatible endpoint works the same way. Embeddings come from a separate model, so the graph doesn't need to be rebuilt.

Groq's free tier also allows 8,000 tokens a minute per model, so MemOps keeps its prompts small. It turns off Cognee's session memory, which otherwise adds a second LLM call to every alert and carries earlier alerts into later answers, and it sends 8 graph triplets per recall instead of Cognee's default 15. An alert costs about 3,000 tokens and comes back in a few seconds. Both settings can be changed with the `CACHING` and `RECALL_TOP_K` environment variables.

## The demo

1. Open [mem-ops.vercel.app](https://mem-ops.vercel.app). The **About** page explains the idea in a minute.
2. On **Ask**, click the **Pool exhausted** sample, or paste: `payments-api is throwing connection pool errors, pool appears exhausted, service degraded`
3. Watch the terminal work through its steps: reading the alert, searching past incidents, writing up the fix. In about ten seconds you get the verdict, a confidence score, the suggested fix, and the five closest past incidents with their match scores and a timeline.
4. Click **This fix worked**. MemOps re-learns the incident and shows how its links changed. Follow **See it on the memory map** to find it ringed.
5. On **Memory map**, switch between Islands, Timeline, Orbit and Concepts. In Timeline, the payments-api lane shows the pool problem coming back three times. In Concepts, hover `@ mike torres` to light up his incidents.
6. Open **Incidents**, filter to payments-api, and open INC-2025-0203 to read the Slack thread, the ticket and the commit behind the fix.
7. Click **Add incident**, fill in the form and submit. The new incident joins the graph (`remember()` live) and shows up in later answers.

## Tech stack

The backend is FastAPI. The memory layer is Cognee, which runs its LLM calls against Groq (`openai/gpt-oss-20b`) and computes embeddings through HuggingFace's hosted inference API (`all-MiniLM-L6-v2`), which keeps the backend's memory footprint low enough to deploy on a small instance. The graph itself lives in Cognee's embedded ladybug store. The frontend is React 19, built with Vite and styled with Tailwind, using IBM Plex Sans and JetBrains Mono, with VT323 for the terminal. The four memory map views are drawn with D3 from the real nodes and edges the backend returns, not a canned layout.

## Fast restarts

The Space keeps its data in `/tmp`, which is wiped on every restart. Seeding 17 incidents through the LLM takes about 13 minutes and uses close to a full day of Groq's free token quota, so the image ships a prebuilt snapshot instead. `prebuilt/memops_snapshot.tar.gz` holds the seeded Cognee graph, the incident store and the insights cache. On startup the backend unpacks it when the store is empty, and all 17 incidents are back within seconds. If the snapshot is missing or was built for other paths, the backend falls back to seeding. Rebuild it with `build_snapshot.py` after changing `seed.py` or the embedding model.

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
LLM_MODEL=openai/openai/gpt-oss-20b
LLM_ENDPOINT=https://api.groq.com/openai/v1
HF_TOKEN=your_huggingface_read_token
EMBEDDING_PROVIDER=huggingface
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
EMBEDDING_DIMENSIONS=384
```

Seed the graph with the seventeen incidents. This wipes any existing data, ingests every incident, and fills the structured store the site reads:

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
