import { sevColor } from "../api.js";

/**
 * The signature "memify moment" panel — shown after Approve Fix / resolve.
 * Slides in, glows, and shows exactly what the graph reinforced.
 */
export default function MemifyCard({ result, onOpenRelated }) {
  const g = result.graph_strengthened || {};
  return (
    <div className="animate-memify animate-glow rounded-xl border border-green-500/50 bg-green-500/10 p-5">
      <div className="flex items-center gap-2">
        <span className="text-2xl">🧠</span>
        <div>
          <div className="text-base font-semibold text-green-300">
            Memory reinforced
          </div>
          <div className="text-xs text-green-200/70">
            improve() ran — the graph just learned from this resolution
          </div>
        </div>
      </div>

      <p className="mt-3 text-sm text-green-100/90">{result.message}</p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-green-500/30 bg-ink/40 p-3">
          <div className="text-[11px] uppercase tracking-wide text-green-200/60">
            Graph nodes
          </div>
          <div className="text-lg font-semibold text-green-200">
            {g.nodes_before} → {g.nodes_after}
          </div>
        </div>
        <div className="rounded-lg border border-green-500/30 bg-ink/40 p-3">
          <div className="text-[11px] uppercase tracking-wide text-green-200/60">
            Graph edges
          </div>
          <div className="text-lg font-semibold text-green-200">
            {g.edges_before} → {g.edges_after}
          </div>
        </div>
      </div>

      <div className="mt-2 text-[11px] text-green-200/60">
        Stage: {g.stage} · enrichment {g.enrichment_ran ? "ran ✓" : "skipped"}
      </div>

      {(result.reinforced_connections || []).length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-green-200/70">
            Nodes strengthened ({result.reinforced_connections.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {result.reinforced_connections.map((c) => (
              <button
                key={c.incident_id}
                onClick={() => onOpenRelated?.(c.incident_id)}
                className="flex items-center gap-1.5 rounded-full border border-green-500/30 bg-ink/40 px-2.5 py-1 text-xs text-green-100 hover:border-green-400"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: sevColor(c.severity) }}
                />
                {c.incident_id}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
