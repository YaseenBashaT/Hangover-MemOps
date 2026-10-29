import { fmtDate, humanize, sevColor } from "../../api.js";

/**
 * The card beside a hovered or pinned incident, shared by the map views.
 * `at` is the dot's position inside the map box; on phones the card docks to
 * the bottom of the screen instead.
 */
export default function MapCard({ node, info, shares, pinned, at, box, narrow, onOpen, onClose }) {
  const style =
    !narrow && at && box
      ? { left: Math.max(8, Math.min(at[0] + 24, box.w - 312)), top: Math.max(8, Math.min(at[1] - 20, box.h - 250)) }
      : undefined;
  return (
    <div
      className={
        narrow
          ? "fixed inset-x-3 bottom-3 z-20 rounded-lg border border-rule bg-sheet px-3 py-2.5 text-sm shadow-lg"
          : `absolute z-10 w-[19rem] rounded-lg border border-rule bg-sheet px-3 py-2.5 text-sm shadow-lg ${pinned ? "" : "pointer-events-none"}`
      }
      style={style}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[13px] font-semibold">{node.incident_id}</span>
        <span className="text-xs capitalize" style={{ color: sevColor(node.severity) }}>
          {node.severity}
        </span>
      </div>
      {info && <div className="mt-0.5 font-semibold">{humanize(info.alert_name)}</div>}
      <div className="text-muted">
        {node.service}
        {info?.timestamp && ` · ${fmtDate(info.timestamp)}`}
      </div>
      {shares.length > 0 ? (
        <ul className="mt-2 max-h-40 space-y-1 overflow-auto border-t border-rule pt-2">
          {shares.map(({ other, shared }) => (
            <li key={other.id}>
              Shares <span className="font-semibold">{shared.join(", ")}</span> with{" "}
              <span className="whitespace-nowrap font-mono text-[12.5px]">{other.incident_id}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-1 text-muted">Shares no details with other incidents yet.</div>
      )}
      {pinned ? (
        <div className="mt-2 flex items-center justify-between">
          <button className="font-semibold text-accent underline-offset-4 hover:underline" onClick={() => onOpen(node.incident_id)}>
            Open incident →
          </button>
          <button className="text-xs text-muted hover:text-ink" onClick={onClose}>
            Close
          </button>
        </div>
      ) : (
        <div className="mt-2 text-xs text-muted">Click to pin</div>
      )}
    </div>
  );
}
