import { sevColor } from "../api.js";

// Render lightweight **bold** markdown (the LLM emits it) as real <strong>.
export function BoldText({ text }) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="font-bold">
            {p.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

export function Spinner({ label = "Loading…" }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted" role="status">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-rule border-t-accent" />
      {label}
    </div>
  );
}

// Errors say what failed and what to do; they never apologize.
export function ErrorNote({
  error,
  title = "Couldn't reach MemOps",
  hint = "The backend may be restarting. Try again in a minute.",
}) {
  return (
    <div className="border-l-4 border-sev-critical bg-sheet px-4 py-3 text-sm" role="alert">
      <div className="font-bold text-sev-critical">{title}</div>
      <div className="mt-0.5 text-muted">{hint}</div>
      {error && <div className="mt-1 font-mono text-xs text-faint">{String(error)}</div>}
    </div>
  );
}

export function Severity({ severity }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm capitalize" style={{ color: sevColor(severity) }}>
      <span className="h-2 w-2 rounded-full" style={{ background: sevColor(severity) }} aria-hidden />
      {severity || "unknown"}
    </span>
  );
}

export function Status({ status }) {
  const open = status !== "resolved";
  return (
    <span className={`text-sm ${open ? "font-bold text-sev-medium" : "text-muted"}`}>
      {open ? "Open" : "Resolved"}
    </span>
  );
}

const BTN = {
  primary:
    "bg-accent text-accent-on hover:bg-accent-strong disabled:bg-accent/40",
  quiet:
    "border border-rule bg-sheet text-ink hover:border-ink/40 disabled:text-faint",
  text: "text-accent underline-offset-4 hover:underline disabled:text-faint",
};

export function Button({ variant = "primary", className = "", children, ...props }) {
  const pad = variant === "text" ? "" : "px-4 py-2";
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-md text-[15px] font-bold transition-colors disabled:cursor-not-allowed ${pad} ${BTN[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function ButtonSpinner() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent-on/40 border-t-accent-on" />;
}
