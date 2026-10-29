import { useEffect, useState } from "react";
import { useParams, useLocation, Link } from "react-router-dom";
import { api, fmtDate, humanize, sevColor } from "../api.js";
import { Button, ButtonSpinner, ErrorNote, Severity, Spinner, Status } from "../components/ui.jsx";

// "[03:16] sarah.chen: on it" -> { time, who, text }
function parseSlackLine(line) {
  const m = String(line).match(/^\[([^\]]+)\]\s*([^:]+):\s*(.*)$/);
  return m ? { time: m[1], who: m[2].trim(), text: m[3] } : { time: "", who: "", text: line };
}

function Section({ title, children }) {
  return (
    <section className="mt-10 first:mt-0">
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Fact({ label, children }) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

export default function IncidentDetail() {
  const { id } = useParams();
  const location = useLocation();
  const [inc, setInc] = useState(null);
  const [err, setErr] = useState(null);
  const [related, setRelated] = useState([]);
  const [saving, setSaving] = useState(false);
  const [learned, setLearned] = useState(null);
  const [saveErr, setSaveErr] = useState(null);

  useEffect(() => {
    let alive = true;
    setInc(null);
    setErr(null);
    setLearned(null);
    setRelated([]);
    (async () => {
      try {
        const data = await api.getIncident(id);
        if (!alive) return;
        setInc(data);
        // Same-service incidents: the graph links them through the shared service.
        const all = await api.listIncidents().catch(() => null);
        if (alive && all)
          setRelated(all.incidents.filter((x) => x.service_affected === data.service_affected && x.incident_id !== id));
      } catch (e) {
        if (alive) setErr(e.message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  async function relearn() {
    setSaving(true);
    setSaveErr(null);
    try {
      setLearned(await api.resolveIncident(id));
      setInc(await api.getIncident(id));
    } catch (e) {
      setSaveErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  const back = (
    <Link to="/incidents" className="text-[15px] text-accent underline-offset-4 hover:underline">
      All incidents
    </Link>
  );

  if (err)
    return (
      <div className="mx-auto max-w-page px-4 py-10 sm:px-6">
        {back}
        <div className="mt-6 max-w-prose">
          <ErrorNote error={err} hint={`MemOps couldn't load ${id}. It may not exist, or the backend is restarting.`} />
        </div>
      </div>
    );

  if (!inc)
    return (
      <div className="mx-auto max-w-page px-4 py-10 sm:px-6">
        <Spinner label={`Loading ${id}…`} />
      </div>
    );

  const jira = inc.jira_ticket || {};
  const slack = (inc.slack_thread || []).map(parseSlackLine);
  const open = inc.status !== "resolved";

  return (
    <div className="mx-auto max-w-page px-4 pb-20 pt-8 sm:px-6">
      {back}
      {location.state?.added && (
        <p className="mt-4 max-w-prose bg-accent-wash px-4 py-3 text-accent-strong" role="status">
          Added to memory. Alerts that look like this one will now find it.
        </p>
      )}

      <header className="mt-5 border-b border-rule pb-6">
        <h1 className="text-[2.25rem] font-semibold tracking-tight leading-tight">{humanize(inc.alert_name)}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[15px] text-muted">
          <span className="font-mono text-[14px]">{inc.incident_id}</span>
          <span>{inc.service_affected}</span>
          <span>{fmtDate(inc.timestamp)}</span>
          <Severity severity={inc.severity} />
          <Status status={inc.status} />
        </div>
      </header>

      <div className="mt-8 grid gap-12 lg:grid-cols-[1fr_18rem]">
        <article className="min-w-0 max-w-[44rem]">
          <Section title="How it was fixed">
            <p className="border-l-4 border-accent pl-5 text-[1.2rem] leading-relaxed">{inc.fix_applied}</p>
          </Section>

          <Section title="What broke">
            <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-term-line bg-term-bg px-4 py-3 font-mono text-[13px] leading-relaxed text-[#FCA5A5]">
              {inc.error_log}
            </pre>
          </Section>

          {slack.length > 0 && (
            <Section title="How it unfolded">
              <ol className="relative border-l border-rule">
                {slack.map((m, i) => (
                  <li key={i} className="relative pb-4 pl-6 last:pb-0">
                    <span className="absolute -left-[5px] top-2 h-2.5 w-2.5 rounded-full border-2 border-paper bg-muted" aria-hidden />
                    <div className="text-sm text-muted">
                      <span className="tabular-nums">{m.time}</span>
                      {m.who && <span className="ml-2 font-bold text-ink">{m.who}</span>}
                    </div>
                    <p className="text-[15px]">{m.text}</p>
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {(jira.id || (inc.git_commits || []).length > 0) && (
            <Section title="Ticket and code changes">
              {jira.id && (
                <p className="text-[15px]">
                  <span className="font-bold">{jira.id}</span> {jira.title}
                  {jira.resolution && <span className="block text-sm text-muted">{jira.resolution}</span>}
                </p>
              )}
              {(inc.git_commits || []).length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {inc.git_commits.map((c, i) => (
                    <li key={i} className="font-mono text-[13px] text-accent">{c}</li>
                  ))}
                </ul>
              )}
            </Section>
          )}
        </article>

        <aside className="space-y-10">
          <dl className="divide-y divide-rule border-y border-rule text-[15px]">
            <Fact label="Engineer">{inc.engineer_name || "Unknown"}</Fact>
            <Fact label="Time to fix">
              {inc.resolution_time_minutes != null ? `${inc.resolution_time_minutes} min` : "Not recorded"}
            </Fact>
            <Fact label="Outcome"><span className="capitalize">{inc.outcome}</span></Fact>
          </dl>

          <div>
            {learned ? (
              <p className="bg-accent-wash px-4 py-3 text-sm text-accent-strong" role="status">
                Saved. MemOps re-learned this incident
                {learned.graph_strengthened?.edges_after != null &&
                  ` (${learned.graph_strengthened.edges_before} to ${learned.graph_strengthened.edges_after} links)`}
                .
              </p>
            ) : (
              <>
                <Button variant={open ? "primary" : "quiet"} onClick={relearn} disabled={saving} className="w-full">
                  {saving && <ButtonSpinner />}
                  {saving ? "Saving" : open ? "Mark as fixed" : "Re-learn this incident"}
                </Button>
                <p className="mt-2 text-sm text-muted">
                  {open
                    ? "Records the fix above as what worked, so MemOps suggests it next time."
                    : "Runs this incident through memory again to strengthen its links."}
                </p>
              </>
            )}
            {saveErr && <div className="mt-3"><ErrorNote error={saveErr} /></div>}
          </div>

          <div>
            <h2 className="text-lg font-bold">Also on {inc.service_affected}</h2>
            {related.length === 0 ? (
              <p className="mt-2 text-[15px] text-muted">No other incidents on this service.</p>
            ) : (
              <ul className="mt-2 divide-y divide-rule border-y border-rule">
                {related.map((r) => (
                  <li key={r.incident_id}>
                    <Link to={`/incidents/${r.incident_id}`} className="flex items-start gap-3 py-2.5 hover:text-accent">
                      <span className="mt-2 h-2 w-2 shrink-0 rounded-full" style={{ background: sevColor(r.severity) }} aria-hidden />
                      <span>
                        <span className="block text-[15px] font-bold">{humanize(r.alert_name)}</span>
                        <span className="block text-sm text-muted">{r.incident_id}, {fmtDate(r.timestamp)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
