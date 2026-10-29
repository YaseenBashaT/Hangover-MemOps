import { useEffect, useState } from "react";
import { Routes, Route, NavLink, Link, Navigate } from "react-router-dom";
import Ask from "./pages/Ask.jsx";
import Incidents from "./pages/Incidents.jsx";
import IncidentDetail from "./pages/IncidentDetail.jsx";
import AddIncident from "./pages/AddIncident.jsx";
import MemoryMap from "./pages/MemoryMap.jsx";
import About from "./pages/About.jsx";
import { loadIncidentsOnce, memoryStats } from "./api.js";
import { Icon } from "./components/ui.jsx";

const NAV = [
  ["/", "Ask", "terminal", true],
  ["/incidents", "Incidents", "list"],
  ["/map", "Memory map", "map"],
  ["/about", "About", "info"],
];

function ThemeToggle({ wide }) {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("memops-theme", next ? "dark" : "light");
    } catch {
      // the choice just won't be remembered
    }
    setDark(next);
  }
  return (
    <button
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className={`flex items-center gap-2.5 rounded-md text-muted transition-colors hover:bg-raise hover:text-ink ${
        wide ? "w-full px-3 py-2 text-[14px]" : "h-9 w-9 justify-center border border-rule"
      }`}
    >
      <Icon name={dark ? "sun" : "moon"} />
      {wide && (dark ? "Light theme" : "Dark theme")}
    </button>
  );
}

// "online" once the incident list loads, so the dot means something
function useMemory() {
  const [state, setState] = useState({ status: "loading", stats: null });
  useEffect(() => {
    loadIncidentsOnce()
      .then((d) => setState({ status: "online", stats: memoryStats(d.incidents || []) }))
      .catch(() => setState({ status: "offline", stats: null }));
  }, []);
  return state;
}

function Sidebar() {
  const { status, stats } = useMemory();
  const linkCls = ({ isActive }) =>
    `flex items-center gap-3 rounded-md px-3 py-2 text-[14px] transition-colors ${
      isActive ? "bg-raise font-semibold text-ink" : "text-muted hover:bg-raise/60 hover:text-ink"
    }`;
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-rule bg-sheet lg:flex">
      <Link to="/" className="flex items-center gap-2.5 px-5 pb-6 pt-5 font-mono text-[17px] font-semibold tracking-tight">
        <span className={`h-2 w-2 rounded-full ${status === "offline" ? "bg-sev-critical" : "live-dot bg-accent"}`} aria-hidden />
        memops
      </Link>
      <nav className="flex flex-col gap-0.5 px-3" aria-label="Main">
        {NAV.map(([to, label, icon, end]) => (
          <NavLink key={to} to={to} end={end} className={linkCls}>
            <Icon name={icon} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mx-3 mt-8 rounded-lg border border-rule px-3 py-3">
        <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.14em] text-faint">
          Memory
          <span className={status === "offline" ? "text-sev-critical" : status === "online" ? "text-accent" : ""}>
            {status}
          </span>
        </div>
        {stats ? (
          <dl className="mt-2.5 grid grid-cols-2 gap-y-2.5 text-[13px]">
            <div>
              <dt className="text-faint">Incidents</dt>
              <dd className="font-mono text-[15px] font-semibold">{stats.incidents}</dd>
            </div>
            <div>
              <dt className="text-faint">Services</dt>
              <dd className="font-mono text-[15px] font-semibold">{stats.services}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-faint">Median time to fix</dt>
              <dd className="font-mono text-[15px] font-semibold">{stats.medianFix} min</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-[13px] text-faint">
            {status === "offline" ? "Can't reach the backend right now." : "Loading…"}
          </p>
        )}
      </div>

      <div className="mt-auto space-y-1 border-t border-rule px-3 py-3">
        <Link
          to="/incidents/new"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-[14px] text-muted transition-colors hover:bg-raise hover:text-ink"
        >
          <Icon name="plus" />
          Add incident
        </Link>
        <ThemeToggle wide />
        <a
          href="https://github.com/YaseenBashaT/Hangover-MemOps"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-[14px] text-muted transition-colors hover:bg-raise hover:text-ink"
        >
          <Icon name="code" />
          Source on GitHub
        </a>
      </div>
    </aside>
  );
}

// phones and tablets: a compact top bar in place of the sidebar
function TopBar() {
  const linkCls = ({ isActive }) =>
    `rounded-md px-2.5 py-1.5 text-[14px] transition-colors ${
      isActive ? "bg-raise font-semibold text-ink" : "text-muted hover:text-ink"
    }`;
  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-paper/85 backdrop-blur lg:hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5 font-mono text-[16px] font-semibold tracking-tight">
          <span className="live-dot h-2 w-2 rounded-full bg-accent" aria-hidden />
          memops
        </Link>
        <div className="flex items-center gap-1">
          <nav className="flex items-center" aria-label="Main">
            {NAV.map(([to, label, , end]) => (
              <NavLink key={to} to={to} end={end} className={linkCls}>
                {label === "Memory map" ? "Map" : label}
              </NavLink>
            ))}
          </nav>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Ask />} />
            <Route path="/incidents" element={<Incidents />} />
            <Route path="/incidents/new" element={<AddIncident />} />
            <Route path="/incidents/:id" element={<IncidentDetail />} />
            <Route path="/map" element={<MemoryMap />} />
            <Route path="/about" element={<About />} />
            {/* old link from the previous layout */}
            <Route path="/alert" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
