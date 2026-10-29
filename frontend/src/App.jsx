import { useState } from "react";
import { Routes, Route, NavLink, Link, Navigate } from "react-router-dom";
import Ask from "./pages/Ask.jsx";
import Incidents from "./pages/Incidents.jsx";
import IncidentDetail from "./pages/IncidentDetail.jsx";
import AddIncident from "./pages/AddIncident.jsx";
import MemoryMap from "./pages/MemoryMap.jsx";
import About from "./pages/About.jsx";

function ThemeToggle() {
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
      title={dark ? "Light theme" : "Dark theme"}
      className="grid h-9 w-9 place-items-center rounded-md border border-rule text-muted transition-colors hover:border-faint hover:text-ink"
    >
      {dark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}

function TopBar() {
  const linkCls = ({ isActive }) =>
    `rounded-md px-2.5 py-1.5 text-[15px] transition-colors ${
      isActive ? "bg-raise font-semibold text-ink" : "text-muted hover:text-ink"
    }`;
  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-paper/85 backdrop-blur">
      <div className="mx-auto flex max-w-page flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5 font-mono text-[17px] font-semibold tracking-tight text-ink">
          <span className="live-dot h-2 w-2 rounded-full bg-accent" aria-hidden />
          memops
        </Link>
        <div className="flex items-center gap-1 sm:gap-3">
          <nav className="flex items-center gap-0.5 sm:gap-1" aria-label="Main">
            <NavLink to="/" end className={linkCls}>
              Ask
            </NavLink>
            <NavLink to="/incidents" className={linkCls}>
              Incidents
            </NavLink>
            <NavLink to="/map" className={linkCls}>
              Map
            </NavLink>
            <NavLink to="/about" className={linkCls}>
              About
            </NavLink>
          </nav>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <div className="flex min-h-screen flex-col">
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
      <footer className="border-t border-rule">
        <div className="mx-auto max-w-page px-4 py-5 text-sm text-muted sm:px-6">
          MemOps keeps every resolved incident in a knowledge graph, so the next person
          on call starts from what worked last time.{" "}
          <a
            href="https://github.com/YaseenBashaT/Hangover-MemOps"
            className="text-accent underline-offset-4 hover:underline"
          >
            Source on GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
