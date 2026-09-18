import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Subjects from './pages/Subjects';
import Patient360 from './pages/Patient360';
import AskAtlas from './pages/AskAtlas';
import Findings from './pages/Findings';
import Monitor from './pages/Monitor';
import Watch from './pages/Watch';

const navItems = [
  { to: '/', label: 'Dashboard', exact: true },
  { to: '/ask', label: 'ATLAS' },
  { to: '/patient360', label: 'Patient 360' },
  { to: '/findings', label: 'Findings' },
  { to: '/monitor', label: 'MONITOR' },
  { to: '/human-gate', label: 'Human Gate' },
  { to: '/queries', label: 'Queries' },
  { to: '/escalations', label: 'Escalations' },
  { to: '/compliance', label: 'Compliance' },
  { to: '/review-reports', label: 'Review Reports' },
  { to: '/trace', label: 'Trace' },
  { to: '/memory', label: 'Memory' },
];

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col bg-slate-50">
        {/* Top Header */}
        <header className="bg-slate-900 text-white shadow-lg border-b border-slate-800 sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-lg flex items-center justify-center text-xs font-black text-white shadow-md">
                SS
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-base tracking-tight text-white">ATLAS-AGENT </span>
                  <span className="bg-blue-800 text-[10px] font-bold px-1.5 py-0.5 rounded text-blue-200 uppercase tracking-wide">
                    ATLAS + MONITOR
                  </span>
                </div>
                <div className="text-slate-400 text-[11px] -mt-0.5 hidden sm:block">
                  AI-Powered Clinical Trial Intelligence & Multi-Agent Review Platform
                </div>
              </div>
            </div>

            {/* Navigation Bar */}
            <nav className="flex items-center flex-wrap gap-1">
              {navItems.map(({ to, label, exact }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={exact}
                  className={({ isActive }) =>
                    `px-2.5 py-1.5 rounded-md text-xs font-bold transition-all ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`
                  }
                >
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/subjects" element={<Subjects />} />
            <Route path="/patient360" element={<Patient360 />} />
            <Route path="/patient360/:usubjid" element={<Patient360 />} />
            <Route path="/ask" element={<AskAtlas />} />
            <Route path="/findings" element={<Findings />} />
            <Route path="/monitor" element={<Monitor defaultTab="dashboard" />} />
            <Route path="/human-gate" element={<Monitor defaultTab="humangate" />} />
            <Route path="/queries" element={<Monitor defaultTab="queries" />} />
            <Route path="/escalations" element={<Monitor defaultTab="escalations" />} />
            <Route path="/compliance" element={<Monitor defaultTab="compliance" />} />
            <Route path="/review-reports" element={<Monitor defaultTab="reports" />} />
            <Route path="/trace" element={<Monitor defaultTab="audittrail" />} />
            <Route path="/memory" element={<Monitor defaultTab="memory" />} />
            <Route path="/watch" element={<Watch />} />
          </Routes>
        </main>

        <footer className="border-t border-slate-200 py-3.5 text-center text-xs text-slate-500 bg-white">
          STUDY SENTINEL · AI-Powered Clinical Trial Intelligence & Multi-Agent Review Platform · VIT Vellore SCOPE Hackathon 2026 · Built on ATLAS + MONITOR
        </footer>
      </div>
    </BrowserRouter>
  );
}
