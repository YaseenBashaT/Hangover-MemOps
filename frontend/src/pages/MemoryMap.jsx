import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, sevColor } from "../api.js";
import GraphView from "../components/GraphView.jsx";
import { ErrorNote, Spinner } from "../components/ui.jsx";

const LEGEND = [
  ["critical", "Critical"],
  ["high", "High"],
  ["medium", "Medium"],
  ["low", "Low"],
];

export default function MemoryMap() {
  const navigate = useNavigate();
  const location = useLocation();
  const [graph, setGraph] = useState(null);
  const [err, setErr] = useState(null);
  const reinforced = location.state?.reinforced || [];

  useEffect(() => {
    api.getGraph().then(setGraph).catch((e) => setErr(e.message));
  }, []);

  const open = useCallback((id) => navigate(`/incidents/${id}`), [navigate]);
  const services = graph ? new Set(graph.nodes.filter((n) => n.node_kind === "incident").map((n) => n.service)).size : 0;

  return (
    <div className="mx-auto max-w-page px-4 pb-16 pt-10 sm:px-6">
      <h1 className="text-[2.25rem] font-bold leading-tight">Memory map</h1>
      <p className="mt-2 max-w-prose text-muted">
        Each circle is a service and each dot an incident on it. A line joins two incidents
        that share something MemOps learned, like an error, a fix or the engineer who handled
        it. Hover an incident to see what, click it to open it.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted">
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
        <p className="mt-3 text-sm text-teal-dark">The ringed incident is the one MemOps just re-learned.</p>
      )}

      <div className="mt-4 min-h-[20rem] overflow-hidden border border-rule bg-sheet sm:h-[70vh] sm:min-h-[28rem]">
        {err && <div className="p-4"><ErrorNote error={err} /></div>}
        {!graph && !err && (
          <div className="flex h-full items-center justify-center">
            <Spinner label="Drawing the map…" />
          </div>
        )}
        {graph && <GraphView data={graph} onIncidentClick={open} highlightIds={reinforced} />}
      </div>
      <p className="mt-2 text-sm text-muted">
        Labels show the incident number.{" "}
        <span className="hidden sm:inline">Scroll to zoom, drag to move around.</span>
      </p>
    </div>
  );
}
