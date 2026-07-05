import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api, sevColor } from "../api.js";
import { Panel, Spinner, ErrorBox, SeverityBadge, BoldText } from "../components/ui.jsx";
import ScoreRing from "../components/ScoreRing.jsx";
import MemifyCard from "../components/MemifyCard.jsx";

const SAMPLE =
  "payments-api is throwing connection pool errors, pool appears exhausted, service degraded";

// Rotating status messages shown under the spinner during the ~11s analysis.
const ANALYSIS_STAGES = [
  "Embedding alert…",
  "Traversing incident graph…",
  "Synthesizing fix from past resolutions…",
];

// Persist the in-progress analysis across route changes.
const STORAGE_KEY = "memops_new_alert_state";

function loadPersisted() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function savePersisted(state) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota/serialization errors — persistence is best-effort
  }
}

function clearPersisted() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

function fmtDate(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return ts;
  }
}

// Keep the suggested fix to its first 3 sentences so the panel stays scannable.
function trimToSentences(text, max = 3) {
  if (!text) return text;
  const parts = text.match(/[\s\S]*?[.!?]+\**(?=\s|$)/g);
  if (!parts) return text.trim();
  return parts.slice(0, max).join("").trim();
}

// P0-b: Derive the "Different problem, same service" label dynamically.
// A card is a distractor if it shares the top card's service but its
// match_score is well below the top score (< 45% of top).
function isDistractor(card, topCard) {
  if (!topCard || !card) return false;
  if (card.incident_id === topCard.incident_id) return false;
  return (
    card.service_affected === topCard.service_affected &&
    card.match_score < topCard.match_score * 0.45
  );
}

export default function NewAlert() {
  const navigate = useNavigate();
  const persisted = loadPersisted();
  const [text, setText] = useState(persisted?.text || "");
  const [loading, setLoading] = useState(false);
  const [stageIdx, setStageIdx] = useState(0);
  const stageTimer = useRef(null);
  const [result, setResult] = useState(persisted?.result || null);
  const [err, setErr] = useState(null);
  const [approving, setApproving] = useState(false);
  const [memify, setMemify] = useState(null);
  const [approveErr, setApproveErr] = useState(null);

  const topIncident = result?.historical_context?.[0];

  // Keep the raw alert text and its analysis around in sessionStorage.
  useEffect(() => {
    if (result) {
      savePersisted({ text, result });
    }
  }, [text, result]);

  // Rotate analysis stage label every 2.5s while loading.
  useEffect(() => {
    if (loading) {
      setStageIdx(0);
      stageTimer.current = setInterval(() => {
        setStageIdx((i) => (i + 1) % ANALYSIS_STAGES.length);
      }, 2500);
    } else {
      clearInterval(stageTimer.current);
    }
    return () => clearInterval(stageTimer.current);
  }, [loading]);

  async function analyze() {
    if (!text.trim()) return;
    setLoading(true);
    setErr(null);
    setResult(null);
    setMemify(null);
    setApproveErr(null);
    try {
      setResult(await api.analyzeAlert(text.trim()));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setText("");
    setResult(null);
    setErr(null);
    setMemify(null);
    setApproveErr(null);
    clearPersisted();
  }

  async function approveFix() {
    if (!topIncident) return;
    setApproving(true);
    setApproveErr(null);
    try {
      const res = await api.resolveIncident(topIncident.incident_id);
      setMemify(res);
      clearPersisted();
      const reinforced = [
        res.incident_id,
        ...(res.reinforced_connections || []).map((c) => c.incident_id),
      ];
      setTimeout(() => {
        navigate("/", { state: { reinforced, at: Date.now() } });
      }, 3600);
    } catch (e) {
      setApproveErr(e.message);
    } finally {
      setApproving(false);
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

      <div className="grid gap-4">
        {/* Raw alert */}
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

        {/* Recall analysis */}
        <Panel title="Recall Analysis" className="flex flex-col">
          <div className="flex-1 space-y-4 overflow-auto p-4">
            {!result && !loading && !err && (
              <div className="flex h-full min-h-[220px] items-center justify-center text-sm text-gray-500">
                Run an analysis to see historical context and a suggested fix.
              </div>
            )}
            {/* P1-c: rotating progress theater */}
            {loading && (
              <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3">
                <Spinner />
                <div className="text-sm text-brand animate-pulse">
                  {ANALYSIS_STAGES[stageIdx]}
                </div>
              </div>
            )}
            {err && <ErrorBox error={err} hint="Is the backend running on :8000?" />}

            {result && !memify && (
              <>
                {/* circular score */}
                <div className="flex items-center gap-4 rounded-lg border border-edge bg-panel2/60 p-4">
                  <ScoreRing value={result.confidence ?? 0} />
                  <div className="text-gray-400">
                    <div className="text-sm font-semibold text-gray-200">Match confidence</div>
                    <p className="mt-1 text-base font-medium text-gray-200">
                      Found {result.historical_context?.length || 0} related
                      incident{(result.historical_context?.length || 0) === 1 ? "" : "s"}{" "}
                      in memory
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      How much of this alert we've already seen and resolved before.
                    </p>
                  </div>
                </div>

                {/* suggested fix */}
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Suggested Fix
                  </div>
                  <div className="rounded-lg border border-brand/30 bg-brand/5 p-3 text-sm leading-relaxed text-gray-200">
                    {result.suggested_fix ? (
                      <BoldText text={trimToSentences(result.suggested_fix, 3)} />
                    ) : (
                      "No suggestion returned."
                    )}
                  </div>
                </div>

                {/* historical context with dates + fixes */}
                <div>
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Related Past Incidents ({result.historical_context?.length || 0})
                    </div>
                    {/* P0-a: honest label — uses real Cognee retrieval now */}
                    <div className="text-[11px] text-gray-500">Ranked by Cognee retrieval</div>
                  </div>
                  <div className="mt-2 space-y-2">
                    {(result.historical_context || []).map((c, i) => {
                      // P0-b: dynamic distractor label (no hardcoded ID)
                      const distractor = isDistractor(c, topIncident);
                      return (
                        <div
                          key={c.incident_id}
                          className={`rounded-lg border p-3 ${
                            i === 0 ? "border-brand/50 bg-brand/5" : "border-edge bg-panel2/60"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <button
                              onClick={() => navigate(`/incidents/${c.incident_id}`)}
                              className="font-mono text-sm text-gray-100 hover:text-brand"
                            >
                              {c.incident_id}
                              {i === 0 && (
                                <span className="ml-2 rounded bg-brand/30 px-1.5 py-0.5 text-[10px] font-semibold text-brand">
                                  best match
                                </span>
                              )}
                            </button>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-gray-500">{c.match_score}% match</span>
                              <SeverityBadge severity={c.severity} />
                            </div>
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
                            <span className="h-2 w-2 rounded-full" style={{ background: sevColor(c.severity) }} />
                            {c.service_affected} · {fmtDate(c.timestamp)}
                            {c.jira_id && <span className="text-gray-600">· {c.jira_id}</span>}
                          </div>
                          {c.fix_applied && (
                            <div className="mt-1.5 text-xs leading-relaxed text-gray-400">
                              <span className="text-gray-500">Fix: </span>
                              {c.fix_applied}
                            </div>
                          )}
                          {/* P0-b: dynamic distractor label based on score cliff */}
                          {distractor && (
                            <div className="mt-1.5 text-xs italic text-amber-400/80">
                              Different problem, same service
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {result.historical_context?.length === 0 && (
                      <div className="text-sm text-gray-500">
                        No prior incidents matched this alert.
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* memify moment */}
            {memify && (
              <div className="space-y-3">
                <MemifyCard
                  result={memify}
                  onOpenRelated={(rid) => navigate(`/incidents/${rid}`)}
                />
                <div className="text-center text-xs text-gray-500">
                  Taking you to the dashboard to watch the graph strengthen…
                </div>
              </div>
            )}
          </div>

          {result && !memify && (
            <div className="border-t border-edge p-4">
              {approveErr && <div className="mb-3"><ErrorBox error={approveErr} /></div>}
              <div className="flex gap-2">
                <button
                  onClick={approveFix}
                  disabled={approving || !topIncident}
                  className="flex flex-1 items-center justify-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-500 disabled:opacity-40"
                >
                  {approving && (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  )}
                  {approving ? "Reinforcing memory…" : "Approve Fix and Reinforce Memory"}
                </button>
                <button
                  onClick={reset}
                  disabled={approving}
                  className="flex-1 rounded-md border border-edge px-4 py-2 text-sm font-semibold text-gray-300 transition hover:bg-white/5 disabled:opacity-40"
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
