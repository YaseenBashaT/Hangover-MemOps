import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, fmtDate, humanize, sevColor } from "../api.js";
import GraphView from "../components/GraphView.jsx";
import { Button, ErrorNote, Spinner } from "../components/ui.jsx";

const LEGEND = [
  ["critical", "Critical"],
  ["high", "High"],
  ["medium", "Medium"],
  ["low", "Low"],
];
const STEP_MS = 900;

export default function MemoryMap() {
  const navigate = useNavigate();
  const location = useLocation();
  const [graph, setGraph] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [err, setErr] = useState(null);
  const [step, setStep] = useState(null); // null = everything shown; a number while replaying
  const timer = useRef(null);
  const reinforced = location.state?.reinforced || [];

  useEffect(() => {
    api.getGraph().then(setGraph).catch((e) => setErr(e.message));
    // only used for names and dates on the map, so a failure here is fine
    api.listIncidents().then((d) => setIncidents(d.incidents || [])).catch(() => {});
    return () => clearInterval(timer.current);
  }, []);

  const meta = useMemo(() => new Map(incidents.map((i) => [i.incident_id, i])), [incidents]);
  // incident nodes in the order they happened
  const timeline = useMemo(() => {
    if (!graph) return [];
    const nodes = graph.nodes.filter((n) => n.node_kind === "incident");
    const when = (n) => meta.get(n.incident_id)?.timestamp || n.incident_id;
    return nodes.sort((a, b) => (when(a) < when(b) ? -1 : 1));
  }, [graph, meta]);

  const shownIds = useMemo(
    () => (step === null ? null : new Set(timeline.slice(0, step + 1).map((n) => n.id))),
    [step, timeline]
  );
  const latest = step === null ? null : timeline[step];

  function replay() {
    clearInterval(timer.current);
    setStep(0);
    timer.current = setInterval(() => {
      setStep((s) => {
        if (s + 1 >= timeline.length) {
          clearInterval(timer.current);
          return null;
        }
        return s + 1;
      });
    }, STEP_MS);
  }
  function stop() {
    clearInterval(timer.current);
    setStep(null);
  }

  const open = useCallback((id) => navigate(`/incidents/${id}`), [navigate]);
  const services = graph ? new Set(timeline.map((n) => n.service)).size : 0;
  const latestInfo = latest && meta.get(latest.incident_id);

  return (
    <div className="mx-auto max-w-page px-4 pb-16 pt-10 sm:px-6">
      <h1 className="text-[2.25rem] font-semibold tracking-tight leading-tight">Memory map</h1>
      <p className="mt-2 max-w-prose text-muted">
        Each island is a service and each dot an incident on it. A line joins two incidents
        that share something MemOps learned, like an error, a fix or the engineer who handled
        it. Grab a dot and pull: the lines act like springs. Click one to see what it shares.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
        {step === null ? (
          <Button variant="quiet" onClick={replay} disabled={!graph}>
            <span aria-hidden>▶</span> Replay how it learned
          </Button>
        ) : (
          <Button variant="quiet" onClick={stop}>
            <span aria-hidden>■</span> Stop
          </Button>
        )}
        {LEGEND.map(([k, label]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: sevColor(k) }} aria-hidden />
            {label}
          </span>
        ))}
        {graph && (
          <span className="sm:ml-auto">
            {graph.stats.incident_nodes} incidents across {services} services
          </span>
        )}
      </div>

      {reinforced.length > 0 && (
        <p className="mt-3 text-sm text-accent-strong">The ringed incident is the one MemOps just re-learned.</p>
      )}

      <div className="relative mt-4 min-h-[20rem] overflow-hidden border border-rule bg-sheet sm:h-[70vh] sm:min-h-[28rem]">
        {err && <div className="p-4"><ErrorNote error={err} /></div>}
        {!graph && !err && (
          <div className="flex h-full items-center justify-center">
            <Spinner label="Drawing the map…" />
          </div>
        )}
        {graph && (
          <GraphView
            data={graph}
            meta={meta}
            onIncidentClick={open}
            highlightIds={reinforced}
            shownIds={shownIds}
            latestId={latest?.id}
          />
        )}
        {latest && (
          <div className="pointer-events-none absolute left-3 top-3 z-10 bg-sheet/90 px-2 py-1" aria-live="polite">
            <div className="font-mono text-[2rem] leading-none text-ink">
              {latestInfo ? fmtDate(latestInfo.timestamp) : latest.incident_id}
            </div>
            <div className="mt-1 text-sm text-muted">
              Remembered {step + 1} of {timeline.length}
              {latestInfo && `: ${humanize(latestInfo.alert_name)} on ${latest.service}`}
            </div>
          </div>
        )}
      </div>
      <p className="mt-2 text-sm text-muted">
        <span className="hidden sm:inline">Scroll to zoom in and see every incident number, drag the background to move around.</span>
        <span className="sm:hidden">Tap a dot to see what it shares.</span>
      </p>
    </div>
  );
}
