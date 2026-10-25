import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { humanize, sevColor } from "../api.js";

const EDGE = "#C9CDC4";
const EDGE_HOT = "#0F6E6E";
const ENTITY = "#B4B9BF";

function radiusFor(n) {
  if (n.node_kind !== "incident") return 3;
  return { critical: 11, high: 9.5, medium: 8.5, low: 7.5 }[n.severity] || 7.5;
}

/**
 * Force-directed D3 graph of the real Cognee incident graph.
 * Incidents are the subject: colored by severity, labeled and clickable.
 * Entities (services, errors, fixes, people) stay small and grey until you
 * hover an incident, which lights up everything it is linked to.
 * `highlightIds` marks incidents MemOps just re-learned with a pulsing ring.
 */
export default function GraphView({ data, onIncidentClick, highlightIds = [] }) {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const [tip, setTip] = useState(null);

  useEffect(() => {
    if (!data || !data.nodes || !svgRef.current || !wrapRef.current) return;

    const hi = new Set(highlightIds || []);
    const isHi = (n) => n.node_kind === "incident" && hi.has(n.incident_id);

    const wrap = wrapRef.current;
    const width = wrap.clientWidth || 800;
    const height = wrap.clientHeight || 600;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("viewBox", [0, 0, width, height]);

    const container = svg.append("g");
    svg.call(d3.zoom().scaleExtent([0.3, 4]).on("zoom", (e) => container.attr("transform", e.transform)));

    const nodes = data.nodes.map((d) => ({ ...d }));
    const idset = new Set(nodes.map((n) => n.id));
    const links = data.links
      .map((d) => ({ ...d }))
      .filter((l) => idset.has(l.source.id || l.source) && idset.has(l.target.id || l.target));

    const sim = d3
      .forceSimulation(nodes)
      .force("link", d3.forceLink(links).id((d) => d.id).distance(40).strength(0.3))
      .force("charge", d3.forceManyBody().strength((d) => (d.node_kind === "incident" ? -260 : -40)))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("x", d3.forceX(width / 2).strength(0.04))
      .force("y", d3.forceY(height / 2).strength(0.06))
      // incidents get extra room so their labels don't sit on each other
      .force("collide", d3.forceCollide().radius((d) => (d.node_kind === "incident" ? radiusFor(d) + 20 : 5)));

    const neighbors = new Map(nodes.map((n) => [n.id, new Set([n.id])]));
    links.forEach((l) => {
      const s = l.source.id || l.source;
      const t = l.target.id || l.target;
      neighbors.get(s)?.add(t);
      neighbors.get(t)?.add(s);
    });

    const link = container
      .append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", EDGE)
      .attr("stroke-width", 1);

    const halo = container
      .append("g")
      .selectAll("circle")
      .data(nodes.filter(isHi))
      .join("circle")
      .attr("r", (d) => radiusFor(d) + 9)
      .attr("fill", "none")
      .attr("stroke", EDGE_HOT)
      .attr("stroke-width", 2.5)
      .attr("class", "graph-halo");

    const node = container
      .append("g")
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", radiusFor)
      .attr("fill", (d) => (d.node_kind === "incident" ? sevColor(d.severity) : ENTITY))
      .attr("stroke", (d) => (d.node_kind === "incident" ? "#FBFBF9" : "none"))
      .attr("stroke-width", 2)
      .attr("cursor", (d) => (d.node_kind === "incident" ? "pointer" : "default"));

    const label = container
      .append("g")
      .selectAll("text")
      .data(nodes.filter((n) => n.node_kind === "incident"))
      .join("text")
      .text((d) => d.incident_id)
      .attr("font-size", 11)
      .attr("font-family", '"Public Sans", sans-serif')
      .attr("font-weight", (d) => (isHi(d) ? 700 : 400))
      .attr("fill", "#3A404A")
      .attr("stroke", "#F3F4F1")
      .attr("stroke-width", 3)
      .attr("paint-order", "stroke")
      .attr("text-anchor", "middle")
      .attr("dy", (d) => radiusFor(d) + 13)
      .attr("pointer-events", "none");

    function focus(d) {
      const near = neighbors.get(d.id);
      node.attr("opacity", (n) => (near.has(n.id) ? 1 : 0.15));
      label.attr("opacity", (n) => (near.has(n.id) ? 1 : 0.15));
      link
        .attr("stroke", (l) => (l.source.id === d.id || l.target.id === d.id ? EDGE_HOT : EDGE))
        .attr("stroke-width", (l) => (l.source.id === d.id || l.target.id === d.id ? 1.6 : 1))
        .attr("opacity", (l) => (l.source.id === d.id || l.target.id === d.id ? 1 : 0.15));
    }
    function unfocus() {
      node.attr("opacity", 1);
      label.attr("opacity", 1);
      link.attr("stroke", EDGE).attr("stroke-width", 1).attr("opacity", 1);
    }

    node
      .on("mouseenter", (event, d) => focus(d))
      .on("mousemove", (event, d) => {
        const [mx, my] = d3.pointer(event, wrap);
        setTip({ x: mx, y: my, node: d });
      })
      .on("mouseleave", () => {
        unfocus();
        setTip(null);
      })
      .on("click", (event, d) => {
        if (d.node_kind === "incident" && d.incident_id) onIncidentClick?.(d.incident_id);
      })
      .call(
        d3
          .drag()
          .on("start", (event, d) => {
            if (!event.active) sim.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) sim.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    sim.on("tick", () => {
      link
        .attr("x1", (d) => d.source.x)
        .attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x)
        .attr("y2", (d) => d.target.y);
      node.attr("cx", (d) => d.x).attr("cy", (d) => d.y);
      halo.attr("cx", (d) => d.x).attr("cy", (d) => d.y);
      label.attr("x", (d) => d.x).attr("y", (d) => d.y);
    });

    return () => sim.stop();
  }, [data, onIncidentClick, highlightIds]);

  return (
    <div ref={wrapRef} className="relative h-full w-full">
      <svg ref={svgRef} className="h-full w-full" role="img" aria-label="Graph of incidents and the services, errors and fixes that link them" />
      {tip && (
        <div
          className="pointer-events-none absolute z-10 max-w-[16rem] rounded-md border border-rule bg-white px-3 py-2 text-sm shadow-md"
          style={{ left: tip.x + 14, top: tip.y + 14 }}
        >
          {tip.node.node_kind === "incident" ? (
            <>
              <div className="font-bold">{tip.node.incident_id}</div>
              <div className="text-muted">{tip.node.service}</div>
              <div className="mt-1 text-xs text-muted">Click to open</div>
            </>
          ) : (
            <>
              <div>{tip.node.label}</div>
              <div className="text-xs text-muted">{humanize(tip.node.type)}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
