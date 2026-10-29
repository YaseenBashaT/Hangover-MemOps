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

// Small line icons (Lucide-style paths), sized to sit beside 14px text.
const ICONS = {
  terminal: <><path d="m4 17 6-6-6-6" /><path d="M12 19h8" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>,
  map: <><circle cx="6" cy="7" r="2.5" /><circle cx="17" cy="6" r="2.5" /><circle cx="12" cy="17" r="2.5" /><path d="m8 8.5 2.8 6.5M14.6 7l-1.7 7.6M8.5 7l6-.8" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  code: <><path d="m16 18 6-6-6-6" /><path d="m8 6-6 6 6 6" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></>,
  alert: <><path d="M12 3 2 20h20L12 3z" /><path d="M12 10v4M12 17h.01" /></>,
};

export function Icon({ name, size = 16, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden
    >
      {ICONS[name]}
    </svg>
  );
}
