import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { sevColor } from "../api.js";

const NODE_R = { critical: 11, high: 10, medium: 9, low: 8 };
const LINK = "#9FB3AE";
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
const stackRadius = (count) => (count >= 4 ? 112 : count >= 2 ? 92 : 62);

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

  let circles;
  if (width < NARROW) {
    // zig-zag down the page
    let y = 12;
    circles = services.map((svc, k) => {
      const r = stackRadius(svc.items.length);
      const side = svc.items.length > 1 ? 0 : k % 2 ? 1 : -1;
      const x = width / 2 + side * Math.max(0, width / 2 - r - 8);
      const c = { data: svc, x, y: y + r, r };
      y += svc.items.length > 1 || side === 1 ? 2 * r + 14 : r * 0.9;
      return c;
    });
    height = Math.max(...circles.map((c) => c.y + c.r)) + 12;
  } else {
    const root = d3.hierarchy({ children: services }).sum((d) => (d.items ? d.items.length + 1.5 : 0));
    d3.pack().size([width, height]).padding(18)(root);
    // pack fills a circle as wide as the box is tall; spread it sideways to
    // use the full width (circles only move apart, so they still can't overlap)
    const k = Math.min(width / height, 1.6);
    root.children.forEach((c) => (c.x = width / 2 + (c.x - width / 2) * k));
    circles = root.children;
  }

  const nodes = [];
  const bubbles = circles.map((b) => {
    const { items, name } = b.data;
    const ring = items.length === 1 ? 0 : b.r * 0.5;
    items.forEach((inc, k) => {
      const a = -Math.PI / 2 + (2 * Math.PI * k) / items.length;
      nodes.push({ ...inc, x: b.x + ring * Math.cos(a), y: b.y + ring * Math.sin(a) + 6 });
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
  return { nodes, bubbles, links, pos, height };
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
  const sharedWith = hover && layout ? layout.links.filter((l) => l.a.id === hover.id || l.b.id === hover.id) : [];

  return (
    <div ref={wrapRef} className="relative h-full w-full" style={narrow && layout ? { height: layout.height } : undefined}>
      <svg ref={svgRef} className={`h-full w-full ${narrow ? "" : "touch-none"}`} role="img" aria-label="Incidents grouped by service, with lines between incidents that share details">
        {layout && (
          <g transform={zoom.toString()}>
            {layout.bubbles.map((b) => (
              <g key={b.name}>
                <circle cx={b.x} cy={b.y} r={b.r} fill="#EEF0EA" stroke="#DADDD6" />
                <text x={b.x} y={b.y - b.r + 20} textAnchor="middle" fontSize={13} fontWeight={700} fill="#5D6470">
                  {b.name}
                </text>
              </g>
            ))}

            {layout.links.map((l) => {
              const hot = hover && (l.a.id === hover.id || l.b.id === hover.id);
              // bow the line a little so links inside one bubble don't cross labels
              const mx = (l.a.x + l.b.x) / 2 + (l.b.y - l.a.y) * 0.15;
              const my = (l.a.y + l.b.y) / 2 - (l.b.x - l.a.x) * 0.15;
              return (
                <path
                  key={`${l.a.id}-${l.b.id}`}
                  d={`M${l.a.x},${l.a.y} Q${mx},${my} ${l.b.x},${l.b.y}`}
                  fill="none"
                  stroke={hot ? LINK_HOT : LINK}
                  strokeWidth={hot ? 1.5 + l.shared.length : 0.8 + l.shared.length * 0.6}
                  opacity={hover && !hot ? 0.15 : 0.85}
                />
              );
            })}

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
                  <circle r={r} fill={sevColor(n.severity)} stroke="#FBFBF9" strokeWidth={2.5} />
                  <text y={r + 15} textAnchor="middle" fontSize={11.5} fill="#14171F" stroke="#EEF0EA" strokeWidth={3} paintOrder="stroke">
                    {n.incident_id.replace(/^INC-/, "")}
                  </text>
                </g>
              );
            })}
          </g>
        )}
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute z-10 w-72 border border-rule bg-white px-3 py-2.5 text-sm shadow-md"
          style={{
            left: Math.max(4, Math.min(zoom.applyX(hover.x) + 16, (size?.w || 0) - 292)),
            top: zoom.applyY(hover.y) + 16,
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
