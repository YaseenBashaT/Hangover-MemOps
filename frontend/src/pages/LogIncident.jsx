import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { Panel, Spinner, ErrorBox } from "../components/ui.jsx";

/**
 * P1-a: Log Incident page — makes remember() visible in the UI.
 * A judge can submit a new incident and watch the graph grow.
 * Demo arc: remember() grows the graph → recall() finds it → improve() learns.
 */

const SEVERITIES = ["critical", "high", "medium", "low"];

const EMPTY = {
  incident_id: "",
  alert_name: "",
  service_affected: "",
  severity: "high",
  timestamp: new Date().toISOString().slice(0, 16),
  error_log: "",
  fix_applied: "",
  engineer_name: "",
  slack_thread_raw: "",
  outcome: "resolved",
  resolution_time_minutes: "",
};

function Field({ label, required, children }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] uppercase tracking-wide text-gray-500">
        {label}{required && <span className="ml-1 text-red-400">*</span>}
      </label>
      {children}
    </div>
  );
}

export default function LogIncident() {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  function set(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function inputCls(multiline) {
    const base =
      "w-full rounded-lg border border-edge bg-ink/60 px-3 py-2 text-sm text-gray-200 outline-none focus:border-brand/60";
    return multiline ? `${base} resize-y` : base;
  }

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    // Client-side validation
    if (!form.incident_id.match(/^INC-\d{4}-\d+$/)) {
      setErr("Incident ID must match INC-YYYY-NNNN (e.g. INC-2026-0042)");
      return;
    }
    if (!form.alert_name || !form.service_affected || !form.error_log || !form.fix_applied) {
      setErr("Alert name, service, error log, and fix applied are required.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        incident_id: form.incident_id.trim(),
        alert_name: form.alert_name.trim(),
        service_affected: form.service_affected.trim(),
        severity: form.severity,
        timestamp: form.timestamp
          ? new Date(form.timestamp).toISOString()
          : new Date().toISOString(),
        error_log: form.error_log.trim(),
        fix_applied: form.fix_applied.trim(),
        engineer_name: form.engineer_name.trim() || "unknown",
        slack_thread: form.slack_thread_raw
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean),
        outcome: form.outcome,
        resolution_time_minutes: form.resolution_time_minutes
          ? parseInt(form.resolution_time_minutes, 10)
          : null,
      };
      const result = await api.logIncident(payload);
      const newId = result?.incident?.incident_id || payload.incident_id;
      // Navigate to dashboard, highlighting the new incident so the graph visibly grows.
      navigate("/", { state: { reinforced: [newId], at: Date.now() } });
    } catch (e) {
      setErr(e.message);
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-6">
      <button onClick={() => navigate(-1)} className="mb-4 text-sm text-gray-400 hover:text-white">
        ← Back
      </button>

      <div className="mb-5">
        <h1 className="text-xl font-semibold text-white">Log New Incident</h1>
        <p className="mt-1 text-sm text-gray-400">
          Stores this incident in Cognee's graph via{" "}
          <span className="font-mono text-brand">remember()</span>. Watch the
          node appear in the Knowledge Graph after submitting.
        </p>
      </div>

      <form onSubmit={submit}>
        <Panel title="Incident Details">
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Incident ID" required>
              <input
                value={form.incident_id}
                onChange={(e) => set("incident_id", e.target.value)}
                placeholder="INC-2026-0042"
                className={inputCls()}
              />
            </Field>

            <Field label="Alert Name" required>
              <input
                value={form.alert_name}
                onChange={(e) => set("alert_name", e.target.value)}
                placeholder="connection pool exhausted"
                className={inputCls()}
              />
            </Field>

            <Field label="Service Affected" required>
              <input
                value={form.service_affected}
                onChange={(e) => set("service_affected", e.target.value)}
                placeholder="payments-api"
                className={inputCls()}
              />
            </Field>

            <Field label="Severity" required>
              <select
                value={form.severity}
                onChange={(e) => set("severity", e.target.value)}
                className={inputCls()}
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s} className="capitalize">{s}</option>
                ))}
              </select>
            </Field>

            <Field label="Timestamp">
              <input
                type="datetime-local"
                value={form.timestamp}
                onChange={(e) => set("timestamp", e.target.value)}
                className={inputCls()}
              />
            </Field>

            <Field label="Engineer Name">
              <input
                value={form.engineer_name}
                onChange={(e) => set("engineer_name", e.target.value)}
                placeholder="alex.chen"
                className={inputCls()}
              />
            </Field>

            <Field label="Outcome">
              <select
                value={form.outcome}
                onChange={(e) => set("outcome", e.target.value)}
                className={inputCls()}
              >
                <option value="resolved">resolved</option>
                <option value="rolled-back">rolled-back</option>
                <option value="escalated">escalated</option>
                <option value="open">open</option>
              </select>
            </Field>

            <Field label="Resolution Time (minutes)">
              <input
                type="number"
                value={form.resolution_time_minutes}
                onChange={(e) => set("resolution_time_minutes", e.target.value)}
                placeholder="45"
                min="0"
                className={inputCls()}
              />
            </Field>

            <div className="sm:col-span-2">
              <Field label="Error Log" required>
                <textarea
                  rows={4}
                  value={form.error_log}
                  onChange={(e) => set("error_log", e.target.value)}
                  placeholder="ERROR: HikariPool-1 - Connection is not available, request timed out after 30000ms..."
                  className={inputCls(true)}
                />
              </Field>
            </div>

            <div className="sm:col-span-2">
              <Field label="Fix Applied" required>
                <textarea
                  rows={3}
                  value={form.fix_applied}
                  onChange={(e) => set("fix_applied", e.target.value)}
                  placeholder="Increased connection pool max-size from 20 to 50..."
                  className={inputCls(true)}
                />
              </Field>
            </div>

            <div className="sm:col-span-2">
              <Field label="Slack Thread (one message per line)">
                <textarea
                  rows={3}
                  value={form.slack_thread_raw}
                  onChange={(e) => set("slack_thread_raw", e.target.value)}
                  placeholder={"@oncall payments-api is throwing errors\n@alex.chen investigating now…"}
                  className={inputCls(true)}
                />
              </Field>
            </div>
          </div>
        </Panel>

        {err && (
          <div className="mt-4">
            <ErrorBox error={err} />
          </div>
        )}

        <div className="mt-4 flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand/80 disabled:opacity-40"
          >
            {loading && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            )}
            {loading ? "Storing in memory…" : "Log Incident (remember())"}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            disabled={loading}
            className="rounded-md border border-edge px-5 py-2.5 text-sm text-gray-400 hover:text-white disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
        <p className="mt-2 text-[11px] text-gray-600">
          This calls <span className="font-mono">POST /api/incidents</span> →{" "}
          <span className="font-mono">cognee.remember()</span>. Ingest takes ~10–20s.
        </p>
      </form>
    </div>
  );
}
