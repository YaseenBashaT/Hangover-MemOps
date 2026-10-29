import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api, fmtDate, humanize } from "../api.js";
import { BoldText, Button, ButtonSpinner, ErrorNote, Severity } from "../components/ui.jsx";

const SAMPLES = [
  ["Pool exhausted", "payments-api is throwing connection pool errors, pool appears exhausted, service degraded"],
  ["Gateway 502s", "api-gateway returning 502s, upstream timeouts to auth-service"],
  ["Stripe webhooks", "billing-service stripe webhooks failing signature verification"],
];

// Shown in the terminal while the ~10s analysis runs.
const STAGES = ["Reading the alert", "Searching past incidents", "Writing up the fix"];

// Keep the alert and its answer when the visitor clicks into an incident and back.
const STORAGE_KEY = "memops_ask_state";
function loadPersisted() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || null;
  } catch {
    return null;
  }
}
function savePersisted(state) {
  try {
    if (state) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // persistence is best-effort
  }
}

// Keep the suggested fix to its first 3 sentences so it stays scannable.
function trimToSentences(text, max = 3) {
  if (!text) return text;
  const parts = text.match(/[\s\S]*?[.!?]+\**(?=\s|$)/g);
  if (!parts) return text.trim();
  return parts.slice(0, max).join("").trim().replace(/([.!?]\**)\s+\d+[.)]$/, "$1");
}

// A card shares the best match's service but scores well below it: probably a
// different problem on the same service.
function isDistractor(card, top) {
  if (!top || card.incident_id === top.incident_id) return false;
  return card.service_affected === top.service_affected && card.match_score < top.match_score * 0.75;
}

function verdict(result) {
  const n = result.historical_context?.length || 0;
  if (!n || result.confidence < 30) return "Nothing like this in memory yet.";
  if (result.confidence < 60) return "This looks partly familiar.";
  return "This has happened before.";
}

function Terminal({ text, setText, loading, stage, onAsk }) {
  return (
    <div className="overflow-hidden rounded-xl border border-term-line bg-term-bg shadow-[0_12px_32px_-16px_rgb(2_6_23/0.6)]">
      <div className="flex items-center justify-between border-b border-term-line px-4 py-2 font-mono text-xs text-term-dim">
        <span>on-call / new alert</span>
        <span className={loading ? "text-term-text" : ""}>{loading ? "searching memory" : "ready"}</span>
      </div>
      <div className="px-4 py-4 font-mono sm:px-5">
        {loading ? (
          <div className="min-h-[7rem] text-[15px] leading-relaxed" aria-live="polite">
            <div className="text-term-dim">$ {text}</div>
            {STAGES.slice(0, stage + 1).map((s, i) => (
              <div key={s} className="mt-1 text-term-text">
                <span className="text-term-dim">{i < stage ? "done " : "...  "}</span>
                {s}
                {i === stage && <span className="term-cursor">_</span>}
              </div>
            ))}
          </div>
        ) : (
          <label className="flex gap-3">
            <span className="select-none pt-px text-[15px] text-term-dim" aria-hidden>$</span>
            <span className="sr-only">Alert text</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onAsk();
                }
              }}
              rows={4}
              placeholder="paste the alert that just fired"
              className="block min-h-[7rem] w-full resize-none bg-transparent text-[15px] leading-relaxed text-term-text caret-term-text outline-none placeholder:text-term-dim"
            />
          </label>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-term-line px-4 py-2.5">
        <span className="font-mono text-xs text-term-dim">Enter to ask<span className="hidden sm:inline">, Shift+Enter for a new line</span></span>
        <Button onClick={onAsk} disabled={loading || !text.trim()} className="whitespace-nowrap disabled:bg-term-line disabled:text-term-dim">
          {loading && <ButtonSpinner />}
          {loading ? "Searching" : "Ask memory"}
        </Button>
      </div>
    </div>
  );
}

function Answer({ result, onUse, using, learned, useErr }) {
  const cards = result.historical_context || [];
  const top = cards[0];
  return (
    <section className="mt-12" aria-labelledby="answer-heading">
      <h2 id="answer-heading" className="text-[1.75rem] font-bold leading-tight">
        {verdict(result)}
      </h2>
      {top && (
        <p className="mt-1 text-muted">
          Closest match is {top.incident_id} on {top.service_affected}, {top.match_score}% similar.
        </p>
      )}

      {result.suggested_fix && (
        <div className="mt-6 max-w-prose border-l-4 border-accent pl-5">
          <p className="text-[1.2rem] leading-relaxed">
            <BoldText text={trimToSentences(result.suggested_fix, 3)} />
          </p>
        </div>
      )}

      {top && !learned && (
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Button onClick={onUse} disabled={using}>
            {using && <ButtonSpinner />}
            {using ? "Saving" : "This fix worked"}
          </Button>
          <span className="text-sm text-muted">
            Tells MemOps that {top.incident_id}'s fix applied again, so it re-learns from it.
          </span>
        </div>
      )}
      {useErr && <div className="mt-4 max-w-prose"><ErrorNote error={useErr} /></div>}
      {learned && (
        <div className="mt-6 max-w-prose bg-accent-wash px-5 py-4" role="status">
          <p className="font-bold text-accent-strong">Saved. MemOps re-learned {learned.incident_id}.</p>
          <p className="mt-1 text-sm text-muted">
            Its graph went from {learned.graph_strengthened?.edges_before} to{" "}
            {learned.graph_strengthened?.edges_after} links
            {(learned.reinforced_connections || []).length > 0 &&
              `, connected to ${learned.reinforced_connections.length} other incidents on ${top?.service_affected}`}
            .{" "}
            <Link to="/map" state={{ reinforced: [learned.incident_id], at: Date.now() }} className="text-accent underline underline-offset-4">
              See it on the memory map
            </Link>
          </p>
        </div>
      )}

      {cards.length > 0 && (
        <div className="mt-12">
          <h3 className="text-lg font-bold">Closest past incidents</h3>
          <ul className="mt-3 divide-y divide-rule border-y border-rule bg-sheet">
            {cards.map((c) => (
              <li key={c.incident_id}>
                <Link
                  to={`/incidents/${c.incident_id}`}
                  className="grid grid-cols-[3.5rem_1fr] gap-4 px-4 py-4 hover:bg-raise sm:grid-cols-[4.5rem_1fr]"
                >
                  <span className="pt-0.5 text-right font-mono text-lg font-semibold text-accent">
                    {c.match_score}%
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                      <span className="font-bold">{humanize(c.alert_name)}</span>
                      <Severity severity={c.severity} />
                    </span>
                    <span className="mt-0.5 block font-mono text-[13px] text-muted">
                      {c.incident_id}, {c.service_affected}, {fmtDate(c.timestamp)}
                    </span>
                    {c.fix_applied && <span className="mt-1.5 block text-[15px]">Fix: {c.fix_applied}</span>}
                    {isDistractor(c, top) && (
                      <span className="mt-1 block text-sm italic text-sev-medium">Same service, likely a different problem</span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default function Ask() {
  const persisted = loadPersisted();
  const [text, setText] = useState(persisted?.text || "");
  const [result, setResult] = useState(persisted?.result || null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);
  const [err, setErr] = useState(null);
  const [using, setUsing] = useState(false);
  const [learned, setLearned] = useState(null);
  const [useErr, setUseErr] = useState(null);
  const [warming, setWarming] = useState(null);

  useEffect(() => {
    savePersisted(result ? { text, result } : null);
  }, [text, result]);

  useEffect(() => {
    if (!loading) return;
    setStage(0);
    const t = setInterval(() => setStage((i) => Math.min(i + 1, STAGES.length - 1)), 3000);
    return () => clearInterval(t);
  }, [loading]);

  // On a cold start the backend may still be restoring its memory.
  useEffect(() => {
    api
      .getSeedStatus()
      .then((s) => (s.state === "pending" || s.state === "in_progress") && setWarming(s))
      .catch(() => {});
  }, []);

  async function ask(alertText = text) {
    if (!alertText.trim() || loading) return;
    setText(alertText);
    setLoading(true);
    setErr(null);
    setResult(null);
    setLearned(null);
    setUseErr(null);
    try {
      setResult(await api.analyzeAlert(alertText.trim()));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function useFix() {
    const top = result?.historical_context?.[0];
    if (!top) return;
    setUsing(true);
    setUseErr(null);
    try {
      setLearned(await api.resolveIncident(top.incident_id));
    } catch (e) {
      setUseErr(e.message);
    } finally {
      setUsing(false);
    }
  }

  return (
    <div className="mx-auto max-w-page px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
      <div className="max-w-[46rem]">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent">Incident memory</p>
        <h1 className="mt-2 text-[2.25rem] font-semibold leading-[1.1] tracking-tight sm:text-[2.75rem]">What's firing?</h1>
        <p className="mt-3 max-w-prose text-[1.075rem] text-muted">
          Paste an alert. MemOps looks through every incident your team has resolved and
          tells you what fixed it last time.{" "}
          <Link to="/about" className="text-accent underline-offset-4 hover:underline">
            New here?
          </Link>
        </p>

        <div className="mt-8">
          <Terminal text={text} setText={setText} loading={loading} stage={stage} onAsk={() => ask()} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm text-muted">Try one:</span>
          {SAMPLES.map(([label, alert]) => (
            <button
              key={label}
              onClick={() => ask(alert)}
              disabled={loading}
              className="rounded-md border border-rule bg-sheet px-2.5 py-1 font-mono text-[13px] text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {label}
            </button>
          ))}
        </div>

        {warming && (
          <p className="mt-4 text-sm text-sev-medium">
            Memory is still loading ({warming.count} of 17 incidents). Answers get better once it finishes.
          </p>
        )}
        {err && (
          <div className="mt-6">
            <ErrorNote error={err} />
          </div>
        )}
      </div>

      {result && !loading && (
        <Answer result={result} onUse={useFix} using={using} learned={learned} useErr={useErr} />
      )}
    </div>
  );
}
