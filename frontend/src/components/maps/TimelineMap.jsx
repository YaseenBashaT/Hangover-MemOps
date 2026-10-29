import { useMemo } from "react";
import * as d3 from "d3";
import { sevColor } from "../../api.js";
import { buildModel, incidentTime, sharesOf } from "../mapModel.js";
import MapCard from "./MapCard.jsx";
import { useBox, useFocus } from "./useBox.js";

const c = (name) => `rgb(var(--${name}))`;
const R = { critical: 8, high: 7, medium: 6, low: 5 };
const LEFT = 168;
const MIN_W = 760; // narrower screens scroll sideways inside the box

/**
 * The memory as a timeline: one lane per service, incidents placed on the day
 * they happened, and an arc between incidents that share a detail. A problem
 * that keeps coming back shows up as a chain of arcs along one lane.
 *
 * Answers: does a problem keep coming back, and how long between each time?
 */
export default function TimelineMap({ data, meta, onIncidentClick, highlightIds = [], shownIds = null, latestId = null }) {
  const [ref, box] = useBox();
  const f = useFocus();
  const model = useMemo(() => buildModel(data), [data]);
  const hi = new Set(highlightIds);

  const layout = useMemo(() => {
    if (!box) return null;
    const w = Math.max(box.w, MIN_W);
    const lanes = model.services.map((s) => s.name);
    const laneH = Math.max(32, Math.min(64, (box.h - 60) / lanes.length));
    const times = model.incidents.map((n) => incidentTime(n, meta));
    const x = d3
      .scaleTime()
      .domain([d3.timeMonth.offset(d3.min(times), -1), d3.timeMonth.offset(d3.max(times), 1)])
      .range([LEFT, w - 28]);
    const y = (service) => 48 + (lanes.indexOf(service) + 0.5) * laneH;
    const nodes = model.incidents.map((n) => ({ ...n, x: x(incidentTime(n, meta)), y: y(n.service) }));
    return { w, h: 48 + lanes.length * laneH + 12, x, y, laneH, lanes, nodes, byId: new Map(nodes.map((n) => [n.id, n])) };
  }, [box, model, meta]);

  const near = new Set();
  if (f.focus) {
    near.add(f.focus);
    for (const l of model.links) {
      if (l.a === f.focus) near.add(l.b);
      if (l.b === f.focus) near.add(l.a);
    }
  }
  const visible = (n) => !shownIds || shownIds.has(n.id);

  function arc(l) {
    const a = layout.byId.get(l.a);
    const b = layout.byId.get(l.b);
    const [p, q] = a.x <= b.x ? [a, b] : [b, a];
    if (p.y === q.y) {
      // same service: an arch over the lane, taller for problems further apart in time
      const lift = Math.min(layout.laneH * 0.85, 10 + (q.x - p.x) * 0.18);
      return `M${p.x},${p.y} C${p.x},${p.y - lift} ${q.x},${q.y - lift} ${q.x},${q.y}`;
    }
    const mx = (p.x + q.x) / 2;
    return `M${p.x},${p.y} C${mx},${p.y} ${mx},${q.y} ${q.x},${q.y}`;
  }

  const node = f.focus && layout?.byId.get(f.focus);
  return (
    <div ref={ref} className="relative h-full w-full overflow-auto">
      {layout && (
        <svg width={layout.w} height={Math.max(layout.h, box.h)} onClick={(e) => e.target.tagName === "svg" && f.clear()}>
          {/* lanes */}
          {layout.lanes.map((s, i) => (
            <g key={s}>
              {i % 2 === 0 && (
                <rect x={0} y={48 + i * layout.laneH} width={layout.w} height={layout.laneH} style={{ fill: c("raise") }} opacity={0.45} />
              )}
              <text x={16} y={layout.y(s) + 4} fontSize={12} className="font-mono" style={{ fill: c("muted") }}>
                {s}
              </text>
            </g>
          ))}
          {/* month grid, labelled every quarter */}
          {layout.x.ticks(d3.timeMonth.every(1)).map((t) => {
            const quarter = t.getUTCMonth() % 3 === 0;
            return (
              <g key={+t}>
                <line
                  x1={layout.x(t)}
                  x2={layout.x(t)}
                  y1={40}
                  y2={layout.h}
                  style={{ stroke: c("rule") }}
                  strokeDasharray={quarter ? undefined : "2 4"}
                />
                {quarter && (
                  <text x={layout.x(t) + 4} y={30} fontSize={11} className="font-mono" style={{ fill: c("faint") }}>
                    {d3.utcFormat(t.getUTCMonth() === 0 ? "%Y" : "%b")(t)}
                  </text>
                )}
              </g>
            );
          })}

          {model.links.map((l) => {
            const lit = f.focus && (l.a === f.focus || l.b === f.focus);
            if (!visible(layout.byId.get(l.a)) || !visible(layout.byId.get(l.b))) return null;
            return (
              <path
                key={`${l.a}-${l.b}`}
                d={arc(l)}
                fill="none"
                style={{ stroke: c(lit ? "map-link-hot" : "map-link") }}
                strokeWidth={lit ? 2.5 : 1.4}
                opacity={f.focus && !lit ? 0.15 : 0.9}
                strokeDasharray={lit ? "2 8" : undefined}
                className={lit ? "graph-flow" : undefined}
              />
            );
          })}

          {layout.nodes.map((n) => {
            if (!visible(n)) return null;
            const r = R[n.severity] || 6;
            const faded = f.focus && !near.has(n.id);
            return (
              <g
                key={n.id}
                data-node
                transform={`translate(${n.x},${n.y})`}
                opacity={faded ? 0.25 : 1}
                className="cursor-pointer"
                tabIndex={0}
                role="button"
                aria-label={`${n.incident_id} on ${n.service}`}
                onMouseEnter={() => f.enter(n.id)}
                onMouseLeave={f.leave}
                onFocus={() => f.enter(n.id)}
                onBlur={f.leave}
                onClick={() => f.toggle(n.id)}
                onKeyDown={(e) => e.key === "Enter" && f.toggle(n.id)}
              >
                <g className="graph-pop">
                  {(hi.has(n.incident_id) || n.id === latestId) && (
                    <circle r={r + 7} fill="none" style={{ stroke: c("map-link-hot") }} strokeWidth={2.5} className="graph-halo" />
                  )}
                  {f.pinned === n.id && <circle r={r + 4} fill="none" style={{ stroke: c("ink") }} strokeWidth={2} />}
                  <circle r={r} style={{ fill: sevColor(n.severity), stroke: c("paper") }} strokeWidth={2} />
                </g>
              </g>
            );
          })}
        </svg>
      )}
      {node && (
        <MapCard
          node={node}
          info={meta?.get(node.incident_id)}
          shares={sharesOf(node.id, model.links, layout.byId)}
          pinned={f.pinned === node.id}
          at={[node.x - ref.current.scrollLeft, node.y]}
          box={box}
          narrow={box.w < 640}
          onOpen={onIncidentClick}
          onClose={f.clear}
        />
      )}
    </div>
  );
}
