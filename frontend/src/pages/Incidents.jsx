import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fmtDate, humanize, loadIncidentsOnce, loadInsightsOnce, sevColor } from "../api.js";
import { BoldText, ErrorNote, Icon, Severity, Spinner, Status } from "../components/ui.jsx";

const SEVERITIES = ["critical", "high", "medium", "low"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LABEL = "font-mono text-[11px] uppercase tracking-[0.14em] text-faint";

function Patterns() {
  const [insights, setInsights] = useState(null);
  useEffect(() => {
    loadInsightsOnce().then(setInsights).catch(() => setInsights({ insights: [] }));
  }, []);
  const items = insights?.insights || [];
  if (insights && !items.length) return null;
  return (
    <section className="mt-10" aria-labelledby="patterns-heading">
      <h2 id="patterns-heading" className={LABEL}>
        Patterns MemOps noticed
      </h2>
      {!insights ? (
        <div className="mt-3"><Spinner label="Reading the graph…" /></div>
      ) : (
        <ul className="mt-3 grid gap-3 md:grid-cols-3">
          {items.map((t, i) => (
            <li key={i} className="rounded-xl border border-rule bg-sheet px-4 py-3.5 text-[14px] leading-relaxed">
              <BoldText text={t} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// One column per month from the first incident to the last, one square per incident.
function Activity({ incidents, active }) {
  const months = useMemo(() => {
    if (!incidents.length) return [];
    const key = (ts) => ts.slice(0, 7);
    const sorted = [...incidents].sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
    let [y, m] = key(sorted[0].timestamp).split("-").map(Number);
    const [ly, lm] = key(sorted.at(-1).timestamp).split("-").map(Number);
    const out = [];
    while (y < ly || (y === ly && m <= lm)) {
      const k = `${y}-${String(m).padStart(2, "0")}`;
      out.push({ k, y, m, items: sorted.filter((i) => key(i.timestamp) === k) });
      m += 1;
      if (m > 12) [y, m] = [y + 1, 1];
    }
    return out;
  }, [incidents]);
  if (!months.length) return null;
  const tallest = Math.max(3, ...months.map((x) => x.items.length));
  return (
    <section className="mt-8 rounded-xl border border-rule bg-sheet px-5 pb-3 pt-4" aria-label="Incidents per month">
      <div className="flex items-baseline justify-between">
        <h2 className={LABEL}>Incidents per month</h2>
        <span className="hidden gap-3 text-[12px] text-muted sm:flex">
          {SEVERITIES.map((s) => (
            <span key={s} className="flex items-center gap-1.5 capitalize">
              <span className="h-2 w-2 rounded-sm" style={{ background: sevColor(s) }} aria-hidden />
              {s}
            </span>
          ))}
        </span>
      </div>
      <div className="mt-4 flex items-end gap-1 overflow-x-auto pb-1">
        {months.map(({ k, y, m, items }) => (
          <div key={k} className="flex min-w-[1.4rem] flex-1 flex-col items-center gap-1">
            <div className="flex flex-col-reverse gap-1" style={{ height: tallest * 18 }}>
              {items.map((i) => (
                <Link
                  key={i.incident_id}
                  to={`/incidents/${i.incident_id}`}
                  title={`${i.incident_id}: ${humanize(i.alert_name)} on ${i.service_affected}`}
                  className={`block h-3.5 w-3.5 rounded-[3px] transition-transform hover:scale-125 ${
                    active && !active(i) ? "opacity-20" : ""
                  }`}
                  style={{ background: sevColor(i.severity) }}
                />
              ))}
            </div>
            <span className={`font-mono text-[10px] ${m === 1 ? "text-ink" : "text-faint"}`}>
              {m === 1 ? y : MONTHS[m - 1][0]}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function FilterButton({ on, onClick, children, count }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-[14px] transition-colors ${
        on ? "bg-raise font-semibold text-ink" : "text-muted hover:bg-raise/60 hover:text-ink"
      }`}
    >
      <span className="flex min-w-0 items-center gap-2 truncate">{children}</span>
      <span className="font-mono text-[12px] text-faint">{count}</span>
    </button>
  );
}

export default function Incidents() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [query, setQuery] = useState("");
  const service = params.get("service") || "";
  const severity = params.get("severity") || "";

  function setFilter(name, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next, { replace: true });
  }

  useEffect(() => {
    loadIncidentsOnce().then(setData).catch((e) => setErr(e.message));
  }, []);

  const incidents = useMemo(() => data?.incidents || [], [data]);
  const services = useMemo(() => {
    const counts = new Map();
    for (const i of incidents) counts.set(i.service_affected, (counts.get(i.service_affected) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [incidents]);

  const q = query.trim().toLowerCase();
  const matches = (i) =>
    (!service || i.service_affected === service) &&
    (!severity || i.severity === severity) &&
    (!q ||
      [i.incident_id, i.service_affected, i.alert_name, humanize(i.alert_name), i.engineer_name]
        .join(" ")
        .toLowerCase()
        .includes(q));
  const shown = incidents.filter(matches);
  const filtered = Boolean(service || severity || q);

  return (
    <div className="mx-auto max-w-page px-4 pb-20 pt-10 sm:px-6 lg:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent">Memory</p>
          <h1 className="mt-2 text-[2.25rem] font-semibold leading-tight tracking-tight">Incidents</h1>
          <p className="mt-1 text-muted">
            {data ? `${incidents.length} resolved incidents across ${services.length} services.` : "Everything MemOps remembers."}
          </p>
        </div>
        <Link
          to="/incidents/new"
          className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-[15px] font-semibold text-accent-on hover:bg-accent-strong"
        >
          <Icon name="plus" />
          Add incident
        </Link>
      </div>

      {err && <div className="mt-6"><ErrorNote error={err} /></div>}
      {!data && !err && <div className="mt-6"><Spinner label="Loading incidents…" /></div>}

      {data && (
        <>
          <Activity incidents={incidents} active={filtered ? matches : null} />
          <Patterns />

          <div className="mt-10 grid gap-8 lg:grid-cols-[14rem_minmax(0,1fr)]">
            <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
              <label className="block">
                <span className="sr-only">Search incidents</span>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search ID, alert, engineer"
                  className="w-full rounded-md border border-rule bg-sheet px-3 py-2 text-[14px] outline-none focus:border-accent"
                />
              </label>
              <div>
                <h2 className={`${LABEL} px-2.5`}>Severity</h2>
                <div className="mt-2 space-y-0.5">
                  <FilterButton on={!severity} onClick={() => setFilter("severity", "")} count={incidents.length}>
                    Any severity
                  </FilterButton>
                  {SEVERITIES.map((s) => (
                    <FilterButton
                      key={s}
                      on={severity === s}
                      onClick={() => setFilter("severity", severity === s ? "" : s)}
                      count={incidents.filter((i) => i.severity === s).length}
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: sevColor(s) }} aria-hidden />
                      <span className="capitalize">{s}</span>
                    </FilterButton>
                  ))}
                </div>
              </div>
              <div>
                <h2 className={`${LABEL} px-2.5`}>Service</h2>
                <div className="mt-2 space-y-0.5">
                  <FilterButton on={!service} onClick={() => setFilter("service", "")} count={incidents.length}>
                    All services
                  </FilterButton>
                  {services.map(([s, n]) => (
                    <FilterButton key={s} on={service === s} onClick={() => setFilter("service", service === s ? "" : s)} count={n}>
                      <span className="truncate font-mono text-[13px]">{s}</span>
                    </FilterButton>
                  ))}
                </div>
              </div>
            </div>

            <section aria-label="Incident list" className="min-w-0">
              <div className="flex items-baseline justify-between pb-3">
                <span className="text-[14px] text-muted">
                  {filtered ? `${shown.length} of ${incidents.length} incidents` : "Newest first"}
                </span>
                {filtered && (
                  <button
                    onClick={() => {
                      setQuery("");
                      setParams({}, { replace: true });
                    }}
                    className="text-[14px] text-accent underline-offset-4 hover:underline"
                  >
                    Clear filters
                  </button>
                )}
              </div>
              <ul className="overflow-hidden rounded-xl border border-rule bg-sheet">
                {shown.map((i) => (
                  <li key={i.incident_id} className="border-b border-rule last:border-b-0">
                    <Link
                      to={`/incidents/${i.incident_id}`}
                      className="group grid grid-cols-[4px_1fr] gap-x-4 py-3.5 pr-4 transition-colors hover:bg-raise/60 md:grid-cols-[4px_1fr_8rem_5.5rem]"
                    >
                      <span className="rounded-r-full" style={{ background: sevColor(i.severity) }} aria-hidden />
                      <span className="min-w-0">
                        <span className="block font-semibold group-hover:text-accent">{humanize(i.alert_name)}</span>
                        <span className="mt-0.5 block font-mono text-[12.5px] text-muted">
                          {i.incident_id} · {i.service_affected}
                          {i.engineer_name && <span className="hidden sm:inline"> · {i.engineer_name}</span>}
                        </span>
                        <span className="mt-1 flex gap-3 md:hidden">
                          <Severity severity={i.severity} />
                          <span className="font-mono text-[12.5px] text-muted">{fmtDate(i.timestamp)}</span>
                        </span>
                      </span>
                      <span className="hidden self-center font-mono text-[12.5px] text-muted md:block">{fmtDate(i.timestamp)}</span>
                      <span className="hidden self-center text-right md:block">
                        {i.resolution_time_minutes != null ? (
                          <span className="font-mono text-[13px]">
                            {i.resolution_time_minutes}
                            <span className="text-faint"> min</span>
                          </span>
                        ) : (
                          <Status status={i.status} />
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {shown.length === 0 && (
                <p className="mt-4 text-muted">No incidents match. Clear the filters or try another search.</p>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
