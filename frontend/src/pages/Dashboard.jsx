import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api, sevColor } from "../api.js";
import GraphView from "../components/GraphView.jsx";
import { Panel, Spinner, ErrorBox, BoldText } from "../components/ui.jsx";

function Stat({ label, value, color }) {
  return (
    <div className="rounded-lg border border-edge bg-panel2/70 px-4 py-3">
      <div className="text-3xl font-semibold" style={{ color: color || "#e5e7eb" }}>
        {value}
      </div>
      <div className="mt-0.5 text-xs uppercase tracking-wide text-gray-400">
        {label}
      </div>
    </div>
  );
}

const SEV_LEGEND = [
  ["critical", "Critical"],
  ["high", "High"],
  ["medium", "Medium"],
  ["low", "Low"],
  ["none", "Entity"],
];


export default function Dashboard() {
  const navigate = useNavigate();
  const [incidents, setIncidents] = useState(null);
  const [graph, setGraph] = useState(null);
  const [insights, setInsights] = useState(null);
  const [err, setErr] = useState(null);
  const [insightsErr, setInsightsErr] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      // Load the fast data (store read + graph read) first so the graph paints
      // immediately, THEN fire the slow LLM-backed insights. The backend
      // serializes graph access, so chaining also avoids lock contention.
      try {
        const [inc, g] = await Promise.all([api.listIncidents(), api.getGraph()]);
        if (!alive) return;
        setIncidents(inc);
        setGraph(g);
      } catch (e) {
        if (alive) setErr(e.message);
      }
      try {
        const ins = await api.getInsights();
        if (alive) setInsights(ins);
      } catch (e) {
        if (alive) setInsightsErr(e.message);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const stats = useMemo(() => {
    const items = incidents?.incidents || [];
    return {
      total: items.length,
      open: items.filter((i) => i.status === "open").length,
      resolved: items.filter((i) => i.status === "resolved").length,
      critical: items.filter((i) => i.severity === "critical").length,
    };
  }, [incidents]);

  const onIncidentClick = useCallback(
    (id) => navigate(`/incidents/${id}`),
    [navigate]
  );

  return (
    <div className="mx-auto grid max-w-[1600px] gap-4 px-5 py-4 lg:grid-cols-[260px_1fr_320px]"
         style={{ height: "calc(100vh - 61px)" }}>
      {/* LEFT — stats */}
      <aside className="flex min-h-0 flex-col gap-4 overflow-auto">
        <Panel title="Fleet Stats">
          <div className="grid grid-cols-2 gap-3 p-4">
            <Stat label="Total" value={stats.total} />
            <Stat label="Open" value={stats.open} color="#eab308" />
            <Stat label="Resolved" value={stats.resolved} color="#22c55e" />
            <Stat label="Critical" value={stats.critical} color="#ef4444" />
          </div>
        </Panel>
        <Panel title="Recent Incidents" className="flex-1 min-h-0">
          <div className="max-h-full overflow-auto p-2">
            {!incidents && !err && <div className="p-3"><Spinner /></div>}
            {err && <div className="p-3"><ErrorBox error={err} hint="Is the backend running on :8000?" /></div>}
            {(incidents?.incidents || []).slice(0, 12).map((i) => (
              <button
                key={i.incident_id}
                onClick={() => onIncidentClick(i.incident_id)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white/5"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: sevColor(i.severity) }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-gray-200">
                    {i.incident_id}
                  </span>
                  <span className="block truncate text-[11px] text-gray-500">
                    {i.service_affected}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </Panel>
      </aside>

      {/* CENTER — D3 graph */}
      <section className="min-h-0">
        <Panel
          title="Knowledge Graph"
          className="flex h-full flex-col"
          right={
            <div className="flex items-center gap-3">
              {graph && (
                <span className="text-xs text-gray-500">
                  {graph.stats.incident_nodes} incidents · {graph.stats.node_count} nodes ·{" "}
                  {graph.stats.edge_count} edges
                </span>
              )}
            </div>
          }
        >
          <div className="relative flex-1 min-h-0">
            {!graph && !err && (
              <div className="flex h-full items-center justify-center">
                <Spinner label="Loading graph…" />
              </div>
            )}
            {err && (
              <div className="p-4">
                <ErrorBox error={err} hint="Is the backend running on :8000?" />
              </div>
            )}
            {graph && (
              <GraphView data={graph} onIncidentClick={onIncidentClick} />
            )}
            {/* legend */}
            <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-2 rounded-lg border border-edge bg-ink/70 px-2.5 py-1.5">
              {SEV_LEGEND.map(([k, label]) => (
                <span key={k} className="flex items-center gap-1 text-[11px] text-gray-400">
                  <span className="h-2 w-2 rounded-full" style={{ background: sevColor(k) }} />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </Panel>
      </section>

      {/* RIGHT — insights */}
      <aside className="min-h-0">
        <Panel title="Proactive Insights" className="flex h-full flex-col">
          <div className="flex-1 space-y-3 overflow-auto p-4">
            {!insights && !insightsErr && (
              <Spinner label="Analyzing graph…" />
            )}
            {insightsErr && <ErrorBox error={insightsErr} />}
            {insights?.insights?.map((text, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-brand/30 bg-brand/5 p-3"
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand/30 text-[11px] font-bold text-brand">
                    {idx + 1}
                  </span>
                  <span className="text-[11px] uppercase tracking-wide text-brand/80">
                    Insight
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-gray-300">
                  <BoldText text={text} />
                </p>
              </div>
            ))}
            {insights && (insights.insights || []).length === 0 && (
              <div className="text-sm text-gray-500">No insights returned.</div>
            )}
          </div>
        </Panel>
      </aside>
    </div>
  );
}
