import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api, fmtDate, humanize, loadIncidentsOnce, memoryStats, sevColor } from "../api.js";
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

// The alert box is an old green-phosphor terminal: a beige (or, in the dark
// theme, graphite) case, scanlines, glowing text and a boot-log while it searches.
function Terminal({ text, setText, loading, stage, onAsk }) {
  return (
    <div className="crt-case rounded-[22px] p-2.5 sm:p-3.5">
      <div className="crt-screen crt-on overflow-hidden rounded-[14px] px-4 pb-4 pt-3 font-crt text-[21px] leading-[1.2] sm:px-6 sm:text-[23px]">
        <div className="relative z-[1]">
          <div className="crt-dim flex justify-between gap-4 uppercase">
            <span>MemOps recall v1.0</span>
            <span>{loading ? "Busy" : "Ready."}</span>
          </div>
          <div className="crt-dim mb-2 overflow-hidden whitespace-nowrap" aria-hidden>{"=".repeat(64)}</div>
          {loading ? (
            <div className="min-h-[6.5rem]" aria-live="polite">
              <div className="crt-dim break-words">&gt; {text}</div>
              {STAGES.slice(0, stage + 1).map((s, i) => (
                <div key={s} className="crt-text uppercase">
                  {i < stage ? "[ OK ] " : "[ .. ] "}
                  {s}
                  {i === stage && <span className="term-cursor">█</span>}
                </div>
              ))}
            </div>
          ) : (
            <label className="flex gap-3">
              <span className="crt-text select-none" aria-hidden>
                &gt;
              </span>
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
                spellCheck={false}
                placeholder="paste the alert that just fired"
                style={{ caretShape: "block" }}
                className="crt-text block min-h-[6.5rem] w-full resize-none bg-transparent caret-[#5cff86] outline-none"
              />
            </label>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 px-2 pb-0.5 pt-3">
        <span className="flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgb(var(--bezel-text))]">
          <span className={`crt-led h-2 w-2 rounded-full ${loading ? "crt-led-busy" : ""}`} aria-hidden />
          MemOps·1
          <span className="hidden font-normal normal-case tracking-normal sm:inline">Enter to ask, Shift+Enter for a new line</span>
        </span>
        <button
          onClick={onAsk}
          disabled={loading || !text.trim()}
          className="crt-text inline-flex items-center gap-2 whitespace-nowrap rounded-md border border-black/40 bg-[#07140b] px-4 py-1.5 font-crt text-[20px] uppercase shadow-[0_3px_0_rgb(0_0_0/0.45)] transition-transform active:translate-y-[2px] active:shadow-[0_1px_0_rgb(0_0_0/0.45)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {loading ? "Searching…" : "Ask memory ▸"}
        </button>
      </div>
    </div>
  );
}

// Where each matched incident sits in time, oldest on the left: shows a
// problem coming back and how its fix changed.
function Timeline({ cards }) {
  const dated = cards.filter((c) => c.timestamp).map((c) => ({ ...c, t: Date.parse(c.timestamp) }));
  if (dated.length < 2) return null;
  const min = Math.min(...dated.map((c) => c.t));
  const max = Math.max(...dated.map((c) => c.t));
  const pos = (t) => (max === min ? 50 : 4 + ((t - min) / (max - min)) * 92);
  // label a dot only if it isn't crowding the last labelled one
  let lastLabel = -100;
  const labelled = new Set();
  for (const c of [...dated].sort((x, y) => x.t - y.t)) {
    if (pos(c.t) - lastLabel >= 9) {
      labelled.add(c.incident_id);
      lastLabel = pos(c.t);
    }
  }
  return (
    <div className="mt-4 rounded-xl border border-rule bg-sheet px-5 pb-4 pt-3">
      <div className="flex justify-between font-mono text-[11px] uppercase tracking-[0.14em] text-faint">
        <span>{fmtDate(dated.find((c) => c.t === min).timestamp)}</span>
        <span>When they happened</span>
        <span>{fmtDate(dated.find((c) => c.t === max).timestamp)}</span>
      </div>
      <div className="relative mt-4 h-10">
        <div className="absolute inset-x-0 top-3 h-px bg-rule" />
        {dated.map((c) => (
          <Link
            key={c.incident_id}
            to={`/incidents/${c.incident_id}`}
            title={`${c.incident_id}: ${humanize(c.alert_name)}, ${c.match_score}% match`}
            className="group absolute top-0 -translate-x-1/2 text-center"
            style={{ left: `${pos(c.t)}%` }}
          >
            <span
              className="mx-auto block rounded-full ring-4 ring-sheet transition-transform group-hover:scale-125"
              style={{ background: sevColor(c.severity), width: 8 + c.match_score / 8, height: 8 + c.match_score / 8 }}
            />
            <span
              className={`mt-1 block whitespace-nowrap font-mono text-[10px] text-faint group-hover:text-ink ${
                labelled.has(c.incident_id) ? "" : "invisible group-hover:visible"
              }`}
            >
              {c.incident_id.replace(/^INC-/, "")}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Answer({ result, onUse, using, learned, useErr }) {
  const cards = result.historical_context || [];
  const top = cards[0];
  const confidence = Math.max(0, Math.min(100, Math.round(result.confidence || 0)));
  return (
    <section className="mt-10" aria-labelledby="answer-heading">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 border-b border-rule pb-5">
        <div>
          <h2 id="answer-heading" className="text-[1.75rem] font-semibold leading-tight tracking-tight">
            {verdict(result)}
          </h2>
          {top && (
            <p className="mt-1 text-muted">
              Closest match is <span className="font-mono text-[14px] text-ink">{top.incident_id}</span> on{" "}
              {top.service_affected}.
            </p>
          )}
        </div>
        <div className="w-full max-w-[14rem]">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint">Confidence</span>
            <span className="font-mono text-xl font-semibold">{confidence}%</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-raise">
            <div className="h-full rounded-full bg-accent" style={{ width: `${confidence}%` }} />
          </div>
        </div>
      </div>

      {result.suggested_fix && (
        <div className="mt-6 rounded-xl border border-accent/30 bg-accent-wash/40 p-5 sm:p-6">
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
            Suggested fix{top && ` · from ${cards.length} past incidents`}
          </div>
          <p className="mt-2 max-w-prose text-[1.125rem] leading-relaxed">
            <BoldText text={trimToSentences(result.suggested_fix, 3)} />
          </p>
          {top && !learned && (
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
              <Button onClick={onUse} disabled={using}>
                {using && <ButtonSpinner />}
                {using ? "Saving" : "This fix worked"}
              </Button>
              <span className="text-sm text-muted">MemOps re-learns {top.incident_id} so the next answer is sharper.</span>
            </div>
          )}
          {useErr && <div className="mt-4 max-w-prose"><ErrorNote error={useErr} /></div>}
          {learned && (
            <div className="mt-5 border-t border-accent/30 pt-4" role="status">
              <p className="font-semibold text-accent-strong">Saved. MemOps re-learned {learned.incident_id}.</p>
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
        </div>
      )}

      {cards.length > 0 && (
        <div className="mt-10">
          <h3 className="text-lg font-semibold">The evidence</h3>
          <Timeline cards={cards} />
          <ul className="mt-4 space-y-2">
            {cards.map((c) => (
              <li key={c.incident_id}>
                <Link
                  to={`/incidents/${c.incident_id}`}
                  className="grid grid-cols-[4.5rem_1fr] gap-4 rounded-xl border border-rule bg-sheet px-4 py-4 transition-colors hover:border-faint sm:grid-cols-[6rem_1fr]"
                >
                  <span>
                    <span className="block font-mono text-lg font-semibold text-accent">{c.match_score}%</span>
                    <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-raise">
                      <span className="block h-full rounded-full bg-accent" style={{ width: `${c.match_score}%` }} />
                    </span>
                    <span className="mt-1 block font-mono text-[10px] uppercase tracking-wider text-faint">match</span>
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                      <span className="font-semibold">{humanize(c.alert_name)}</span>
                      <Severity severity={c.severity} />
                    </span>
                    <span className="mt-0.5 block font-mono text-[13px] text-muted">
                      {c.incident_id} · {c.service_affected} · {fmtDate(c.timestamp)}
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

function Glance() {
  const [incidents, setIncidents] = useState(null);
  useEffect(() => {
    loadIncidentsOnce().then((d) => setIncidents(d.incidents || [])).catch(() => setIncidents([]));
  }, []);
  if (!incidents?.length) return null;
  const stats = memoryStats(incidents);
  const recent = [...incidents].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)).slice(0, 4);
  const tiles = [
    ["Incidents", stats.incidents],
    ["Services", stats.services],
    ["Engineers", stats.engineers],
    ["Median fix", `${stats.medianFix}m`],
  ];
  return (
    <aside className="space-y-8 xl:pt-[4.25rem]" aria-label="Memory at a glance">
      <div>
        <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint">In memory</h2>
        <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-rule bg-rule">
          {tiles.map(([label, value]) => (
            <div key={label} className="bg-sheet px-4 py-3">
              <dt className="text-[13px] text-muted">{label}</dt>
              <dd className="font-mono text-2xl font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      {stats.busiest && (
        <div>
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint">Breaks most often</h2>
          <Link
            to={`/incidents?service=${encodeURIComponent(stats.busiest.service)}`}
            className="mt-3 block rounded-xl border border-rule bg-sheet px-4 py-3 transition-colors hover:border-faint"
          >
            <span className="font-mono text-[14px] font-semibold">{stats.busiest.service}</span>
            <span className="mt-0.5 block text-[13px] text-muted">{stats.busiest.count} incidents, see them all →</span>
          </Link>
        </div>
      )}
      <div>
        <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint">Most recent</h2>
        <ul className="mt-3 space-y-1">
          {recent.map((i) => (
            <li key={i.incident_id}>
              <Link to={`/incidents/${i.incident_id}`} className="flex gap-3 rounded-md px-2 py-2 transition-colors hover:bg-raise">
                <span className="mt-[7px] h-2 w-2 shrink-0 rounded-full" style={{ background: sevColor(i.severity) }} aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold">{humanize(i.alert_name)}</span>
                  <span className="block font-mono text-[12px] text-muted">
                    {i.service_affected} · {fmtDate(i.timestamp)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </aside>
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
    <div className="mx-auto grid max-w-page gap-x-12 gap-y-14 px-4 pb-20 pt-10 sm:px-6 sm:pt-14 lg:px-10 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0">
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
      <Glance />
    </div>
  );
}
