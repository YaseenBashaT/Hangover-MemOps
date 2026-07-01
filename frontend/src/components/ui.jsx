import { sevColor } from "../api.js";

// Render lightweight **bold** markdown (the LLM emits it) as real <strong>.
export function BoldText({ text }) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="font-semibold text-gray-100">
            {p.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

export function Panel({ title, right, children, className = "" }) {
  return (
    <div
      className={`rounded-xl border border-edge bg-panel/60 ${className}`}
    >
      {(title || right) && (
        <div className="flex items-center justify-between border-b border-edge px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300">
            {title}
          </h2>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function Spinner({ label = "Loading…" }) {
  return (
    <div className="flex items-center gap-2 text-sm text-gray-400">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-600 border-t-brand" />
      {label}
    </div>
  );
}

export function ErrorBox({ error, hint }) {
  return (
    <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
      <div className="font-semibold">Couldn’t reach the backend</div>
      <div className="mt-1 text-red-200/80">{String(error)}</div>
      {hint && <div className="mt-1 text-xs text-red-200/60">{hint}</div>}
    </div>
  );
}

export function SeverityBadge({ severity }) {
  const c = sevColor(severity);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: `${c}22`, color: c, border: `1px solid ${c}55` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
      <span className="capitalize">{severity || "n/a"}</span>
    </span>
  );
}

export function StatusPill({ status }) {
  const resolved = status === "resolved";
  const c = resolved ? "#22c55e" : "#eab308";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: `${c}22`, color: c, border: `1px solid ${c}55` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
      <span className="capitalize">{status || "open"}</span>
    </span>
  );
}
