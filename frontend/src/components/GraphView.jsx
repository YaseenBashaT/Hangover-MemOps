import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { sevColor } from "../api.js";

function radiusFor(n) {
  if (n.node_kind !== "incident") return 4.5;
  return { critical: 13, high: 11, medium: 9, low: 8 }[n.severity] || 8;
}
function fillFor(n) {
  return n.node_kind === "incident" ? sevColor(n.severity) : "#4b5563";
}

/**
 * Force-directed D3 graph of the real Cognee incident graph.
 * Incident nodes are colored by severity and clickable; entity nodes are
 * neutral gray. `highlightIds` (incident_ids) render brighter + larger with a
 * pulsing halo and thicker green edges — the "memory got stronger" effect.
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
    svg.call(
      d3.zoom().scaleExtent([0.2, 4]).on("zoom", (e) => container.attr("transform", e.transform))
    );

    const nodes = data.nodes.map((d) => ({ ...d }));
    const idset = new Set(nodes.map((n) => n.id));
    const links = data.links
      .map((d) => ({ ...d }))
      .filter((l) => idset.has(l.source.id || l.source) && idset.has(l.target.id || l.target));

    const sim = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3
          .forceLink(links)
          .id((d) => d.id)
          .distance((l) => (l.source.node_kind === "incident" && l.target.node_kind === "incident" ? 90 : 45))
          .strength(0.35)
      )
      .force("charge", d3.forceManyBody().strength(-90))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius((d) => radiusFor(d) + 3));

    const edgeHi = (l) => isHi(l.source) || isHi(l.target);

    const link = container
      .append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", (l) => (edgeHi(l) ? "#4ade80" : "#334155"))
      .attr("stroke-opacity", (l) => (edgeHi(l) ? 0.9 : 0.5))
      .attr("stroke-width", (l) => (edgeHi(l) ? 2.5 : 1));

    // pulsing halos behind highlighted incident nodes
    const halo = container
      .append("g")
      .selectAll("circle")
      .data(nodes.filter(isHi))
      .join("circle")
      .attr("r", (d) => radiusFor(d) + 10)
      .attr("fill", "none")
      .attr("stroke", "#4ade80")
      .attr("stroke-width", 2)
      .attr("class", "graph-halo");

    const node = container
      .append("g")
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", (d) => radiusFor(d) + (isHi(d) ? 5 : 0))
      .attr("fill", fillFor)
      .attr("stroke", (d) =>
        isHi(d) ? "#4ade80" : d.node_kind === "incident" ? "#0b1020" : "#1f2937"
      )
      .attr("stroke-width", (d) => (isHi(d) ? 3 : d.node_kind === "incident" ? 2 : 1))
      .attr("cursor", (d) => (d.node_kind === "incident" ? "pointer" : "grab"))
      .attr("opacity", (d) => (d.node_kind === "incident" ? 1 : isHi(d) ? 1 : 0.72));

    node
      .on("mouseenter", function (event, d) {
        d3.select(this).attr("stroke", "#ffffff").attr("stroke-width", 3);
        link.attr("stroke", (l) =>
          l.source.id === d.id || l.target.id === d.id ? "#93c5fd" : edgeHi(l) ? "#4ade80" : "#334155"
        );
      })
      .on("mousemove", function (event, d) {
        const [mx, my] = d3.pointer(event, wrap);
        setTip({ x: mx, y: my, node: d });
      })
      .on("mouseleave", function (event, d) {
        d3.select(this)
          .attr("stroke", isHi(d) ? "#4ade80" : d.node_kind === "incident" ? "#0b1020" : "#1f2937")
          .attr("stroke-width", isHi(d) ? 3 : d.node_kind === "incident" ? 2 : 1);
        link.attr("stroke", (l) => (edgeHi(l) ? "#4ade80" : "#334155"));
        setTip(null);
      })
      .on("click", function (event, d) {
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

    const label = container
      .append("g")
      .selectAll("text")
      .data(nodes.filter((n) => n.node_kind === "incident"))
      .join("text")
      .text((d) => d.incident_id)
      .attr("font-size", (d) => (isHi(d) ? 9 : 8))
      .attr("font-weight", (d) => (isHi(d) ? 700 : 400))
      .attr("font-family", "ui-monospace, monospace")
      .attr("fill", (d) => (isHi(d) ? "#bbf7d0" : "#cbd5e1"))
      .attr("text-anchor", "middle")
      .attr("dy", (d) => -radiusFor(d) - (isHi(d) ? 9 : 4))
      .attr("pointer-events", "none");

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
      <svg ref={svgRef} className="h-full w-full" />
      {tip && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-edge bg-panel/95 px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: tip.x + 12, top: tip.y + 12, maxWidth: 240 }}
        >
          {tip.node.node_kind === "incident" ? (
            <div>
              <div className="font-semibold text-white">{tip.node.incident_id}</div>
              <div className="text-gray-400">{tip.node.service}</div>
              <div className="mt-0.5 flex items-center gap-1">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: sevColor(tip.node.severity) }}
                />
                <span className="capitalize text-gray-300">{tip.node.severity}</span>
              </div>
              <div className="mt-1 text-[10px] text-gray-500">click to open detail</div>
            </div>
          ) : (
            <div>
              <div className="text-gray-300">{tip.node.label}</div>
              <div className="text-[10px] uppercase tracking-wide text-gray-500">
                {tip.node.type}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
