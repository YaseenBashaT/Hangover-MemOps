# Routes

## CRUD Resources

- **`/api/incidents`** GET | POST | GET/:id → Incident

## Other Routes

- `POST` `/api/alerts` params() → in: AlertRequest
- `POST` `/api/forget` params() → in: ForgetRequest ✓
- `GET` `/api/graph` params() ✓
- `GET` `/api/health` params() → out: HealthResponse
- `PATCH` `/api/incidents/{incident_id}/resolve` params(incident_id)
- `GET` `/api/insights` params() ✓
- `GET` `/api/seed-status` params()
