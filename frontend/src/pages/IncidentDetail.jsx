import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api, sevColor } from "../api.js";
import { Panel, Spinner, ErrorBox, SeverityBadge, StatusPill } from "../components/ui.jsx";
import MemifyCard from "../components/MemifyCard.jsx";

// STATUS_OPTIONS dropdown removed (P0-e): it was a silent no-op
// that set only local state and reverted on refresh.
// The Approve Fix button is the only way to resolve an incident.

function Field({ label, children }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-0.5 text-sm text-gray-200">{children}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="rounded-lg border border-edge bg-panel2/50 p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
        {title}
      </div>
      {children}
    </div>
  );
}

export default function IncidentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [inc, setInc] = useState(null);
  const [err, setErr] = useState(null);
  const [related, setRelated] = useState([]);
  const [resolving, setResolving] = useState(false);
  const [memify, setMemify] = useState(null);
  const [resolveErr, setResolveErr] = useState(null);

  useEffect(() => {
    let alive = true;
    setInc(null);
    setErr(null);
    setMemify(null);
    setRelated([]);
    (async () => {
      try {
        const data = await api.getIncident(id);
        if (!alive) return;
        setInc(data);
        // related incidents = same service (the graph connects them via the
        // shared service entity) — pulled live, no mock data.
        try {
          const all = await api.listIncidents();
          if (alive)
            setRelated(
              (all.incidents || []).filter(
                (x) =>
                  x.service_affected === data.service_affected &&
                  x.incident_id !== data.incident_id
              )
            );
        } catch {
          /* related is best-effort */
        }
      } catch (e) {
        if (alive) setErr(e.message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  async function approveFix() {
    setResolving(true);
    setResolveErr(null);
    try {
      const res = await api.resolveIncident(id);
      setMemify(res);
      const fresh = await api.getIncident(id);
      setInc(fresh);
    } catch (e) {
      setResolveErr(e.message);
    } finally {
      setResolving(false);
    }
  }

  if (err)
    return (
      <div className="mx-auto max-w-3xl px-5 py-8">
        <ErrorBox error={err} hint="Is the backend running on :8000?" />
        <Link to="/" className="mt-4 inline-block text-sm text-brand hover:underline">
          ← Back to dashboard
        </Link>
      </div>
    );

  if (!inc)
    return (
      <div className="mx-auto max-w-3xl px-5 py-8">
        <Spinner label={`Loading ${id}…`} />
      </div>
    );

  const jira = inc.jira_ticket || {};

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-6">
      <button onClick={() => navigate(-1)} className="mb-3 text-sm text-gray-400 hover:text-white">
        ← Back
      </button>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-semibold text-white">{inc.incident_id}</h1>
        <SeverityBadge severity={inc.severity} />
        <StatusPill status={inc.status} />
        <span className="text-sm text-gray-400">{inc.alert_name}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        {/* LEFT — full incident info */}
        <div className="space-y-4">
          <Panel title="Overview">
            <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3">
              <Field label="Service">{inc.service_affected}</Field>
              <Field label="Severity">
                <span className="capitalize">{inc.severity}</span>
              </Field>
              <Field label="Engineer">{inc.engineer_name}</Field>
              <Field label="Date">{inc.timestamp}</Field>
              <Field label="Resolution time">
                {inc.resolution_time_minutes != null ? `${inc.resolution_time_minutes} min` : "—"}
              </Field>
              <Field label="Outcome">
                <span className="capitalize">{inc.outcome}</span>
              </Field>
            </div>
          </Panel>

          <Section title="Error Log">
            <pre className="overflow-auto rounded-md bg-ink/70 p-3 font-mono text-xs text-red-300">
              {inc.error_log}
            </pre>
          </Section>

          <Section title="Fix Applied">
            <p className="text-sm leading-relaxed text-gray-200">{inc.fix_applied}</p>
          </Section>

          {(inc.slack_thread || []).length > 0 && (
            <Section title="Slack Thread">
              <div className="space-y-1.5">
                {inc.slack_thread.map((line, i) => (
                  <div key={i} className="rounded-md bg-ink/50 px-3 py-1.5 font-mono text-xs text-gray-300">
                    {line}
                  </div>
                ))}
              </div>
            </Section>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Section title="Jira Ticket">
              {jira.id ? (
                <div className="space-y-1">
                  <div className="font-mono text-sm text-brand">{jira.id}</div>
                  <div className="text-sm text-gray-200">{jira.title}</div>
                  <div className="text-xs text-gray-400">{jira.resolution}</div>
                </div>
              ) : (
                <div className="text-sm text-gray-500">None</div>
              )}
            </Section>

            <Section title="Git Commits">
              {(inc.git_commits || []).length ? (
                <div className="space-y-1.5">
                  {inc.git_commits.map((c, i) => (
                    <div key={i} className="rounded-md bg-ink/50 px-2.5 py-1.5 font-mono text-xs text-green-300">
                      {c}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500">None</div>
              )}
            </Section>
          </div>
        </div>

        {/* RIGHT — status + related + memify */}
        <div className="space-y-4">
          <Panel title="Status Update">
            <div className="space-y-4 p-4">
              {/* P0-e: removed silent no-op dropdown; show current status read-only */}
              <div>
                <div className="mb-1.5 text-[11px] uppercase tracking-wide text-gray-500">
                  Current status
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill status={inc.status} />
                  <span className="text-sm capitalize text-gray-300">{inc.status}</span>
                </div>
              </div>

              <button
                onClick={approveFix}
                disabled={resolving}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-green-500 disabled:opacity-40"
              >
                {resolving && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                )}
                {resolving ? "Reinforcing memory…" : "Approve Fix → Resolve & Reinforce"}
              </button>
              <p className="text-[11px] leading-relaxed text-gray-500">
                Approving marks the incident resolved and runs{" "}
                <span className="font-mono text-gray-400">improve()</span> to reinforce the graph.
              </p>
              {resolveErr && <ErrorBox error={resolveErr} />}
            </div>
          </Panel>

          <Panel title={`Related Incidents (${related.length})`}>
            <div className="max-h-72 space-y-2 overflow-auto p-3">
              {related.length === 0 && (
                <div className="px-1 text-sm text-gray-500">
                  No other incidents on this service.
                </div>
              )}
              {related.map((r) => (
                <button
                  key={r.incident_id}
                  onClick={() => navigate(`/incidents/${r.incident_id}`)}
                  className="flex w-full items-center gap-2 rounded-md border border-edge bg-panel2/60 px-3 py-2 text-left transition hover:border-brand/50"
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: sevColor(r.severity) }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-xs text-gray-200">
                      {r.incident_id}
                    </span>
                    <span className="block truncate text-[11px] text-gray-500">
                      {r.alert_name}
                    </span>
                  </span>
                  <StatusPill status={r.status} />
                </button>
              ))}
            </div>
          </Panel>

          {memify && (
            <MemifyCard result={memify} onOpenRelated={(rid) => navigate(`/incidents/${rid}`)} />
          )}
        </div>
      </div>
    </div>
  );
}
