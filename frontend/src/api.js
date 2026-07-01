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
  analyzeAlert: (alert_text) =>
    req("/api/alerts", { method: "POST", body: JSON.stringify({ alert_text }) }),
  resolveIncident: (id) =>
    req(`/api/incidents/${encodeURIComponent(id)}/resolve`, { method: "PATCH" }),
};

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
