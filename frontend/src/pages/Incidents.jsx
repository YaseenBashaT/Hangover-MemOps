import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, fmtDate, humanize, loadInsightsOnce } from "../api.js";
import { BoldText, ErrorNote, Severity, Spinner, Status } from "../components/ui.jsx";

const SEVERITIES = ["critical", "high", "medium", "low"];

function Patterns() {
  const [insights, setInsights] = useState(null);
  useEffect(() => {
    loadInsightsOnce().then(setInsights).catch(() => setInsights({ insights: [] }));
  }, []);
  const items = insights?.insights || [];
  if (insights && !items.length) return null;
  return (
    <section className="mt-8 max-w-[46rem]" aria-labelledby="patterns-heading">
      <h2 id="patterns-heading" className="text-lg font-bold">
        Patterns MemOps noticed
      </h2>
      {!insights ? (
        <div className="mt-3"><Spinner label="Reading the graph…" /></div>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((t, i) => (
            <li key={i} className="border-l-2 border-accent/50 pl-4 text-[15px] leading-relaxed">
              <BoldText text={t} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function Incidents() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [query, setQuery] = useState("");
  const [service, setService] = useState("");
  const [severity, setSeverity] = useState("");

  useEffect(() => {
    api.listIncidents().then(setData).catch((e) => setErr(e.message));
  }, []);

  const incidents = useMemo(() => data?.incidents || [], [data]);
  const services = useMemo(
    () => [...new Set(incidents.map((i) => i.service_affected))].sort(),
    [incidents]
  );
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return incidents.filter(
      (i) =>
        (!service || i.service_affected === service) &&
        (!severity || i.severity === severity) &&
        (!q ||
          [i.incident_id, i.service_affected, i.alert_name, humanize(i.alert_name)]
            .join(" ")
            .toLowerCase()
            .includes(q))
    );
  }, [incidents, query, service, severity]);

  const selectCls =
    "rounded-md border border-rule bg-sheet px-3 py-2 text-[15px] text-ink focus:border-accent";

  return (
    <div className="mx-auto max-w-page px-4 pb-20 pt-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[2.25rem] font-semibold tracking-tight leading-tight">Incidents</h1>
          <p className="mt-1 text-muted">
            {data ? `${incidents.length} incidents in memory.` : "Everything MemOps remembers."}
          </p>
        </div>
        <Link
          to="/incidents/new"
          className="rounded-md bg-accent px-4 py-2 text-[15px] font-bold text-accent-on hover:bg-accent-strong"
        >
          Add incident
        </Link>
      </div>

      <Patterns />

      <section className="mt-10" aria-label="All incidents">
        <div className="flex flex-wrap gap-2">
          <label className="min-w-[14rem] flex-1">
            <span className="sr-only">Search incidents</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by ID, service or alert"
              className="w-full rounded-md border border-rule bg-sheet px-3 py-2 text-[15px] outline-none focus:border-accent"
            />
          </label>
          <label>
            <span className="sr-only">Service</span>
            <select value={service} onChange={(e) => setService(e.target.value)} className={selectCls}>
              <option value="">All services</option>
              {services.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Severity</span>
            <select value={severity} onChange={(e) => setSeverity(e.target.value)} className={selectCls}>
              <option value="">Any severity</option>
              {SEVERITIES.map((s) => (
                <option key={s} value={s} className="capitalize">{s}</option>
              ))}
            </select>
          </label>
        </div>

        {err && <div className="mt-6"><ErrorNote error={err} /></div>}
        {!data && !err && <div className="mt-6"><Spinner label="Loading incidents…" /></div>}

        {data && (
          <>
            <div className="mt-5 hidden grid-cols-[7.5rem_1fr_11rem_6.5rem_5.5rem] gap-4 px-4 pb-2 text-sm text-muted md:grid">
              <span>Date</span>
              <span>Incident</span>
              <span>Service</span>
              <span>Severity</span>
              <span>Status</span>
            </div>
            <ul className="divide-y divide-rule border-y border-rule bg-sheet md:mt-0 mt-5">
              {shown.map((i) => (
                <li key={i.incident_id}>
                  <Link
                    to={`/incidents/${i.incident_id}`}
                    className="grid grid-cols-1 gap-x-4 gap-y-0.5 px-4 py-3.5 hover:bg-raise md:grid-cols-[7.5rem_1fr_11rem_6.5rem_5.5rem] md:items-baseline"
                  >
                    <span className="order-3 font-mono text-[13px] text-muted md:order-none">{fmtDate(i.timestamp)}</span>
                    <span className="min-w-0">
                      <span className="block font-bold">{humanize(i.alert_name)}</span>
                      <span className="block font-mono text-[13px] text-muted">{i.incident_id}</span>
                    </span>
                    <span className="font-mono text-[13px]">{i.service_affected}</span>
                    <span><Severity severity={i.severity} /></span>
                    <span className="hidden md:block"><Status status={i.status} /></span>
                  </Link>
                </li>
              ))}
            </ul>
            {shown.length === 0 && (
              <p className="mt-4 text-muted">
                No incidents match. Clear the search or pick another service.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
