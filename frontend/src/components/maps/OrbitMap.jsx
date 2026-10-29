import { useMemo } from "react";
import * as d3 from "d3";
import { sevColor } from "../../api.js";
import { buildModel, incidentTime, sharesOf } from "../mapModel.js";
import MapCard from "./MapCard.jsx";
import { useBox, useFocus } from "./useBox.js";

const c = (name) => `rgb(var(--${name}))`;
const R = { critical: 8, high: 7, medium: 6, low: 5 };
const GAP = 0.06; // radians between services

/**
 * The memory as an orbit: services take a slice of the ring sized by how many
 * incidents they had, incidents sit on the ring oldest first (clockwise), and
 * links cut across the middle. Busy services and the threads between them
 * stand out at a glance.
 *
 * Answers: which services are tied together by shared problems?
 */
export default function OrbitMap({ data, meta, onIncidentClick, highlightIds = [], shownIds = null, latestId = null }) {
  const [ref, box] = useBox();
  const f = useFocus();
  const model = useMemo(() => buildModel(data), [data]);
  const hi = new Set(highlightIds);

  const layout = useMemo(() => {
    if (!box) return null;
    const cx = box.w / 2;
    const cy = box.h / 2;
    const ring = Math.max(90, Math.min(box.w, box.h) / 2 - (box.w < 640 ? 70 : 110));
    const total = model.incidents.length;
    const free = 2 * Math.PI - GAP * model.services.length;
    let angle = -Math.PI / 2;
    const arcs = [];
    const nodes = [];
    for (const s of model.services) {
      const span = (free * s.items.length) / total;
      const start = angle;
      const items = [...s.items].sort((a, b) => incidentTime(a, meta) - incidentTime(b, meta));
      items.forEach((n, i) => {
        const a = start + (span * (i + 0.5)) / items.length;
        nodes.push({ ...n, a, x: cx + ring * Math.cos(a), y: cy + ring * Math.sin(a) });
      });
      arcs.push({ name: s.name, start, end: start + span, count: s.items.length });
      angle += span + GAP;
    }
    return { cx, cy, ring, arcs, nodes, byId: new Map(nodes.map((n) => [n.id, n])) };
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
  const sliceArc = layout && d3.arc().innerRadius(layout.ring + 16).outerRadius(layout.ring + 22).cornerRadius(3);

  function chord(l) {
    const a = layout.byId.get(l.a);
    const b = layout.byId.get(l.b);
    // pull the curve toward the centre, less so for neighbours on the ring
    const pull = a.service === b.service ? 0.45 : 0.05;
    const mx = layout.cx + ((a.x + b.x) / 2 - layout.cx) * pull;
    const my = layout.cy + ((a.y + b.y) / 2 - layout.cy) * pull;
    return `M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`;
  }

  const node = f.focus && layout?.byId.get(f.focus);
  return (
    <div ref={ref} className="relative h-full w-full overflow-hidden">
      {layout && (
        <svg width={box.w} height={box.h} onClick={(e) => e.target.tagName === "svg" && f.clear()}>
          <circle cx={layout.cx} cy={layout.cy} r={layout.ring} fill="none" style={{ stroke: c("rule") }} strokeDasharray="2 5" />
          {layout.arcs.map((s) => {
            const mid = (s.start + s.end) / 2;
            const lr = layout.ring + 34;
            const lx = layout.cx + lr * Math.cos(mid);
            const ly = layout.cy + lr * Math.sin(mid);
            const lit = node && node.service === s.name;
            return (
              <g key={s.name}>
                <path
                  d={sliceArc({ startAngle: s.start + Math.PI / 2, endAngle: s.end + Math.PI / 2 })}
                  transform={`translate(${layout.cx},${layout.cy})`}
                  style={{ fill: c(lit ? "accent" : "faint") }}
                  opacity={lit ? 0.9 : 0.35}
                />
                <text
                  x={lx}
                  y={ly}
                  fontSize={box.w < 640 ? 10 : 12}
                  textAnchor={Math.cos(mid) > 0.25 ? "start" : Math.cos(mid) < -0.25 ? "end" : "middle"}
                  dominantBaseline="middle"
                  className="font-mono"
                  style={{ fill: c(lit ? "ink" : "muted") }}
                  fontWeight={lit ? 600 : 400}
                >
                  {s.name}
                  <tspan style={{ fill: c("faint") }}> {s.count}</tspan>
                </text>
              </g>
            );
          })}

          {model.links.map((l) => {
            const lit = f.focus && (l.a === f.focus || l.b === f.focus);
            if (!visible(layout.byId.get(l.a)) || !visible(layout.byId.get(l.b))) return null;
            return (
              <path
                key={`${l.a}-${l.b}`}
                d={chord(l)}
                fill="none"
                style={{ stroke: c(lit ? "map-link-hot" : "map-link") }}
                strokeWidth={lit ? 2.5 : 1.2 + l.shared.length * 0.4}
                opacity={f.focus && !lit ? 0.12 : 0.85}
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
                  <circle r={r} style={{ fill: sevColor(n.severity), stroke: c("sheet") }} strokeWidth={2} />
                </g>
              </g>
            );
          })}

          {/* the middle says what you're looking at */}
          <text x={layout.cx} y={layout.cy - 6} textAnchor="middle" fontSize={28} fontWeight={600} className="font-mono" style={{ fill: c("ink") }}>
            {shownIds ? shownIds.size : model.incidents.length}
          </text>
          <text x={layout.cx} y={layout.cy + 16} textAnchor="middle" fontSize={12} style={{ fill: c("faint") }}>
            incidents, {model.links.length} links
          </text>
        </svg>
      )}
      {node && (
        <MapCard
          node={node}
          info={meta?.get(node.incident_id)}
          shares={sharesOf(node.id, model.links, layout.byId)}
          pinned={f.pinned === node.id}
          at={[node.x, node.y]}
          box={box}
          narrow={box.w < 640}
          onOpen={onIncidentClick}
          onClose={f.clear}
        />
      )}
    </div>
  );
}
