import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api, sevColor, loadInsightsOnce } from "../api.js";
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


function fmtWhen(ts) {
  if (!ts) return null;
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return ts;
  }
}

// P0-d: Warm-up state shown during backend seed (HF Space cold start).
function SeedingBanner({ seedStatus }) {
  const count = seedStatus?.count ?? 0;
  const total = seedStatus?.total ?? 17;
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-4 p-8 text-center">
      <span className="text-5xl">🧠</span>
      <div>
        <div className="text-lg font-semibold text-white">Memory is warming up</div>
        <p className="mt-1 text-sm text-gray-400">
          Seeding {count} of {total} incidents into the graph…
        </p>
        {total > 0 && (
          <div className="mt-3 h-1.5 w-48 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-brand transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>
      <p className="text-xs text-gray-500">
        This takes ~3 minutes on a cold start. Hang tight.
      </p>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [highlightIds, setHighlightIds] = useState(location.state?.reinforced || []);
  const [showHighlight, setShowHighlight] = useState(true);
  const [highlightAt, setHighlightAt] = useState(location.state?.at || null);
  const [incidents, setIncidents] = useState(null);
  const [graph, setGraph] = useState(null);
  const [insights, setInsights] = useState(null);
  const [err, setErr] = useState(null);
  const [insightsErr, setInsightsErr] = useState(null);

  // P0-d: seed-status polling state
  const [seedStatus, setSeedStatus] = useState(null);
  const seedPollRef = useRef(null);

  useEffect(() => {
    const incoming = location.state?.reinforced;
    const at = location.state?.at;
    if (incoming && at !== highlightAt) {
      setHighlightIds(incoming);
      setShowHighlight(true);
      setHighlightAt(at);
    }
  }, [location.state, highlightAt]);

  // P0-d: poll seed-status while seeding is in progress, then refresh data.
  function startSeedPolling() {
    if (seedPollRef.current) return;
    seedPollRef.current = setInterval(async () => {
      try {
        const status = await api.getSeedStatus();
        setSeedStatus(status);
        if (status.state === "complete" || status.state === "failed") {
          clearInterval(seedPollRef.current);
          seedPollRef.current = null;
          if (status.state === "complete") {
            // Reload the real data now that seeding is done.
            try {
              const [inc, g] = await Promise.all([api.listIncidents(), api.getGraph()]);
              setIncidents(inc);
              setGraph(g);
              setSeedStatus(null); // hide the banner
            } catch (e) {
              setErr(e.message);
            }
          }
        }
      } catch {
        /* polling is best-effort */
      }
    }, 5000);
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [inc, g] = await Promise.all([api.listIncidents(), api.getGraph()]);
        if (!alive) return;
        setIncidents(inc);
        setGraph(g);

        // P0-d: if no incidents yet, check whether we're still seeding.
        if ((inc?.count ?? 0) === 0) {
          try {
            const status = await api.getSeedStatus();
            if (alive) {
              setSeedStatus(status);
              if (status.state === "pending" || status.state === "in_progress") {
                startSeedPolling();
              }
            }
          } catch {
            /* seed-status is best-effort */
          }
        }
      } catch (e) {
        if (alive) setErr(e.message);
      }
      try {
        const ins = await loadInsightsOnce();
        if (alive) setInsights(ins);
      } catch (e) {
        if (alive) setInsightsErr(e.message);
      }
    })();
    return () => {
      alive = false;
      clearInterval(seedPollRef.current);
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

  // Show the seeding banner when actively seeding (pending/in_progress)
  const isSeeding =
    seedStatus &&
    (seedStatus.state === "pending" || seedStatus.state === "in_progress");
  const seedFailed = seedStatus?.state === "failed";

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
            {(incidents?.incidents || []).length === 0 && !isSeeding && !err && (
              <div className="px-3 py-4 text-sm text-gray-500">
                No incidents yet.{" "}
                <button
                  onClick={() => navigate("/incidents/new")}
                  className="text-brand hover:underline"
                >
                  Log your first incident
                </button>
              </div>
            )}
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
            {/* P0-d: seeding warm-up state */}
            {isSeeding && <SeedingBanner seedStatus={seedStatus} />}
            {seedFailed && (
              <div className="p-4">
                <ErrorBox
                  error={`Seeding failed: ${seedStatus.error || "unknown error"}`}
                  hint="Check the backend logs. You may need to restart the Space."
                />
              </div>
            )}
            {!isSeeding && !seedFailed && !graph && !err && (
              <div className="flex h-full items-center justify-center">
                <Spinner label="Loading graph…" />
              </div>
            )}
            {!isSeeding && err && (
              <div className="p-4">
                <ErrorBox error={err} hint="Is the backend running on :8000?" />
              </div>
            )}
            {!isSeeding && graph && (
              <GraphView
                data={graph}
                onIncidentClick={onIncidentClick}
                highlightIds={showHighlight ? highlightIds : []}
              />
            )}
            {/* P1-a: empty graph call-to-action */}
            {!isSeeding && graph && graph.stats.incident_nodes === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
                <span className="text-4xl">📭</span>
                <p className="text-sm text-gray-400">No incidents in memory yet.</p>
                <button
                  onClick={() => navigate("/incidents/new")}
                  className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/80"
                >
                  Log your first incident
                </button>
              </div>
            )}
            {highlightIds.length > 0 && (
              <button
                type="button"
                onClick={() => setShowHighlight((v) => !v)}
                title={showHighlight ? "Hide reinforced-memory highlight" : "Show reinforced-memory highlight"}
                className={`absolute right-3 top-3 flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition ${
                  showHighlight
                    ? "border-green-500/40 bg-green-500/10 text-green-300 animate-memify"
                    : "border-edge bg-panel2/80 text-gray-400 hover:text-gray-200"
                }`}
              >
                🧠 memory reinforced — {highlightIds.length} node(s) strengthened
                <span className="ml-1 rounded border border-current/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                  {showHighlight ? "Hide" : "Show"}
                </span>
              </button>
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
          {/* autonomous-monitoring cue */}
          <div className="flex items-center gap-2 border-t border-edge px-4 py-2.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            <span className="text-[11px] text-gray-500">
              {insights?.generated_at
                ? `Graph last analyzed ${fmtWhen(insights.generated_at)}`
                : "Monitoring graph…"}
            </span>
          </div>
        </Panel>
      </aside>
    </div>
  );
}
