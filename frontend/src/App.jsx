import { Routes, Route, NavLink, Link, Navigate } from "react-router-dom";
import Ask from "./pages/Ask.jsx";
import Incidents from "./pages/Incidents.jsx";
import IncidentDetail from "./pages/IncidentDetail.jsx";
import AddIncident from "./pages/AddIncident.jsx";
import MemoryMap from "./pages/MemoryMap.jsx";

function TopBar() {
  const linkCls = ({ isActive }) =>
    `py-1 text-[15px] border-b-2 transition-colors ${
      isActive ? "border-teal text-ink font-bold" : "border-transparent text-muted hover:text-ink"
    }`;
  return (
    <header className="border-b border-rule bg-paper">
      <div className="mx-auto flex max-w-page flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-4 sm:px-6">
        <Link to="/" className="text-xl font-bold tracking-tight text-ink">
          MemOps
        </Link>
        <nav className="flex items-center gap-5 sm:gap-7" aria-label="Main">
          <NavLink to="/" end className={linkCls}>
            Ask
          </NavLink>
          <NavLink to="/incidents" className={linkCls}>
            Incidents
          </NavLink>
          <NavLink to="/map" className={linkCls}>
            Memory map
          </NavLink>
        </nav>
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
            className="text-teal underline-offset-4 hover:underline"
          >
            Source on GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
