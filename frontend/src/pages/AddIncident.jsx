import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, forgetIncidents } from "../api.js";
import { Button, ButtonSpinner, ErrorNote } from "../components/ui.jsx";

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

const INPUT =
  "w-full rounded-md border border-rule bg-sheet px-3 py-2 text-[15px] text-ink outline-none focus:border-accent";

function Field({ label, hint, required, wide, children }) {
  return (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="text-[15px] font-bold">
        {label}
        {!required && <span className="ml-1.5 font-normal text-muted">optional</span>}
      </span>
      {hint && <span className="block text-sm text-muted">{hint}</span>}
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}

function Group({ title, children }) {
  return (
    <fieldset className="border-t border-rule pt-6">
      <legend className="sr-only">{title}</legend>
      <h2 className="text-lg font-bold" aria-hidden>{title}</h2>
      <div className="mt-4 grid gap-5 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export default function AddIncident() {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    if (!form.incident_id.match(/^INC-\d{4}-\d+$/)) {
      setErr({ hint: "Use the INC-YYYY-NNNN format for the incident ID, for example INC-2026-0042." });
      return;
    }
    if (!form.alert_name || !form.service_affected || !form.error_log || !form.fix_applied) {
      setErr({ hint: "Fill in the alert, the service, the error and the fix. MemOps needs all four to match future alerts." });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        incident_id: form.incident_id.trim(),
        alert_name: form.alert_name.trim(),
        service_affected: form.service_affected.trim(),
        severity: form.severity,
        timestamp: form.timestamp ? new Date(form.timestamp).toISOString() : new Date().toISOString(),
        error_log: form.error_log.trim(),
        fix_applied: form.fix_applied.trim(),
        engineer_name: form.engineer_name.trim() || "unknown",
        slack_thread: form.slack_thread_raw.split("\n").map((l) => l.trim()).filter(Boolean),
        outcome: form.outcome,
        resolution_time_minutes: form.resolution_time_minutes ? parseInt(form.resolution_time_minutes, 10) : null,
      };
      const result = await api.logIncident(payload);
      forgetIncidents();
      const newId = result?.incident?.incident_id || payload.incident_id;
      navigate(`/incidents/${newId}`, { state: { added: true } });
    } catch (e) {
      setErr({ error: e.message });
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-page px-4 pb-20 pt-8 sm:px-6 lg:px-10">
      <Link to="/incidents" className="text-[15px] text-accent underline-offset-4 hover:underline">
        All incidents
      </Link>
      <div className="mt-5 max-w-[44rem]">
        <h1 className="text-[2.25rem] font-semibold tracking-tight leading-tight">Add an incident</h1>
        <p className="mt-2 text-muted">
          Record a resolved incident so the next alert like it gets this fix as an answer.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-8" noValidate>
          <Group title="What broke">
            <Field label="Incident ID" required>
              <input value={form.incident_id} onChange={set("incident_id")} placeholder="e.g. INC-2026-0042" className={INPUT} />
            </Field>
            <Field label="Service" required>
              <input value={form.service_affected} onChange={set("service_affected")} placeholder="e.g. payments-api" className={INPUT} />
            </Field>
            <Field label="Alert" required>
              <input value={form.alert_name} onChange={set("alert_name")} placeholder="e.g. connection pool exhausted" className={INPUT} />
            </Field>
            <Field label="Severity" required>
              <select value={form.severity} onChange={set("severity")} className={INPUT}>
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </Field>
            <Field label="Error" hint="Paste the log line or message that showed the problem." required wide>
              <textarea rows={3} value={form.error_log} onChange={set("error_log")} placeholder="e.g. HikariPool-1 - Connection is not available, request timed out after 30000ms" className={`${INPUT} resize-y font-mono text-[13px]`} />
            </Field>
          </Group>

          <Group title="How it was fixed">
            <Field label="Fix" hint="What actually made it go away." required wide>
              <textarea rows={3} value={form.fix_applied} onChange={set("fix_applied")} placeholder="e.g. Raised the connection pool from 20 to 50 and restarted the service" className={`${INPUT} resize-y`} />
            </Field>
            <Field label="Engineer">
              <input value={form.engineer_name} onChange={set("engineer_name")} placeholder="e.g. alex.chen" className={INPUT} />
            </Field>
            <Field label="Minutes to fix">
              <input type="number" min="0" value={form.resolution_time_minutes} onChange={set("resolution_time_minutes")} placeholder="e.g. 45" className={INPUT} />
            </Field>
            <Field label="Outcome" required>
              <select value={form.outcome} onChange={set("outcome")} className={INPUT}>
                <option value="resolved">Resolved</option>
                <option value="rolled-back">Rolled back</option>
                <option value="escalated">Escalated</option>
                <option value="open">Still open</option>
              </select>
            </Field>
            <Field label="When it happened">
              <input type="datetime-local" value={form.timestamp} onChange={set("timestamp")} className={INPUT} />
            </Field>
          </Group>

          <Group title="Chat history">
            <Field label="Slack thread" hint="One message per line." wide>
              <textarea rows={4} value={form.slack_thread_raw} onChange={set("slack_thread_raw")} placeholder={"e.g. [03:17] alex.chen: on it, checking the pool"} className={`${INPUT} resize-y`} />
            </Field>
          </Group>

          {err &&
            (err.error ? (
              <ErrorNote error={err.error} hint="MemOps couldn't save the incident. Check the ID isn't already used, then try again." />
            ) : (
              <ErrorNote title="Some details are missing" hint={err.hint} />
            ))}

          <div className="flex flex-wrap items-center gap-4 border-t border-rule pt-6">
            <Button type="submit" disabled={saving}>
              {saving && <ButtonSpinner />}
              {saving ? "Adding" : "Add incident"}
            </Button>
            <span className="text-sm text-muted">
              {saving ? "MemOps is reading it into the graph. This takes about half a minute." : "Takes about half a minute."}
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}
