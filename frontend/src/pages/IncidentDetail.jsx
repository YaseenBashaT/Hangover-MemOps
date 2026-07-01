import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api, sevColor } from "../api.js";
import { Panel, Spinner, ErrorBox, SeverityBadge, StatusPill } from "../components/ui.jsx";

const STATUS_OPTIONS = ["open", "investigating", "resolved", "rolled-back", "escalated"];

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

function MemifyCard({ result, onOpenRelated }) {
  const g = result.graph_strengthened || {};
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

      {(result.reinforced_connections || []).length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-green-200/70">
            Reinforced connections ({result.reinforced_connections.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {result.reinforced_connections.map((c) => (
              <button
                key={c.incident_id}
                onClick={() => onOpenRelated(c.incident_id)}
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

export default function IncidentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [inc, setInc] = useState(null);
  const [err, setErr] = useState(null);
  const [selStatus, setSelStatus] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [memify, setMemify] = useState(null);
  const [resolveErr, setResolveErr] = useState(null);

  useEffect(() => {
    let alive = true;
    setInc(null);
    setErr(null);
    setMemify(null);
    (async () => {
      try {
        const data = await api.getIncident(id);
        if (!alive) return;
        setInc(data);
        setSelStatus(data.status || "open");
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
      setSelStatus("resolved");
      // refresh incident to reflect resolved status
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
      <button
        onClick={() => navigate(-1)}
        className="mb-3 text-sm text-gray-400 hover:text-white"
      >
        ← Back
      </button>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-semibold text-white">
          {inc.incident_id}
        </h1>
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
              <Field label="Timestamp">{inc.timestamp}</Field>
              <Field label="Resolution time">
                {inc.resolution_time_minutes != null
                  ? `${inc.resolution_time_minutes} min`
                  : "—"}
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
            <p className="text-sm leading-relaxed text-gray-200">
              {inc.fix_applied}
            </p>
          </Section>

          {(inc.slack_thread || []).length > 0 && (
            <Section title="Slack Thread">
              <div className="space-y-1.5">
                {inc.slack_thread.map((line, i) => (
                  <div
                    key={i}
                    className="rounded-md bg-ink/50 px-3 py-1.5 font-mono text-xs text-gray-300"
                  >
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
                    <div
                      key={i}
                      className="rounded-md bg-ink/50 px-2.5 py-1.5 font-mono text-xs text-green-300"
                    >
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

        {/* RIGHT — status panel + memify moment */}
        <div className="space-y-4">
          <Panel title="Status Update">
            <div className="space-y-4 p-4">
              <div>
                <div className="mb-2 text-[11px] uppercase tracking-wide text-gray-500">
                  Set status
                </div>
                <div className="flex flex-wrap gap-2">
                  {STATUS_OPTIONS.map((s) => {
                    const active = selStatus === s;
                    return (
                      <button
                        key={s}
                        onClick={() => setSelStatus(s)}
                        className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition ${
                          active
                            ? "bg-brand text-white"
                            : "border border-edge text-gray-400 hover:text-white"
                        }`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={approveFix}
                disabled={resolving}
                className="w-full rounded-md bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-green-500 disabled:opacity-40"
              >
                {resolving
                  ? "Reinforcing memory…"
                  : "Approve Fix → Resolve & Reinforce"}
              </button>
              <p className="text-[11px] leading-relaxed text-gray-500">
                Approving marks the incident resolved and runs{" "}
                <span className="font-mono text-gray-400">improve()</span> to
                reinforce the knowledge graph.
              </p>

              {resolveErr && <ErrorBox error={resolveErr} />}
            </div>
          </Panel>

          {memify && (
            <MemifyCard
              result={memify}
              onOpenRelated={(rid) => navigate(`/incidents/${rid}`)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
