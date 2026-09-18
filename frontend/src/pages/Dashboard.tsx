import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell
} from 'recharts';
import { api } from '../api';
import type { StudyStats } from '../types';
import { Spinner, ErrorMessage, StatCard, SectionHeading } from '../components';

export default function Dashboard() {
  const [stats, setStats] = useState<StudyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.stats()
      .then(setStats)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-24"><Spinner size="lg" /></div>;
  if (error) return <ErrorMessage message={error} />;
  if (!stats) return null;

  const domainCounts = [
    { name: 'Labs', count: stats.lab_records, color: '#3b82f6' },
    { name: 'AEs', count: stats.ae_records, color: '#ef4444' },
    { name: 'Doses', count: stats.ex_records, color: '#22c55e' },
    { name: 'ConMeds', count: stats.cm_records, color: '#f59e0b' },
    { name: 'Vitals', count: stats.vs_records, color: '#8b5cf6' },
    { name: 'ECG', count: stats.eg_records, color: '#06b6d4' },
    { name: 'Med Hx', count: stats.mh_records, color: '#f97316' },
    { name: 'Dispostn', count: stats.ds_records, color: '#84cc16' },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Study Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          Knowledge graph built in <strong>{stats.build_time_seconds}s</strong> ·
          Protocol v{stats.protocol_version} · Cut {stats.cut_used} ·{' '}
          {stats.corrections_applied} lab corrections applied
        </p>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <StatCard label="Subjects" value={stats.subjects_covered} sub={`${stats.sites_count} sites`} color="blue" />
        <StatCard label="Graph Nodes" value={stats.nodes} sub="Multi-relational" color="purple" />
        <StatCard label="Graph Edges" value={stats.edges} sub="Indexed relationships" color="gray" />
        <StatCard label="Total Records" value={stats.records_indexed} sub="All domains" color="green" />
        <StatCard label="Unique Individuals" value={stats.unique_individuals} sub={`${stats.duplicate_enrollments_detected} duplicate enrollment(s)`} color="yellow" />
        <StatCard label="Lab Records" value={stats.lab_records} sub="LB domain" color="blue" />
        <StatCard label="Adverse Events" value={stats.ae_records} sub="AE domain" color="red" />
        <StatCard label="Dosing Records" value={stats.ex_records} sub="EX domain" color="green" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <SectionHeading>Records by Domain</SectionHeading>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={domainCounts} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {domainCounts.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <SectionHeading>Sites</SectionHeading>
          <div className="flex flex-wrap gap-2">
            {stats.sites.map(site => (
              <Link
                key={site}
                to={`/subjects?site=${site}`}
                className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm font-medium transition-colors"
              >
                {site}
              </Link>
            ))}
          </div>
          <div className="mt-6 space-y-2 text-sm text-gray-600">
            <div className="flex justify-between">
              <span>Protocol Version</span>
              <span className="font-semibold">v{stats.protocol_version}</span>
            </div>
            <div className="flex justify-between">
              <span>Active Cut</span>
              <span className="font-semibold">{stats.cut_used}</span>
            </div>
            <div className="flex justify-between">
              <span>Lab Corrections Applied</span>
              <span className="font-semibold">{stats.corrections_applied}</span>
            </div>
            <div className="flex justify-between">
              <span>Duplicate Enrollments</span>
              <span className="font-semibold text-yellow-700">{stats.duplicate_enrollments_detected}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick links */}
      <div className="card">
        <SectionHeading>Quick Actions</SectionHeading>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link to="/ask" className="btn-primary justify-center py-3">Ask ATLAS</Link>
          <Link to="/findings" className="btn-secondary justify-center py-3">View Findings</Link>
          <Link to="/subjects" className="btn-secondary justify-center py-3">Subject List</Link>
          <Link to="/patient360" className="btn-secondary justify-center py-3">Patient 360</Link>
        </div>
      </div>
    </div>
  );
}
