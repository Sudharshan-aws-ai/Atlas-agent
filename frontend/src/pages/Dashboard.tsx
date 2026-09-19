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

  if (loading) return <div className="flex justify-center py-24 bg-white"><Spinner size="lg" /></div>;
  if (error) return <ErrorMessage message={error} />;
  if (!stats) return null;

  const domainCounts = [
    { name: 'Labs', count: stats.lab_records, color: '#0284c7' },
    { name: 'AEs', count: stats.ae_records, color: '#e11d48' },
    { name: 'Doses', count: stats.ex_records, color: '#059669' },
    { name: 'ConMeds', count: stats.cm_records, color: '#d97706' },
    { name: 'Vitals', count: stats.vs_records, color: '#7c3aed' },
    { name: 'ECG', count: stats.eg_records, color: '#0891b2' },
    { name: 'Med Hx', count: stats.mh_records, color: '#ea580c' },
    { name: 'Dispostn', count: stats.ds_records, color: '#65a30d' },
  ];

  const domainSummaryList = [
    {
      code: 'DM',
      name: 'Demographics / Subjects',
      count: stats.subjects_covered,
      desc: 'Subject demographics, enrollment details & baseline parameters',
      accent: 'border-l-sky-500',
    },
    {
      code: 'AE',
      name: 'Adverse Events',
      count: stats.ae_records,
      desc: 'Reported adverse events, severity classifications & serious flags',
      accent: 'border-l-rose-500',
    },
    {
      code: 'LB',
      name: 'Laboratory Results',
      count: stats.lab_records,
      desc: 'Safety chemistry, transaminases, bilirubin & laboratory panels',
      accent: 'border-l-blue-600',
    },
    {
      code: 'VS',
      name: 'Vital Signs',
      count: stats.vs_records,
      desc: 'Systolic/diastolic blood pressure, pulse, temperature & BMI',
      accent: 'border-l-violet-500',
    },
    {
      code: 'EX',
      name: 'Exposure / Dosing',
      count: stats.ex_records,
      desc: 'Investigational product dose administration & visit dates',
      accent: 'border-l-emerald-500',
    },
    {
      code: 'CM',
      name: 'Concomitant Medications',
      count: stats.cm_records,
      desc: 'Prior & concomitant therapies, medication classes & indications',
      accent: 'border-l-amber-500',
    },
    {
      code: 'DS',
      name: 'Disposition',
      count: stats.ds_records,
      desc: 'Trial completion milestones & primary discontinuation reasons',
      accent: 'border-l-lime-600',
    },
    {
      code: 'MH',
      name: 'Medical History',
      count: stats.mh_records,
      desc: 'Baseline medical conditions & pre-existing clinical history',
      accent: 'border-l-orange-500',
    },
    {
      code: 'EG',
      name: 'Electrocardiogram (ECG)',
      count: stats.eg_records,
      desc: 'Cardiac intervals, QT/QTc evaluations & rhythm analysis',
      accent: 'border-l-cyan-600',
    },
  ];

  return (
    <div className="space-y-8 bg-white">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200/80 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Study Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1 font-normal">
            Knowledge graph built in <strong className="font-semibold text-slate-800">{stats.build_time_seconds}s</strong> ·
            Protocol <span className="font-semibold text-slate-800">v{stats.protocol_version}</span> · Cut <span className="font-semibold text-slate-800">{stats.cut_used}</span> ·{' '}
            <span className="text-emerald-700 font-medium">{stats.corrections_applied} lab corrections applied</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/ask" className="btn-primary text-xs">
            <span>Ask ATLAS</span>
            <span>→</span>
          </Link>
          <Link to="/watch" className="btn-secondary text-xs">
            <span>WATCH Surveillance</span>
          </Link>
        </div>
      </div>

      {/* Key metrics in clean white StatCards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <StatCard label="Subjects" value={stats.subjects_covered} sub={`${stats.sites_count} investigational sites`} color="blue" />
        <StatCard label="Graph Nodes" value={stats.nodes} sub="Multi-relational graph" color="purple" />
        <StatCard label="Graph Edges" value={stats.edges} sub="Indexed relationships" color="gray" />
        <StatCard label="Total Records" value={stats.records_indexed} sub="Across all 9 CDISC domains" color="green" />
        <StatCard label="Unique Individuals" value={stats.unique_individuals} sub={`${stats.duplicate_enrollments_detected} duplicate enrollment(s)`} color="yellow" />
        <StatCard label="Lab Records" value={stats.lab_records} sub="LB domain measurements" color="blue" />
        <StatCard label="Adverse Events" value={stats.ae_records} sub="AE safety reporting" color="red" />
        <StatCard label="Dosing Records" value={stats.ex_records} sub="EX exposure compliance" color="green" />
      </div>

      {/* Domain Summary Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <SectionHeading
            title="Domain Summary"
            subtitle="CDISC Clinical Data Interchange Standards Consortium standardized domains"
          />
          <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
            9 CDISC Domains Indexed
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {domainSummaryList.map(dom => (
            <div
              key={dom.code}
              className={`bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs border-l-4 ${dom.accent} flex flex-col justify-between hover:shadow-md hover:border-slate-300 transition-all duration-200`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md border tracking-wider uppercase inline-block bg-slate-50 text-slate-800 border-slate-200">
                    {dom.code}
                  </span>
                  <div className="text-sm font-bold text-slate-900 mt-2">
                    {dom.name}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black text-slate-900 font-mono">
                    {dom.count.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-slate-400 font-medium">
                    records
                  </div>
                </div>
              </div>
              <div className="text-xs text-slate-500 mt-3.5 pt-2.5 border-t border-slate-100 leading-relaxed">
                {dom.desc}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Charts row in pure white cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs">
          <SectionHeading
            title="Records by Domain"
            subtitle="Volume distribution across active study domains"
          />
          <div className="h-[250px] w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={domainCounts} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    borderColor: '#e2e8f0',
                    borderRadius: '12px',
                    boxShadow: '0 4px 20px -2px rgba(0,0,0,0.08)',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {domainCounts.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <SectionHeading
              title="Investigational Sites"
              subtitle="Active trial centers and study protocol metadata"
            />
            <div className="flex flex-wrap gap-2 mt-3">
              {stats.sites.map(site => (
                <Link
                  key={site}
                  to={`/subjects?site=${site}`}
                  className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-800 rounded-lg text-xs font-semibold border border-slate-200 transition-colors"
                >
                  {site}
                </Link>
              ))}
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-slate-100 space-y-2.5 text-xs text-slate-600 font-medium">
            <div className="flex justify-between items-center">
              <span>Protocol Version</span>
              <span className="font-bold font-mono text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">v{stats.protocol_version}</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Active Cut</span>
              <span className="font-bold font-mono text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">Cut {stats.cut_used}</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Lab Corrections Applied</span>
              <span className="font-bold font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">{stats.corrections_applied}</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Duplicate Enrollments</span>
              <span className="font-bold font-mono text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">{stats.duplicate_enrollments_detected}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs">
        <SectionHeading
          title="Quick Navigation & Workflows"
          subtitle="Direct access to clinical review and surveillance interfaces"
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mt-4">
          <Link to="/ask" className="btn-primary justify-center py-2.5 text-xs">Ask ATLAS</Link>
          <Link to="/disease-graph" className="btn-secondary justify-center py-2.5 text-xs">Disease Graph</Link>
          <Link to="/findings" className="btn-secondary justify-center py-2.5 text-xs">Findings</Link>
          <Link to="/monitor" className="btn-secondary justify-center py-2.5 text-xs">MONITOR Crew</Link>
          <Link to="/watch" className="btn-secondary justify-center py-2.5 text-xs">WATCH Engine</Link>
          <Link to="/patient360" className="btn-secondary justify-center py-2.5 text-xs">Patient 360</Link>
        </div>
      </div>
    </div>
  );
}
