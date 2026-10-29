import { useEffect, useState } from "react";
import { useParams, useLocation, Link } from "react-router-dom";
import { api, fmtDate, humanize, sevColor } from "../api.js";
import { Button, ButtonSpinner, ErrorNote, Icon, Severity, Spinner, Status } from "../components/ui.jsx";

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
    <Link to="/incidents" className="text-[14px] text-muted transition-colors hover:text-accent">
      ← All incidents
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
    <div className="mx-auto max-w-page px-4 pb-20 pt-8 sm:px-6 lg:px-10">
      {back}
      {location.state?.added && (
        <p className="mt-4 max-w-prose bg-accent-wash px-4 py-3 text-accent-strong" role="status">
          Added to memory. Alerts that look like this one will now find it.
        </p>
      )}

      <header className="mt-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[13px] text-muted">
          <span className="text-ink">{inc.incident_id}</span>
          <span aria-hidden>/</span>
          <Link to={`/incidents?service=${encodeURIComponent(inc.service_affected)}`} className="hover:text-accent">
            {inc.service_affected}
          </Link>
        </div>
        <h1 className="mt-2 text-[2.25rem] font-semibold leading-tight tracking-tight">{humanize(inc.alert_name)}</h1>
        <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-rule bg-rule sm:grid-cols-4">
          {[
            ["alert", "Severity", <Severity key="s" severity={inc.severity} />],
            ["clock", "Time to fix", inc.resolution_time_minutes != null ? `${inc.resolution_time_minutes} min` : "Not recorded"],
            ["user", "Engineer", inc.engineer_name || "Unknown"],
            ["calendar", "Happened", fmtDate(inc.timestamp)],
          ].map(([icon, label, value]) => (
            <div key={label} className="bg-sheet px-4 py-3">
              <dt className="flex items-center gap-1.5 text-[13px] text-muted">
                <Icon name={icon} size={14} />
                {label}
              </dt>
              <dd className="mt-1 font-mono text-[15px] font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </header>

      <div className="mt-8 grid gap-12 lg:grid-cols-[1fr_18rem]">
        <article className="min-w-0 max-w-[44rem]">
          <Section title="How it was fixed">
            <p className="rounded-xl border border-accent/30 bg-accent-wash/40 px-5 py-4 text-[1.125rem] leading-relaxed">{inc.fix_applied}</p>
          </Section>

          <Section title="What broke">
            <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-term-line bg-term-bg px-4 py-3 font-mono text-[13px] leading-relaxed text-[#FCA5A5]">
              {inc.error_log}
            </pre>
          </Section>

          {slack.length > 0 && (
            <Section title="How it unfolded">
              <ol className="overflow-hidden rounded-xl border border-rule bg-sheet">
                {slack.map((m, i) => (
                  <li key={i} className="grid grid-cols-[3.25rem_1fr] gap-3 border-b border-rule px-4 py-2.5 last:border-b-0">
                    <span className="pt-0.5 font-mono text-[12px] text-faint">{m.time}</span>
                    <span className="min-w-0 text-[14.5px]">
                      {m.who && <span className="mr-2 font-semibold">{m.who}</span>}
                      <span className="text-muted">{m.text}</span>
                    </span>
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
          <div className="flex items-center justify-between rounded-xl border border-rule bg-sheet px-4 py-3 text-[14px]">
            <span className="text-muted">Status</span>
            <Status status={inc.status} />
          </div>

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
