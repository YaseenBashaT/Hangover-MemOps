import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, sevColor } from "../api.js";
import GraphView from "../components/GraphView.jsx";
import { ErrorNote, Spinner } from "../components/ui.jsx";

// three.js is heavy, so the 3D view only loads when someone opens it.
const GraphView3D = lazy(() => import("../components/GraphView3D.jsx"));

const LEGEND = [
  ["critical", "Critical"],
  ["high", "High"],
  ["medium", "Medium"],
  ["low", "Low"],
];

// Small screens and reduced-motion users start on the flat view.
function defaultView() {
  if (typeof window === "undefined") return "3d";
  const small = window.matchMedia("(max-width: 640px)").matches;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return small || still ? "flat" : "3d";
}

const HOW_TO = {
  "3d": "Drag to turn it, scroll to zoom, click an incident to fly to it and open it.",
  flat: "Scroll to zoom, drag to move things around, click an incident to open it.",
};

export default function MemoryMap() {
  const navigate = useNavigate();
  const location = useLocation();
  const [graph, setGraph] = useState(null);
  const [err, setErr] = useState(null);
  const [view, setView] = useState(defaultView);
  const reinforced = location.state?.reinforced || [];

  useEffect(() => {
    api.getGraph().then(setGraph).catch((e) => setErr(e.message));
  }, []);

  const open = useCallback((id) => navigate(`/incidents/${id}`), [navigate]);
  const drawing = (
    <div className="flex h-full items-center justify-center">
      <Spinner label="Drawing the map…" />
    </div>
  );

  return (
    <div className="mx-auto max-w-page px-4 pb-16 pt-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-[2.25rem] font-bold leading-tight">Memory map</h1>
        <div className="inline-flex rounded-md border border-rule bg-white p-0.5" role="group" aria-label="View">
          {[
            ["3d", "3D"],
            ["flat", "Flat"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              aria-pressed={view === key}
              className={`rounded px-3.5 py-1.5 text-[15px] ${
                view === key ? "bg-ink font-bold text-white" : "text-muted hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-2 max-w-prose text-muted">
        Each colored dot is an incident. The small grey dots are what they share: services,
        errors, fixes and people. Hover an incident to see its links.
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
            {graph.stats.incident_nodes} incidents and {graph.stats.entity_nodes} linked details
          </span>
        )}
      </div>

      {reinforced.length > 0 && (
        <p className="mt-3 text-sm text-teal-dark">
          The highlighted incident is the one MemOps just re-learned.
        </p>
      )}

      <div className="mt-4 h-[70vh] min-h-[26rem] overflow-hidden border border-rule bg-sheet">
        {err && <div className="p-4"><ErrorNote error={err} /></div>}
        {!graph && !err && drawing}
        {graph && view === "flat" && <GraphView data={graph} onIncidentClick={open} highlightIds={reinforced} />}
        {graph && view === "3d" && (
          <Suspense fallback={drawing}>
            <GraphView3D data={graph} onIncidentClick={open} highlightIds={reinforced} />
          </Suspense>
        )}
      </div>
      <p className="mt-2 text-sm text-muted">{HOW_TO[view]}</p>
    </div>
  );
}
