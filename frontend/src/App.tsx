import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Subjects from './pages/Subjects';
import Patient360 from './pages/Patient360';
import AskAtlas from './pages/AskAtlas';
import Findings from './pages/Findings';
import Monitor from './pages/Monitor';
import Watch from './pages/Watch';
import DiseaseGraph from './pages/DiseaseGraph';

const navItems = [
  { to: '/', label: 'Dashboard', exact: true },
  { to: '/ask', label: 'ATLAS' },
  { to: '/patient360', label: 'Patient 360' },
  { to: '/disease-graph', label: 'Disease Graph' },
  { to: '/findings', label: 'Findings' },
  { to: '/monitor', label: 'MONITOR' },
  { to: '/watch', label: 'WATCH' },
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
      <div className="min-h-screen flex flex-col bg-white text-slate-900 selection:bg-slate-900 selection:text-white">
        {/* Apple-style White Floating / Sticky Header */}
        <header className="bg-white/90 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-40 transition-all">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-slate-900 rounded-xl flex items-center justify-center text-xs font-black text-white shadow-xs tracking-wider">
                SS
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-base tracking-tight text-slate-950">STUDY SENTINEL</span>
                  <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-slate-200 tracking-wide uppercase">
                    ATLAS + MONITOR + WATCH
                  </span>
                </div>
                <div className="text-slate-500 text-[11px] -mt-0.5 hidden sm:block font-normal">
                  Clinical Trial Intelligence & Multi-Agent Continuous Review Platform
                </div>
              </div>
            </div>

            {/* Navigation Bar with Apple Pill Selection */}
            <nav className="flex items-center flex-wrap gap-1">
              {navItems.map(({ to, label, exact }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={exact}
                  className={({ isActive }) =>
                    `px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
                      isActive
                        ? 'bg-slate-900 text-white shadow-xs font-bold'
                        : 'text-slate-600 hover:text-slate-950 hover:bg-slate-100/80'
                    }`
                  }
                >
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>
        </header>

        {/* Main Content Area - Strictly White Background */}
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8 bg-white">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/subjects" element={<Subjects />} />
            <Route path="/patient360" element={<Patient360 />} />
            <Route path="/patient360/:usubjid" element={<Patient360 />} />
            <Route path="/disease-graph" element={<DiseaseGraph />} />
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

        <footer className="border-t border-slate-200/80 py-4 text-center text-xs text-slate-500 bg-white">
          STUDY SENTINEL · AI-Powered Clinical Trial Intelligence & Multi-Agent Review Platform · Problem 1 (ATLAS) + Problem 2 (MONITOR) + Problem 3 (WATCH)
        </footer>
      </div>
    </BrowserRouter>
  );
}
