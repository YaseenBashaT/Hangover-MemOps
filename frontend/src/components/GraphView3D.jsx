import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D from "react-force-graph-3d";
import SpriteText from "three-spritetext";
import { sevColor } from "../api.js";

const EDGE = "#CDD1C8";
const EDGE_HOT = "#0F6E6E";
const ENTITY = "#AEB3B9";
const FADED = "#E2E4DF";
const SEV_VAL = { critical: 9, high: 6.5, medium: 5, low: 4 };

/**
 * 3D version of the memory map (three.js via react-force-graph-3d).
 * Same data and behavior as GraphView: incidents are labeled spheres colored
 * by severity, shared details are small grey dots, hovering an incident
 * lights up its links, clicking one flies to it and opens it.
 */
export default function GraphView3D({ data, onIncidentClick, highlightIds = [] }) {
  const wrapRef = useRef(null);
  const fgRef = useRef(null);
  const labels = useRef(new Map());
  const fitted = useRef(false);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [hover, setHover] = useState(null);

  const hi = useMemo(() => new Set(highlightIds), [highlightIds]);
  const graph = useMemo(
    () => ({
      nodes: data.nodes.map((n) => ({ ...n })),
      links: data.links.map((l) => ({ source: l.source, target: l.target })),
    }),
    [data]
  );
  const neighbors = useMemo(() => {
    const m = new Map(graph.nodes.map((n) => [n.id, new Set([n.id])]));
    graph.links.forEach((l) => {
      const s = l.source.id ?? l.source;
      const t = l.target.id ?? l.target;
      m.get(s)?.add(t);
      m.get(t)?.add(s);
    });
    return m;
  }, [graph]);

  useEffect(() => {
    const el = wrapRef.current;
    const ro = new ResizeObserver(([e]) =>
      setSize({ width: e.contentRect.width, height: e.contentRect.height })
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Turn slowly until the visitor grabs it; never for reduced-motion users.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const controls = fg.controls();
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    controls.autoRotate = !still;
    controls.autoRotateSpeed = 0.5;
    // Pull the graph in tighter than the library default, so the incidents
    // are big enough to read once it zooms to fit.
    fg.d3Force("charge").strength((n) => (n.node_kind === "incident" ? -60 : -12));
    fg.d3Force("link").distance(14);
    fg.d3ReheatSimulation();
    const fit = setTimeout(() => fg.zoomToFit(600, 10), 1200);
    const stop = () => (controls.autoRotate = false);
    controls.addEventListener("start", stop);
    return () => {
      clearTimeout(fit);
      controls.removeEventListener("start", stop);
    };
  }, []);

  // Fade the labels of everything not linked to the hovered incident.
  useEffect(() => {
    const near = hover ? neighbors.get(hover.id) : null;
    labels.current.forEach((sprite, id) => {
      sprite.material.opacity = !near || near.has(id) ? 1 : 0.15;
    });
  }, [hover, neighbors]);

  const near = hover ? neighbors.get(hover.id) : null;
  const touches = (l) => hover && ((l.source.id ?? l.source) === hover.id || (l.target.id ?? l.target) === hover.id);

  function openIncident(node) {
    if (node.node_kind !== "incident") return;
    const fg = fgRef.current;
    const dist = 60;
    const r = Math.hypot(node.x, node.y, node.z) || 1;
    const k = 1 + dist / r;
    fg.cameraPosition({ x: node.x * k, y: node.y * k, z: node.z * k }, node, 800);
    setTimeout(() => onIncidentClick?.(node.incident_id), 850);
  }

  return (
    <div ref={wrapRef} className="h-full w-full" style={{ cursor: hover?.node_kind === "incident" ? "pointer" : "grab" }}>
      <ForceGraph3D
        ref={fgRef}
        width={size.width}
        height={size.height}
        graphData={graph}
        backgroundColor="#FBFBF9"
        controlType="orbit"
        showNavInfo={false}
        nodeRelSize={4.5}
        nodeVal={(n) => (n.node_kind === "incident" ? SEV_VAL[n.severity] || 4 : 0.12) * (hi.has(n.incident_id) ? 1.8 : 1)}
        nodeColor={(n) => {
          if (near && !near.has(n.id)) return FADED;
          if (n.node_kind !== "incident") return ENTITY;
          return hi.has(n.incident_id) ? EDGE_HOT : sevColor(n.severity);
        }}
        nodeOpacity={1}
        nodeResolution={16}
        nodeLabel={(n) => (n.node_kind === "incident" ? `${n.incident_id}, ${n.service}` : n.label)}
        nodeThreeObjectExtend
        nodeThreeObject={(n) => {
          if (n.node_kind !== "incident") return null;
          const t = new SpriteText(n.incident_id, 5.5, hi.has(n.incident_id) ? EDGE_HOT : "#3A404A");
          t.fontFace = "Public Sans, sans-serif";
          t.fontWeight = hi.has(n.incident_id) ? "700" : "400";
          t.material.depthWrite = false;
          t.material.transparent = true;
          t.position.y = -(Math.cbrt(SEV_VAL[n.severity] || 4) * 4.5 + 6);
          labels.current.set(n.id, t);
          return t;
        }}
        linkColor={(l) => (touches(l) ? EDGE_HOT : near ? FADED : EDGE)}
        linkWidth={(l) => (touches(l) ? 0.6 : 0)}
        linkOpacity={0.55}
        onNodeHover={(n) => setHover(n && n.node_kind === "incident" ? n : null)}
        onNodeClick={openIncident}
        warmupTicks={90}
        cooldownTicks={40}
        onEngineStop={() => {
          if (!fitted.current) {
            fitted.current = true;
            fgRef.current?.zoomToFit(600, 10);
          }
        }}
      />
    </div>
  );
}
