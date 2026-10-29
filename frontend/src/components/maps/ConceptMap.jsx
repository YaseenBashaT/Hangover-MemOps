import { useMemo, useState } from "react";
import * as d3 from "d3";
import { sevColor } from "../../api.js";
import { buildConcepts, buildModel, sharesOf } from "../mapModel.js";
import MapCard from "./MapCard.jsx";
import { useBox, useFocus } from "./useBox.js";

const c = (name) => `rgb(var(--${name}))`;
const R = { critical: 8, high: 7, medium: 6, low: 5 };
// a short mark in front of each concept says what kind of thing it is
const MARK = { person: "@", ticket: "#", error: "!", service: "~", other: "·" };
const KIND_NAME = { person: "person", ticket: "ticket", error: "error", service: "service", other: "detail" };

/**
 * The memory as the things it learned: every detail (an engineer, a ticket,
 * an error) that two or more incidents share sits in the middle, wired to the
 * incidents that mention it. Incidents that share nothing yet line up along
 * the bottom.
 */
export default function ConceptMap({ data, meta, onIncidentClick, highlightIds = [], shownIds = null, latestId = null }) {
  const [ref, box] = useBox();
  const f = useFocus();
  const [concept, setConcept] = useState(null);
  const model = useMemo(() => buildModel(data), [data]);
  const concepts = useMemo(() => buildConcepts(data, model), [data, model]);
  const hi = new Set(highlightIds);

  const layout = useMemo(() => {
    if (!box) return null;
    const linked = new Set(concepts.flatMap((k) => k.incidents));
    const lonely = model.incidents.filter((n) => !linked.has(n.id));
    const bottom = lonely.length ? 64 : 0;
    const h = box.h - bottom;
    const inc = model.incidents.filter((n) => linked.has(n.id)).map((n) => ({ ...n, kindOf: "incident" }));
    const con = concepts.map((k) => ({ ...k, kindOf: "concept", w: 26 + String(k.label).length * 7.2 }));
    const edges = con.flatMap((k) => k.incidents.map((i) => ({ source: k.id, target: i })));
    const sim = d3
      .forceSimulation([...inc, ...con])
      .force("link", d3.forceLink(edges).id((d) => d.id).distance(70).strength(0.7))
      .force("charge", d3.forceManyBody().strength((d) => (d.kindOf === "concept" ? -420 : -140)))
      .force("collide", d3.forceCollide((d) => (d.kindOf === "concept" ? d.w / 2 + 6 : 16)))
      .force("x", d3.forceX(box.w / 2).strength(0.06))
      .force("y", d3.forceY(h / 2).strength(0.1))
      .stop();
    for (let i = 0; i < 400; i++) sim.tick();
    // keep everything inside the box
    for (const n of [...inc, ...con]) {
      const half = n.kindOf === "concept" ? n.w / 2 + 4 : 14;
      n.x = Math.max(half, Math.min(box.w - half, n.x));
      n.y = Math.max(22, Math.min(h - 22, n.y));
    }
    const step = Math.min(56, (box.w - 40) / Math.max(1, lonely.length));
    const loose = lonely.map((n, i) => ({ ...n, kindOf: "incident", x: 20 + step * (i + 0.5), y: box.h - 26 }));
    const nodes = [...inc, ...loose];
    return { con, nodes, edges, bottom, byId: new Map(nodes.map((n) => [n.id, n])) };
  }, [box, model, concepts]);

  // what's lit: a hovered concept lights its incidents, a hovered incident its concepts
  const litIncidents = new Set();
  const litConcepts = new Set();
  if (concept) {
    litConcepts.add(concept);
    concepts.find((k) => k.id === concept)?.incidents.forEach((i) => litIncidents.add(i));
  } else if (f.focus) {
    litIncidents.add(f.focus);
    for (const k of concepts) if (k.incidents.includes(f.focus)) litConcepts.add(k.id);
  }
  const anyLit = Boolean(concept || f.focus);
  const visible = (n) => !shownIds || shownIds.has(n.id);

  const node = !concept && f.focus && layout?.byId.get(f.focus);
  const hoveredConcept = concept && layout?.con.find((k) => k.id === concept);
  return (
    <div ref={ref} className="relative h-full w-full overflow-hidden">
      {layout && (
        <svg width={box.w} height={box.h} onClick={(e) => e.target.tagName === "svg" && f.clear()}>
          {layout.edges.map((e) => {
            const k = e.source;
            const n = e.target;
            if (!visible(n)) return null;
            const lit = litConcepts.has(k.id) && litIncidents.has(n.id);
            return (
              <line
                key={`${k.id}-${n.id}`}
                x1={k.x}
                y1={k.y}
                x2={n.x}
                y2={n.y}
                style={{ stroke: c(lit ? "map-link-hot" : "map-link") }}
                strokeWidth={lit ? 2 : 1.2}
                opacity={anyLit && !lit ? 0.15 : 0.8}
              />
            );
          })}

          {layout.con.map((k) => {
            const lit = litConcepts.has(k.id);
            return (
              <g
                key={k.id}
                transform={`translate(${k.x},${k.y})`}
                opacity={anyLit && !lit ? 0.35 : 1}
                className="cursor-default"
                onMouseEnter={() => setConcept(k.id)}
                onMouseLeave={() => setConcept(null)}
              >
                <rect
                  x={-k.w / 2}
                  y={-13}
                  width={k.w}
                  height={26}
                  rx={13}
                  style={{ fill: c(lit ? "accent-wash" : "sheet"), stroke: c(lit ? "accent" : "rule") }}
                  strokeWidth={1.5}
                />
                <text textAnchor="middle" dy="0.35em" fontSize={12} className="font-mono" style={{ fill: c("ink") }}>
                  <tspan style={{ fill: c("accent") }}>{MARK[k.kind]} </tspan>
                  {k.label}
                </text>
              </g>
            );
          })}

          {layout.bottom > 0 && (
            <text x={12} y={box.h - layout.bottom + 14} fontSize={11} className="font-mono uppercase" style={{ fill: c("faint") }} letterSpacing="0.12em">
              Not connected to anything yet
            </text>
          )}

          {layout.nodes.map((n) => {
            if (!visible(n)) return null;
            const r = R[n.severity] || 6;
            const lit = litIncidents.has(n.id);
            return (
              <g
                key={n.id}
                data-node
                transform={`translate(${n.x},${n.y})`}
                opacity={anyLit && !lit ? 0.3 : 1}
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
                  <text
                    y={r + 12}
                    textAnchor="middle"
                    fontSize={10}
                    className="font-mono"
                    style={{ fill: c("muted"), stroke: c("sheet") }}
                    strokeWidth={3}
                    paintOrder="stroke"
                  >
                    {n.incident_id.replace(/^INC-/, "")}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>
      )}
      {hoveredConcept && (
        <div
          className="pointer-events-none absolute z-10 w-[17rem] rounded-lg border border-rule bg-sheet px-3 py-2.5 text-sm shadow-lg"
          style={{
            left: Math.max(8, Math.min(hoveredConcept.x + hoveredConcept.w / 2 + 10, box.w - 280)),
            top: Math.max(8, Math.min(hoveredConcept.y - 20, box.h - 120)),
          }}
        >
          <div className="font-mono text-[13px] font-semibold">{hoveredConcept.label}</div>
          <div className="text-muted">
            A {KIND_NAME[hoveredConcept.kind]} that {hoveredConcept.incidents.length} incidents share
          </div>
          <div className="mt-1.5 font-mono text-[12.5px]">
            {hoveredConcept.incidents.map((i) => layout.byId.get(i)?.incident_id).join(", ")}
          </div>
        </div>
      )}
      {node && (
        <MapCard
          node={node}
          info={meta?.get(node.incident_id)}
          shares={sharesOf(node.id, model.links, layout.byId).filter((s) => s.other)}
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
