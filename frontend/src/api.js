// Single place that talks to the live FastAPI backend. No mock data anywhere.
const BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

async function req(path, options) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || JSON.stringify(body);
    } catch {
      /* ignore */
    }
    throw new Error(`${res.status} ${detail}`);
  }
  return res.json();
}

export const api = {
  base: BASE,
  listIncidents: () => req("/api/incidents"),
  getIncident: (id) => req(`/api/incidents/${encodeURIComponent(id)}`),
  getGraph: () => req("/api/graph"),
  getInsights: () => req("/api/insights"),
  getSeedStatus: () => req("/api/seed-status"),
  analyzeAlert: (alert_text) =>
    req("/api/alerts", { method: "POST", body: JSON.stringify({ alert_text }) }),
  resolveIncident: (id) =>
    req(`/api/incidents/${encodeURIComponent(id)}/resolve`, { method: "PATCH" }),
  logIncident: (incident) =>
    req("/api/incidents", { method: "POST", body: JSON.stringify(incident) }),
};

// Insights are LLM-backed and rarely change, so fetch them at most ONCE per
// page load and share the result across every component mount / re-render /
// in-app navigation. The backend also caches server-side, but this keeps the
// frontend from even issuing the request on every Dashboard remount.
let _insightsPromise = null;
export function loadInsightsOnce() {
  if (!_insightsPromise) {
    _insightsPromise = api.getInsights().catch((e) => {
      _insightsPromise = null; // allow a retry on the next mount if it failed
      throw e;
    });
  }
  return _insightsPromise;
}

// Shared severity palette (matches tailwind.config sev.* + D3 fill colors).
export const SEV_COLORS = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#22c55e",
  none: "#6b7280",
};

export function sevColor(sev) {
  return SEV_COLORS[sev] || SEV_COLORS.none;
}
