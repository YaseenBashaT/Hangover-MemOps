import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { fmtDate, humanize, sevColor } from "../api.js";
import { buildModel } from "./mapModel.js";

const NODE_R = { critical: 12, high: 11, medium: 10, low: 9 };
// colors are theme variables from index.css, set through style so they follow the theme
const c = (name) => `rgb(var(--${name}))`;
const LINK = c("map-link");
const LINK_HOT = c("map-link-hot");
// soft island colors, kept away from the severity reds/ambers/greens
const ISLANDS = [0, 1, 2, 3, 4, 5, 6].map((i) => c(`island-${i}`));
const NARROW = 640;
const PAD = 24; // how far an island reaches past its dots

/**
 * The memory map as a little physics toy. Each service is an island and its
 * incidents float on it, pulled toward the island's centre. A line joins two
 * incidents that share details in the Cognee graph (an error, a fix, a ticket,
 * an engineer), and those lines are weak springs: drag a dot and the islands
 * stretch, incidents it shares details with get tugged along, and the dot
 * settles partway between where it was and where it was dropped.
 *
 * Answers: which services keep having incidents, and which incidents belong
 * together? Good as a first look at the whole memory.
 */

// Where each island sits. Wide screens pack them into the box; phones stack
// them down the page and the map grows taller instead.
function placeIslands(services, width, height) {
  const radius = (n) => Math.sqrt(n) * 24 + 22;
  if (width < NARROW) {
    let y = 46;
    const anchors = services.map((s, k) => {
      const r = radius(s.items.length);
      const x = width / 2 + (k % 2 ? 1 : -1) * Math.min(40, width / 2 - r - 12);
      const a = { name: s.name, x, y: y + r, r, color: ISLANDS[k % ISLANDS.length] };
      y += 2 * r + 58;
      return a;
    });
    return { anchors, height: y, fit: { k: 1, x: 0, y: 0 } };
  }
  // the extra 26px leaves room for the island's name above it
  const circles = services.map((s) => ({ name: s.name, r: radius(s.items.length) + 26 }));
  d3.packSiblings(circles);
  const stretch = Math.min(width / height, 1.7);
  circles.forEach((c) => (c.x *= stretch));
  const x0 = d3.min(circles, (c) => c.x - c.r);
  const x1 = d3.max(circles, (c) => c.x + c.r);
  const y0 = d3.min(circles, (c) => c.y - c.r);
  const y1 = d3.max(circles, (c) => c.y + c.r);
  const k = Math.min((width - 24) / (x1 - x0), (height - 24) / (y1 - y0), 1.7);
  const fit = { k, x: (width - k * (x1 - x0)) / 2 - k * x0, y: (height - k * (y1 - y0)) / 2 - k * y0 };
  const anchors = circles.map((c, k) => ({ name: c.name, x: c.x, y: c.y + 8, r: c.r - 26, color: ISLANDS[k % ISLANDS.length] }));
  return { anchors, height, fit };
}

// A rounded outline around an island's dots: ring every dot with points, hull
// them and draw the hull as a smooth closed curve.
const blobLine = d3.line().curve(d3.curveCatmullRomClosed.alpha(0.6));
function islandShape(members) {
  const pts = [];
  for (const m of members)
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * 2 * Math.PI;
      pts.push([m.x + (m.r + PAD) * Math.cos(a), m.y + (m.r + PAD) * Math.sin(a)]);
    }
  const hull = d3.polygonHull(pts);
  return { d: blobLine(hull), top: d3.min(hull, (p) => p[1]), cx: d3.mean(members, (m) => m.x) };
}

export default function GraphView({ data, meta, onIncidentClick, highlightIds = [], shownIds = null, latestId = null }) {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const simRef = useRef(null);
  const nodesRef = useRef(new Map()); // id -> the simulation's node object, kept across replays
  const dragRef = useRef(null);
  const [size, setSize] = useState(null);
  const [zoom, setZoom] = useState(d3.zoomIdentity);
  const [, setTick] = useState(0);
  const [hover, setHover] = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const model = useMemo(() => buildModel(data), [data]);
  const place = useMemo(() => (size ? placeIslands(model.services, size.w, size.h) : null), [model, size]);
  const narrow = size ? size.w < NARROW : false;

  // Zoom and pan on wide screens only (a phone needs its touch to scroll the
  // page). Gestures that start on a dot drag the dot instead.
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    if (narrow) {
      svg.on(".zoom", null);
      setZoom(d3.zoomIdentity);
      return;
    }
    svg.call(
      d3
        .zoom()
        .scaleExtent([0.5, 3])
        .filter((e) => !e.target.closest?.("[data-node]") && (!e.ctrlKey || e.type === "wheel") && !e.button)
        .on("zoom", (e) => setZoom(e.transform))
    );
  }, [narrow]);

  // A dot's resting spot is its island's centre plus wherever it has been
  // dragged to (ox, oy), so moved dots stay moved after a resize or a replay.
  const targetX = (n) => n.home.x + (n.ox || 0);
  const targetY = (n) => n.home.y + (n.oy || 0);

  // The simulation: dots are pulled to their island, pushed off each other,
  // and weakly sprung to the incidents they share details with.
  useEffect(() => {
    if (!place) return;
    const anchor = new Map(place.anchors.map((a) => [a.name, a]));
    const visible = model.incidents.filter((i) => !shownIds || shownIds.has(i.id));
    const nodes = visible.map((inc) => {
      let n = nodesRef.current.get(inc.id);
      const home = anchor.get(inc.service || "unknown");
      if (!n) {
        // new dots appear at their island's centre and burst out from there
        n = { x: home.x + (Math.random() - 0.5) * 6, y: home.y + (Math.random() - 0.5) * 6 };
        nodesRef.current.set(inc.id, n);
      }
      return Object.assign(n, inc, { r: NODE_R[inc.severity] || 8, home });
    });
    const ids = new Set(nodes.map((n) => n.id));
    const links = model.links
      .filter((l) => ids.has(l.a) && ids.has(l.b))
      .map((l) => ({ ...l, source: l.a, target: l.b }));

    const sim = (simRef.current ||= d3.forceSimulation().alphaDecay(0.03).velocityDecay(0.32));
    sim
      .nodes(nodes)
      .force("x", d3.forceX(targetX).strength(0.14))
      .force("y", d3.forceY(targetY).strength(0.14))
      .force("collide", d3.forceCollide((n) => n.r + 9).strength(0.9).iterations(2))
      .force(
        "link",
        d3
          .forceLink(links)
          .id((n) => n.id)
          .distance((l) => (l.source.service === l.target.service ? 40 : 160))
          .strength((l) => (l.source.service === l.target.service ? 0.12 : 0.012))
      )
      .on("tick", () => setTick((t) => t + 1))
      .alpha(shownIds ? 0.6 : 1)
      .restart();
    return () => sim.stop();
  }, [model, place, shownIds]);

  useEffect(() => () => simRef.current?.stop(), []);

  if (!size || !place) return <div ref={wrapRef} className="h-full w-full" />;

  const nodes = [...(simRef.current?.nodes() || [])];
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const links = model.links.filter((l) => nodeById.has(l.a) && nodeById.has(l.b));
  const focus = selected && nodeById.has(selected) ? selected : hover;
  const near = new Set(focus ? [focus] : []);
  links.forEach((l) => {
    if (l.a === focus) near.add(l.b);
    if (l.b === focus) near.add(l.a);
  });
  const hi = new Set(highlightIds);
  const islands = place.anchors
    .map((a) => ({ a, members: nodes.filter((n) => n.home === a) }))
    .filter((i) => i.members.length)
    .map((i) => ({ ...i, s: islandShape(i.members), lit: i.members.some((m) => near.has(m.id)) }));
  const showAllLabels = zoom.k * place.fit.k >= 1.45;

  // screen point -> map point, undoing both the zoom and the fit
  function toMap(e) {
    const box = svgRef.current.getBoundingClientRect();
    const [zx, zy] = zoom.invert([e.clientX - box.left, e.clientY - box.top]);
    return [(zx - place.fit.x) / place.fit.k, (zy - place.fit.y) / place.fit.k];
  }
  function toScreen(n) {
    return zoom.apply([place.fit.x + place.fit.k * n.x, place.fit.y + place.fit.k * n.y]);
  }

  function onPointerDown(e, n) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { id: n.id, x: e.clientX, y: e.clientY, sx: n.x, sy: n.y, moved: false };
    n.fx = n.x;
    n.fy = n.y;
  }
  function onPointerMove(e, n) {
    const d = dragRef.current;
    if (!d || d.id !== n.id) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) d.moved = true;
    if (!d.moved) return;
    // the dot resists: it only covers about two thirds of the way to the pointer
    const [mx, my] = toMap(e);
    n.fx = d.sx + (mx - d.sx) * 0.7;
    n.fy = d.sy + (my - d.sy) * 0.7;
    simRef.current.alphaTarget(0.3).restart();
  }
  function onPointerUp(e, n) {
    const d = dragRef.current;
    dragRef.current = null;
    if (d?.moved) {
      // let go and it settles most of the way to where it was dropped
      n.ox = (n.ox || 0) + (n.fx - targetX(n)) * 0.75;
      n.oy = (n.oy || 0) + (n.fy - targetY(n)) * 0.75;
      simRef.current.force("x").x(targetX);
      simRef.current.force("y").y(targetY);
    }
    n.fx = n.fy = null;
    simRef.current.alphaTarget(0).alpha(0.3).restart();
    if (d && !d.moved) setSelected((s) => (s === n.id ? null : n.id));
  }

  function linkPath(l, hot) {
    let a = nodeById.get(l.a);
    let b = nodeById.get(l.b);
    if (hot && l.b === focus) [a, b] = [b, a]; // signals flow out of the focused dot
    const between = a.service !== b.service;
    const bend = between ? 0.14 : 0;
    const mx = (a.x + b.x) / 2 + (b.y - a.y) * bend;
    const my = (a.y + b.y) / 2 - (b.x - a.x) * bend;
    return (
      <path
        key={`${l.a}-${l.b}${hot ? "-hot" : ""}`}
        d={`M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`}
        fill="none"
        style={{ stroke: hot ? LINK_HOT : LINK }}
        strokeWidth={hot ? 2 + l.shared.length * 0.5 : 1 + l.shared.length * 0.35}
        strokeLinecap="round"
        strokeDasharray={hot ? "2 9" : between ? "3 5" : undefined}
        className={hot ? "graph-flow" : undefined}
        opacity={hot ? 1 : focus ? 0.18 : between ? 0.7 : 0.9}
      />
    );
  }

  const sel = selected && nodeById.get(selected);
  const card = sel || (hover && nodeById.get(hover));
  const cardShares = card
    ? links
        .filter((l) => l.a === card.id || l.b === card.id)
        .map((l) => ({ other: nodeById.get(l.a === card.id ? l.b : l.a), shared: l.shared }))
    : [];
  const info = card && meta?.get(card.incident_id);
  const at = card && toScreen(card);
  const cardStyle =
    card && !narrow
      ? {
          left: Math.max(8, Math.min(at[0] + 28, size.w - 312)),
          top: Math.max(8, Math.min(at[1] - 20, size.h - 260)),
        }
      : undefined;

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full select-none"
      style={narrow ? { height: place.height } : undefined}
    >
      <svg
        ref={svgRef}
        className={`h-full w-full ${narrow ? "" : "touch-none cursor-grab active:cursor-grabbing"}`}
        role="img"
        aria-label="Incidents floating on islands, one per service, with lines between incidents that share details"
        onClick={(e) => e.target === svgRef.current && setSelected(null)}
      >
        <g transform={zoom.toString()}>
          <g transform={`translate(${place.fit.x},${place.fit.y}) scale(${place.fit.k})`}>
            {islands.map(({ a, s, lit }) => (
              <path
                key={a.name}
                d={s.d}
                style={{ fill: a.color, stroke: c(lit ? "map-shore-lit" : "map-shore") }}
                strokeWidth={lit ? 1.5 : 1}
                onClick={() => setSelected(null)}
              />
            ))}
            {/* names go over every island, since a stretched island can reach a neighbour's name */}
            {islands.map(({ a, s, members }) => (
              <text
                key={a.name}
                x={s.cx}
                y={s.top - 9}
                textAnchor="middle"
                fontSize={13}
                fontWeight={700}
                style={{ fill: c("ink"), stroke: c("paper") }}
                strokeWidth={4}
                paintOrder="stroke"
                className="pointer-events-none"
              >
                {a.name}
                <tspan style={{ fill: c("faint") }} fontWeight={400}>
                  {"  "}
                  {members.length}
                </tspan>
              </text>
            ))}

            {links.filter((l) => l.a !== focus && l.b !== focus).map((l) => linkPath(l, false))}
            {focus && links.filter((l) => l.a === focus || l.b === focus).map((l) => linkPath(l, true))}

            {nodes.map((n) => {
              const faded = focus && !near.has(n.id);
              // neighbours stay unlabelled: they sit close together and the card names them
              const label = showAllLabels || n.id === focus || n.id === latestId || hi.has(n.incident_id);
              return (
                <g
                  key={n.id}
                  data-node
                  transform={`translate(${n.x},${n.y})`}
                  opacity={faded ? 0.3 : 1}
                  className="cursor-pointer touch-none"
                  tabIndex={0}
                  role="button"
                  aria-label={`${n.incident_id} on ${n.service}`}
                  aria-pressed={selected === n.id}
                  onPointerDown={(e) => onPointerDown(e, n)}
                  onPointerMove={(e) => onPointerMove(e, n)}
                  onPointerUp={(e) => onPointerUp(e, n)}
                  onPointerCancel={(e) => onPointerUp(e, n)}
                  onMouseEnter={() => setHover(n.id)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(n.id)}
                  onBlur={() => setHover(null)}
                  onKeyDown={(e) => e.key === "Enter" && setSelected((s) => (s === n.id ? null : n.id))}
                >
                  <g className="graph-pop">
                    {(hi.has(n.incident_id) || n.id === latestId) && (
                      <circle r={n.r + 8} fill="none" style={{ stroke: LINK_HOT }} strokeWidth={2.5} className="graph-halo" />
                    )}
                    {selected === n.id && <circle r={n.r + 5} fill="none" style={{ stroke: c("ink") }} strokeWidth={2} />}
                    <circle r={n.r + 5} style={{ fill: sevColor(n.severity) }} opacity={0.18} />
                    <circle r={n.r} style={{ fill: sevColor(n.severity), stroke: c("map-rim") }} strokeWidth={2} />
                    {label && (
                      <text
                        y={n.r + 17}
                        textAnchor="middle"
                        fontSize={11}
                        style={{ fill: c("ink"), stroke: c("paper") }}
                        strokeWidth={3}
                        paintOrder="stroke"
                      >
                        {n.incident_id.replace(/^INC-/, "")}
                      </text>
                    )}
                  </g>
                </g>
              );
            })}
          </g>
        </g>
      </svg>

      {card && (
        <div
          className={
            narrow
              ? "fixed inset-x-3 bottom-3 z-20 border border-rule bg-sheet px-3 py-2.5 text-sm shadow-md"
              : `absolute z-10 w-[19rem] border border-rule bg-sheet px-3 py-2.5 text-sm shadow-md ${sel ? "" : "pointer-events-none"}`
          }
          style={cardStyle}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-bold">{card.incident_id}</span>
            <span className="text-xs capitalize" style={{ color: sevColor(card.severity) }}>
              {card.severity}
            </span>
          </div>
          {info && <div className="mt-0.5">{humanize(info.alert_name)}</div>}
          <div className="text-muted">
            {card.service}
            {info?.timestamp && ` · ${fmtDate(info.timestamp)}`}
          </div>
          {cardShares.length > 0 ? (
            <ul className="mt-2 max-h-40 space-y-1 overflow-auto border-t border-rule pt-2">
              {cardShares.map(({ other, shared }) => (
                <li key={other.id}>
                  Shares <span className="font-bold">{shared.join(", ")}</span> with{" "}
                  <span className="whitespace-nowrap">{other.incident_id}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-1 text-muted">Shares no details with other incidents yet.</div>
          )}
          {sel ? (
            <div className="mt-2 flex items-center justify-between">
              <button
                className="font-bold text-accent underline-offset-4 hover:underline"
                onClick={() => onIncidentClick?.(card.incident_id)}
              >
                Open incident →
              </button>
              <button className="text-xs text-muted hover:text-ink" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
          ) : (
            <div className="mt-2 text-xs text-muted">Click to pin, drag to pull it around</div>
          )}
        </div>
      )}
    </div>
  );
}
