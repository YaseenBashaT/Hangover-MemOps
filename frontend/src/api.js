// Single place that talks to the live FastAPI backend. No mock data anywhere.
// Production builds (including Vercel previews, which may not have
// VITE_API_BASE set) fall back to the hosted backend.
const BASE =
  import.meta.env.VITE_API_BASE ||
  (import.meta.env.PROD ? "https://beyanki-memops-api.hf.space" : "http://localhost:8000");

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
// frontend from even issuing the request on every page remount.
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

// Shared severity palette (matches tailwind.config sev.* and the memory map).
export const SEV_COLORS = {
  critical: "#C93C3C",
  high: "#C2611C",
  medium: "#B7791F",
  low: "#2F855A",
  none: "#8E949D",
};

export function sevColor(sev) {
  return SEV_COLORS[sev] || SEV_COLORS.none;
}

const ACRONYMS = new Set(["api", "cpu", "db", "dns", "http", "oom", "sms", "ssl", "tls", "url"]);

// "connection_pool_exhausted" -> "Connection pool exhausted", "ssl_cert" -> "SSL cert"
export function humanize(name) {
  if (!name) return "";
  const words = String(name).replace(/[_-]+/g, " ").trim().split(/\s+/);
  const out = words.map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.toLowerCase()));
  return out.join(" ").replace(/^./, (c) => c.toUpperCase());
}

export function fmtDate(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC", // incident times are stored in UTC
    });
  } catch {
    return ts;
  }
}
