import { useState } from "react";
import { sevColor } from "../api.js";

/**
 * The signature "memify moment" panel — shown after Approve Fix / resolve.
 * P0-c: Now includes a collapsible before/after evidence section showing what
 * the graph learned from the reinforcement.
 */
export default function MemifyCard({ result, onOpenRelated }) {
  const g = result.graph_strengthened || {};
  const ev = result.learning_evidence;
  const [showEvidence, setShowEvidence] = useState(false);

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

      {/* P0-c: Before/after evidence section */}
      {ev && (
        <div className="mt-4 rounded-lg border border-green-500/20 bg-ink/30">
          <button
            onClick={() => setShowEvidence((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold text-green-300/80 hover:text-green-200"
          >
            <span>🔍 See what the graph learned</span>
            <span className="text-green-400/60">{showEvidence ? "▲ hide" : "▼ show"}</span>
          </button>
          {showEvidence && (
            <div className="border-t border-green-500/20 px-3 pb-3 pt-2 space-y-2">
              <div className="text-[10px] text-green-200/50 italic mb-1">
                Query: {ev.query}
              </div>
              {ev.note ? (
                <div className="text-xs text-green-200/70 italic">{ev.note}</div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-red-300/60">
                      Before improve()
                    </div>
                    <div className="rounded bg-red-900/20 p-2 text-[11px] leading-relaxed text-red-200/70 line-clamp-6">
                      {ev.before || "—"}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-green-300/80">
                      After improve() ✓
                    </div>
                    <div className="rounded bg-green-900/20 p-2 text-[11px] leading-relaxed text-green-200/90 line-clamp-6">
                      {ev.after || "—"}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* P0-c: Renamed from "Nodes strengthened" to the accurate label */}
      {(result.reinforced_connections || []).length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-green-200/70">
            Connected incidents on this service ({result.reinforced_connections.length})
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
