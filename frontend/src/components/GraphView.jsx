import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { sevColor } from "../api.js";

const NODE_R = { critical: 12, high: 11, medium: 10, low: 9 };
const LINK = "#B4C3BF";
const LINK_HOT = "#0F6E6E";

/**
 * The memory map as service bubbles. Each service gets a circle sized by how
 * many incidents it has (d3.pack, so circles never overlap), its incidents sit
 * on a ring inside it, and a line joins two incidents that share details in
 * the Cognee graph (an error, a fix, a ticket, an engineer). The ~190 detail
 * nodes themselves aren't drawn; hovering an incident lists what it shares.
 */
// Phones are too narrow to pack the services into one circle, so there they
// stack down the page at a fixed, readable size and the map grows taller.
const NARROW = 640;
const stackRadius = (count) => (count >= 4 ? 118 : count >= 2 ? 100 : 66);

function buildLayout(data, width, height) {
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  const incidents = data.nodes.filter((n) => n.node_kind === "incident");

  // incident -> the Entity nodes it links to
  const details = new Map(incidents.map((i) => [i.id, new Set()]));
  for (const l of data.links) {
    const s = l.source.id ?? l.source;
    const t = l.target.id ?? l.target;
    if (details.has(s) && byId.get(t)?.type === "Entity") details.get(s).add(t);
    if (details.has(t) && byId.get(s)?.type === "Entity") details.get(t).add(s);
  }

  const services = [...d3.group(incidents, (i) => i.service || "unknown")]
    .map(([name, items]) => ({ name, items }))
    .sort((a, b) => b.items.length - a.items.length);

  // Each circle is sized for what it holds: room for its incidents on a ring
  // and for the service name across the top.
  const radiusFor = (svc) =>
    Math.max(stackRadius(svc.items.length), svc.name.length * 3.6 + 14);

  let circles;
  let fit = { k: 1, x: 0, y: 0 };
  if (width < NARROW) {
    // phones: zig-zag down the page at full size
    let y = 12;
    circles = services.map((svc, k) => {
      const r = radiusFor(svc);
      const side = svc.items.length > 1 ? 0 : k % 2 ? 1 : -1;
      const x = width / 2 + side * Math.max(0, width / 2 - r - 8);
      const c = { data: svc, x, y: y + r, r };
      y += svc.items.length > 1 || side === 1 ? 2 * r + 14 : r * 0.9;
      return c;
    });
    height = Math.max(...circles.map((c) => c.y + c.r)) + 12;
  } else {
    circles = services.map((svc) => ({ data: svc, r: radiusFor(svc) + 9 }));
    d3.packSiblings(circles);
    circles.forEach((c) => (c.r -= 9)); // the 9px was just spacing between circles
    // pack makes a round cluster; spread it sideways to suit a wide box
    const stretch = Math.min(width / height, 1.6);
    circles.forEach((c) => (c.x *= stretch));
    const x0 = Math.min(...circles.map((c) => c.x - c.r));
    const x1 = Math.max(...circles.map((c) => c.x + c.r));
    const y0 = Math.min(...circles.map((c) => c.y - c.r));
    const y1 = Math.max(...circles.map((c) => c.y + c.r));
    const k = Math.min((width - 32) / (x1 - x0), (height - 32) / (y1 - y0), 1.3);
    fit = { k, x: (width - k * (x1 - x0)) / 2 - k * x0, y: (height - k * (y1 - y0)) / 2 - k * y0 };
  }

  const nodes = [];
  const bubbles = circles.map((b) => {
    const { items, name } = b.data;
    const ring = items.length === 1 ? 0 : Math.min(b.r * 0.5, 62);
    items.forEach((inc, k) => {
      const a = -Math.PI / 2 + (2 * Math.PI * k) / items.length;
      nodes.push({ ...inc, x: b.x + ring * Math.cos(a), y: b.y + ring * Math.sin(a) + 16 });
    });
    return { name, x: b.x, y: b.y, r: b.r, count: items.length };
  });

  const pos = new Map(nodes.map((n) => [n.id, n]));
  const links = [];
  for (let a = 0; a < nodes.length; a++)
    for (let b = a + 1; b < nodes.length; b++) {
      const shared = [...details.get(nodes[a].id)].filter((x) => details.get(nodes[b].id).has(x));
      if (shared.length) links.push({ a: nodes[a], b: nodes[b], shared: shared.map((x) => byId.get(x).label) });
    }
  return { nodes, bubbles, links, pos, height, fit };
}

export default function GraphView({ data, onIncidentClick, highlightIds = [] }) {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const [size, setSize] = useState(null);
  const [zoom, setZoom] = useState(d3.zoomIdentity);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const narrow = size ? size.w < NARROW : false;
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    if (narrow) {
      svg.on(".zoom", null);
      setZoom(d3.zoomIdentity);
      return;
    }
    svg.call(d3.zoom().scaleExtent([0.5, 3]).on("zoom", (e) => setZoom(e.transform)));
  }, [narrow]);

  const layout = useMemo(() => (size ? buildLayout(data, size.w, size.h) : null), [data, size]);
  const hi = new Set(highlightIds);

  const linked = useMemo(() => {
    if (!hover || !layout) return null;
    const s = new Set([hover.id]);
    layout.links.forEach((l) => {
      if (l.a.id === hover.id) s.add(l.b.id);
      if (l.b.id === hover.id) s.add(l.a.id);
    });
    return s;
  }, [hover, layout]);
  function linkPath(l, between, hot = false) {
    // links between services curve gently; links inside one are straight
    const bend = between ? 0.12 : 0;
    const mx = (l.a.x + l.b.x) / 2 + (l.b.y - l.a.y) * bend;
    const my = (l.a.y + l.b.y) / 2 - (l.b.x - l.a.x) * bend;
    return (
      <path
        key={`${l.a.id}-${l.b.id}${hot ? "-hot" : ""}`}
        d={`M${l.a.x},${l.a.y} Q${mx},${my} ${l.b.x},${l.b.y}`}
        fill="none"
        stroke={hot ? LINK_HOT : LINK}
        strokeWidth={hot ? 1.5 + l.shared.length * 0.5 : 1 + l.shared.length * 0.4}
        strokeLinecap="round"
        opacity={hot ? 1 : hover ? 0.25 : 0.9}
      />
    );
  }
  const sharedWith = hover && layout ? layout.links.filter((l) => l.a.id === hover.id || l.b.id === hover.id) : [];

  return (
    <div ref={wrapRef} className="relative h-full w-full" style={narrow && layout ? { height: layout.height } : undefined}>
      <svg ref={svgRef} className={`h-full w-full ${narrow ? "" : "touch-none"}`} role="img" aria-label="Incidents grouped by service, with lines between incidents that share details">
        {layout && (
          <g transform={zoom.toString()}>
           <g transform={`translate(${layout.fit.x},${layout.fit.y}) scale(${layout.fit.k})`}>
            {/* links between services run under the bubbles, so they only show in the gaps */}
            {layout.links.filter((l) => l.a.service !== l.b.service).map((l) => linkPath(l, true))}

            {layout.bubbles.map((b) => (
              <g key={b.name}>
                <circle cx={b.x} cy={b.y} r={b.r} fill="#FFFFFF" fillOpacity={0.94} stroke="#DADDD6" />
                <text x={b.x} y={b.y - b.r + 27} textAnchor="middle" fontSize={13.5} fontWeight={700} fill="#14171F">
                  {b.name}
                </text>
                <text x={b.x} y={b.y - b.r + 43} textAnchor="middle" fontSize={11.5} fill="#8E949D">
                  {b.count === 1 ? "1 incident" : `${b.count} incidents`}
                </text>
              </g>
            ))}

            {layout.links.filter((l) => l.a.service === l.b.service).map((l) => linkPath(l, false))}
            {/* the hovered incident's links go on top of everything */}
            {hover && layout.links.filter((l) => l.a.id === hover.id || l.b.id === hover.id).map((l) => linkPath(l, l.a.service !== l.b.service, true))}

            {layout.nodes.map((n) => {
              const r = NODE_R[n.severity] || 8;
              const faded = linked && !linked.has(n.id);
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x},${n.y})`}
                  opacity={faded ? 0.25 : 1}
                  className="cursor-pointer"
                  tabIndex={0}
                  role="link"
                  aria-label={`${n.incident_id} on ${n.service}`}
                  onMouseEnter={() => setHover(n)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(n)}
                  onBlur={() => setHover(null)}
                  onClick={() => onIncidentClick?.(n.incident_id)}
                  onKeyDown={(e) => e.key === "Enter" && onIncidentClick?.(n.incident_id)}
                >
                  {hi.has(n.incident_id) && (
                    <circle r={r + 7} fill="none" stroke={LINK_HOT} strokeWidth={2.5} className="graph-halo" />
                  )}
                  <circle r={r + 6} fill={sevColor(n.severity)} opacity={0.16} />
                  <circle r={r} fill={sevColor(n.severity)} stroke="#FFFFFF" strokeWidth={2} />
                  <text y={r + 19} textAnchor="middle" fontSize={11.5} fill="#5D6470" stroke="#FFFFFF" strokeWidth={3} paintOrder="stroke">
                    {n.incident_id.replace(/^INC-/, "")}
                  </text>
                </g>
              );
            })}
           </g>
          </g>
        )}
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute z-10 w-72 border border-rule bg-white px-3 py-2.5 text-sm shadow-md"
          style={{
            left: Math.max(4, Math.min(zoom.applyX(layout.fit.x + layout.fit.k * hover.x) + 16, (size?.w || 0) - 292)),
            top: zoom.applyY(layout.fit.y + layout.fit.k * hover.y) + 16,
          }}
        >
          <div className="font-bold">{hover.incident_id}</div>
          <div className="text-muted">{hover.service}</div>
          {sharedWith.length > 0 ? (
            <ul className="mt-2 space-y-1 border-t border-rule pt-2">
              {sharedWith.map((l) => {
                const other = l.a.id === hover.id ? l.b : l.a;
                return (
                  <li key={other.id}>
                    Shares <span className="font-bold">{l.shared.join(", ")}</span> with{" "}
                    <span className="whitespace-nowrap">{other.incident_id}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="mt-1 text-muted">Shares no details with other incidents yet.</div>
          )}
          <div className="mt-2 text-xs text-muted">Click to open</div>
        </div>
      )}
    </div>
  );
}
