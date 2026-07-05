import { Routes, Route, NavLink, Link } from "react-router-dom";
import Dashboard from "./pages/Dashboard.jsx";
import NewAlert from "./pages/NewAlert.jsx";
import IncidentDetail from "./pages/IncidentDetail.jsx";
import LogIncident from "./pages/LogIncident.jsx";

function RecallLogo() {
  return (
    <Link to="/" className="flex items-center gap-2 group">
      <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand/20 ring-1 ring-brand/40">
        <span className="absolute h-2.5 w-2.5 rounded-full bg-brand" />
        <span className="absolute h-5 w-5 rounded-full border border-brand/60 group-hover:scale-110 transition-transform" />
      </span>
      <span className="text-lg font-semibold tracking-tight text-gray-100">
        MemOps
      </span>
      <span className="hidden sm:inline text-[10px] uppercase tracking-widest text-gray-500 mt-1">
        SRE memory
      </span>
    </Link>
  );
}

function TopBar() {
  const linkCls = ({ isActive }) =>
    `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
      isActive
        ? "bg-white/10 text-white"
        : "text-gray-400 hover:text-white hover:bg-white/5"
    }`;
  return (
    <header className="sticky top-0 z-20 border-b border-edge bg-ink/80 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between px-5 py-3">
        <RecallLogo />
        <nav className="flex items-center gap-1">
          <NavLink to="/" end className={linkCls}>
            Dashboard
          </NavLink>
          <NavLink to="/alert" className={linkCls}>
            New Alert
          </NavLink>
          {/* P1-a: Log Incident exposes remember() in the UI */}
          <NavLink to="/incidents/new" className={linkCls}>
            Log Incident
          </NavLink>
        </nav>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <TopBar />
      <main className="flex-1 min-h-0">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/alert" element={<NewAlert />} />
          {/* P1-a: new route for logging incidents (remember()) */}
          <Route path="/incidents/new" element={<LogIncident />} />
          <Route path="/incidents/:id" element={<IncidentDetail />} />
        </Routes>
      </main>
    </div>
  );
}
