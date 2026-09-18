import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Subjects from './pages/Subjects';
import Patient360 from './pages/Patient360';
import AskAtlas from './pages/AskAtlas';
import Findings from './pages/Findings';

const navItems = [
  { to: '/', label: 'Dashboard', exact: true },
  { to: '/subjects', label: 'Subjects' },
  { to: '/patient360', label: 'Patient 360' },
  { to: '/ask', label: 'Ask ATLAS' },
  { to: '/findings', label: 'Findings' },
];

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        {/* Top nav */}
        <header className="bg-blue-900 text-white shadow-lg">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-400 rounded-lg flex items-center justify-center text-xs font-bold">A</div>
              <div>
                <span className="font-bold text-lg tracking-tight">ATLAS</span>
                <span className="text-blue-300 text-xs ml-2">Study Sentinel · SCOPE 2026</span>
              </div>
            </div>
            <nav className="flex items-center gap-1">
              {navItems.map(({ to, label, exact }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={exact}
                  className={({ isActive }) =>
                    `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-blue-700 text-white'
                        : 'text-blue-100 hover:bg-blue-800 hover:text-white'
                    }`
                  }
                >
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/subjects" element={<Subjects />} />
            <Route path="/patient360" element={<Patient360 />} />
            <Route path="/patient360/:usubjid" element={<Patient360 />} />
            <Route path="/ask" element={<AskAtlas />} />
            <Route path="/findings" element={<Findings />} />
          </Routes>
        </main>

        <footer className="border-t border-gray-200 py-3 text-center text-xs text-gray-400">
          ATLAS · Study Sentinel · VIT Vellore SCOPE Hackathon 2026 · Built with FastAPI + React + Tailwind
        </footer>
      </div>
    </BrowserRouter>
  );
}
