import { useEffect, useMemo, useRef, useState } from "react";
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
const RESIST = 0.7; // a dragged dot moves this much of the pointer's distance, so it feels heavy

/**
 * The memory as the things it learned: every detail (an engineer, a ticket,
 * an error) that two or more incidents share sits in the middle, wired to the
 * incidents that mention it. Incidents that share nothing yet line up along
 * the bottom. Anything wired up can be dragged: it pulls its neighbours along
 * and, once let go, settles wherever the springs leave it.
 */
export default function ConceptMap({ data, meta, onIncidentClick, highlightIds = [], shownIds = null, latestId = null }) {
  const [ref, box] = useBox();
  const f = useFocus();
  const [concept, setConcept] = useState(null);
  const [, setTick] = useState(0);
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const model = useMemo(() => buildModel(data), [data]);
  const concepts = useMemo(() => buildConcepts(data, model), [data, model]);
  const hi = new Set(highlightIds);

  const layout = useMemo(() => {
    if (!box) return null;
    const linked = new Set(concepts.flatMap((k) => k.incidents));
    const lonely = model.incidents.filter((n) => !linked.has(n.id));
    const bottom = lonely.length ? 64 : 0;
    const h = box.h - bottom;
    const inc = model.incidents.filter((n) => linked.has(n.id)).map((n) => ({ ...n, kindOf: "incident", live: true }));
    const con = concepts.map((k) => ({ ...k, kindOf: "concept", live: true, w: 26 + String(k.label).length * 7.2 }));
    // keep everything inside the box, on every tick
    const inside = (n) => {
      const half = n.kindOf === "concept" ? n.w / 2 + 4 : 14;
      n.x = Math.max(half, Math.min(box.w - half, n.x));
      n.y = Math.max(22, Math.min(h - 22, n.y));
    };
    const edges = con.flatMap((k) => k.incidents.map((i) => ({ source: k.id, target: i })));
    const sim = d3
      .forceSimulation([...inc, ...con])
      .force("link", d3.forceLink(edges).id((d) => d.id).distance(70).strength(0.7))
      .force("charge", d3.forceManyBody().strength((d) => (d.kindOf === "concept" ? -420 : -140)))
      .force("collide", d3.forceCollide((d) => (d.kindOf === "concept" ? d.w / 2 + 6 : 16)))
      // a dropped node gets its own anchor, so it stays near where it was let go
      .force("x", d3.forceX((d) => d.ax ?? box.w / 2).strength((d) => (d.ax != null ? 0.5 : 0.06)))
      .force("y", d3.forceY((d) => d.ay ?? h / 2).strength((d) => (d.ay != null ? 0.5 : 0.1)))
      .force("inside", () => sim.nodes().forEach(inside))
      .alphaDecay(0.04)
      .velocityDecay(0.35)
      .stop();
    for (let i = 0; i < 400; i++) sim.tick();
    const step = Math.min(56, (box.w - 40) / Math.max(1, lonely.length));
    const loose = lonely.map((n, i) => ({ ...n, kindOf: "incident", x: 20 + step * (i + 0.5), y: box.h - 26 }));
    const nodes = [...inc, ...loose];
    return { sim, con, nodes, edges, bottom, byId: new Map(nodes.map((n) => [n.id, n])) };
  }, [box, model, concepts]);

  useEffect(() => {
    if (!layout) return;
    layout.sim.on("tick", () => setTick((t) => t + 1));
    return () => layout.sim.stop().on("tick", null);
  }, [layout]);

  function pointer(e) {
    const r = svgRef.current.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }
  function onPointerDown(e, n) {
    if (!n.live) return;
    e.preventDefault(); // no text selection while dragging
    e.currentTarget.setPointerCapture(e.pointerId);
    const [px, py] = pointer(e);
    dragRef.current = { n, px, py, sx: n.x, sy: n.y, moved: false };
    n.fx = n.x;
    n.fy = n.y;
    layout.sim.alphaTarget(0.25).restart();
  }
  function onPointerMove(e) {
    const d = dragRef.current;
    if (!d) return;
    const [mx, my] = pointer(e);
    if (Math.hypot(mx - d.px, my - d.py) > 3) d.moved = true;
    d.n.fx = d.sx + (mx - d.px) * RESIST;
    d.n.fy = d.sy + (my - d.py) * RESIST;
  }
  // let go: the springs decide where it ends up. A press without a drag is a click.
  function onPointerUp(n) {
    const d = dragRef.current;
    dragRef.current = null;
    if (n.live) {
      if (d?.moved) {
        // settle most of the way to the drop, the springs take back the rest
        n.ax = d.sx + (n.fx - d.sx) * 0.75;
        n.ay = d.sy + (n.fy - d.sy) * 0.75;
        layout.sim.force("x").x(layout.sim.force("x").x()); // re-read the anchors
        layout.sim.force("y").y(layout.sim.force("y").y());
        layout.sim.force("x").strength(layout.sim.force("x").strength());
        layout.sim.force("y").strength(layout.sim.force("y").strength());
      }
      n.fx = null;
      n.fy = null;
      layout.sim.alphaTarget(0).alpha(0.3).restart();
    }
    if (n.kindOf === "incident" && !d?.moved) f.toggle(n.id);
  }

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
    <div ref={ref} className="relative h-full w-full select-none overflow-hidden">
      {layout && (
        <svg ref={svgRef} width={box.w} height={box.h} onClick={(e) => e.target.tagName === "svg" && f.clear()}>
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
                className="cursor-grab touch-none active:cursor-grabbing"
                onMouseEnter={() => setConcept(k.id)}
                onMouseLeave={() => setConcept(null)}
                onPointerDown={(e) => onPointerDown(e, k)}
                onPointerMove={onPointerMove}
                onPointerUp={() => onPointerUp(k)}
                onPointerCancel={() => onPointerUp(k)}
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
                className={`cursor-pointer ${n.live ? "touch-none" : ""}`}
                tabIndex={0}
                role="button"
                aria-label={`${n.incident_id} on ${n.service}`}
                onMouseEnter={() => f.enter(n.id)}
                onMouseLeave={f.leave}
                onFocus={() => f.enter(n.id)}
                onBlur={f.leave}
                onPointerDown={(e) => onPointerDown(e, n)}
                onPointerMove={onPointerMove}
                onPointerUp={() => onPointerUp(n)}
                onPointerCancel={() => onPointerUp(n)}
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
