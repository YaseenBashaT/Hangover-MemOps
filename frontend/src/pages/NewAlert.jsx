import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, sevColor } from "../api.js";
import { Panel, Spinner, ErrorBox, SeverityBadge, BoldText } from "../components/ui.jsx";

const SAMPLE =
  "payments-api connection pool exhausted under heavy load, PgBouncer saturated, checkout latency spiking";

function ConfidenceGauge({ value }) {
  const c = value >= 70 ? "#22c55e" : value >= 40 ? "#eab308" : "#f97316";
  return (
    <div className="rounded-lg border border-edge bg-panel2/70 p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wide text-gray-400">
          Match confidence
        </span>
        <span className="text-2xl font-semibold" style={{ color: c }}>
          {value}%
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-edge">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${value}%`, background: c }}
        />
      </div>
      <p className="mt-2 text-[11px] text-gray-500">
        How much of this alert we’ve seen resolved before.
      </p>
    </div>
  );
}

export default function NewAlert() {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const [decision, setDecision] = useState(null); // 'approved' | 'rejected'

  async function analyze() {
    if (!text.trim()) return;
    setLoading(true);
    setErr(null);
    setResult(null);
    setDecision(null);
    try {
      const res = await api.analyzeAlert(text.trim());
      setResult(res);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-white">New Alert</h1>
        <p className="text-sm text-gray-400">
          Paste an incoming alert. Recall matches it against past incidents and
          suggests a fix.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* LEFT — raw alert input */}
        <Panel title="Raw Alert" className="flex flex-col">
          <div className="flex flex-1 flex-col gap-3 p-4">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. payments-api connection pool exhausted under heavy load…"
              className="min-h-[220px] flex-1 resize-y rounded-lg border border-edge bg-ink/60 p-3 font-mono text-sm text-gray-200 outline-none focus:border-brand/60"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={analyze}
                disabled={loading || !text.trim()}
                className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand/80 disabled:opacity-40"
              >
                {loading ? "Analyzing…" : "Analyze"}
              </button>
              <button
                onClick={() => setText(SAMPLE)}
                className="rounded-md border border-edge px-3 py-2 text-sm text-gray-400 hover:text-white"
              >
                Use sample
              </button>
            </div>
          </div>
        </Panel>

        {/* RIGHT — structured response */}
        <Panel title="Recall Analysis" className="flex flex-col">
          <div className="flex-1 space-y-4 overflow-auto p-4">
            {!result && !loading && !err && (
              <div className="flex h-full min-h-[220px] items-center justify-center text-sm text-gray-500">
                Run an analysis to see historical context and a suggested fix.
              </div>
            )}
            {loading && (
              <div className="flex h-full min-h-[220px] items-center justify-center">
                <Spinner label="Querying the incident graph…" />
              </div>
            )}
            {err && <ErrorBox error={err} hint="Is the backend running on :8000?" />}

            {result && (
              <>
                <ConfidenceGauge value={result.confidence ?? 0} />

                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Suggested Fix
                  </div>
                  <div className="rounded-lg border border-brand/30 bg-brand/5 p-3 text-sm leading-relaxed text-gray-200">
                    {result.suggested_fix ? (
                      <BoldText text={result.suggested_fix} />
                    ) : (
                      "No suggestion returned."
                    )}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Related Past Incidents ({result.historical_context?.length || 0})
                  </div>
                  <div className="space-y-2">
                    {(result.historical_context || []).map((c) => (
                      <button
                        key={c.incident_id}
                        onClick={() => navigate(`/incidents/${c.incident_id}`)}
                        className="block w-full rounded-lg border border-edge bg-panel2/60 p-3 text-left transition hover:border-brand/50"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-sm text-gray-200">
                            {c.incident_id}
                          </span>
                          <div className="flex items-center gap-2">
                            {typeof c.match_score === "number" && (
                              <span className="text-[11px] text-gray-500">
                                {c.match_score}% match
                              </span>
                            )}
                            <SeverityBadge severity={c.severity} />
                          </div>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: sevColor(c.severity) }}
                          />
                          {c.service_affected} · {c.alert_name}
                        </div>
                      </button>
                    ))}
                    {result.historical_context?.length === 0 && (
                      <div className="text-sm text-gray-500">
                        No prior incidents matched this alert.
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {result && (
            <div className="border-t border-edge p-4">
              {decision === "approved" && (
                <div className="mb-3 rounded-lg border border-green-500/40 bg-green-500/10 p-2.5 text-sm text-green-300">
                  ✓ Fix approved and logged. Open the top related incident to
                  resolve &amp; reinforce the graph.
                </div>
              )}
              {decision === "rejected" && (
                <div className="mb-3 rounded-lg border border-edge bg-white/5 p-2.5 text-sm text-gray-400">
                  Suggestion rejected — no action taken.
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setDecision("approved")}
                  className="flex-1 rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-500"
                >
                  Approve Fix
                </button>
                <button
                  onClick={() => setDecision("rejected")}
                  className="flex-1 rounded-md border border-edge px-4 py-2 text-sm font-semibold text-gray-300 transition hover:bg-white/5"
                >
                  Reject
                </button>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
