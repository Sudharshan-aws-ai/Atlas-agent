import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import type { SubjectSummary } from '../types';
import { Spinner, ErrorMessage, Badge } from '../components';

export default function Subjects() {
  const [subjects, setSubjects] = useState<SubjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchParams] = useSearchParams();
  const siteFilter = searchParams.get('site') || '';

  useEffect(() => {
    setLoading(true);
    api.subjects(siteFilter || undefined)
      .then(setSubjects)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [siteFilter]);

  if (loading) return <div className="flex justify-center py-24"><Spinner size="lg" /></div>;
  if (error) return <ErrorMessage message={error} />;

  const filtered = subjects.filter(s =>
    !search ||
    s.usubjid.toLowerCase().includes(search.toLowerCase()) ||
    s.siteid.toLowerCase().includes(search.toLowerCase()) ||
    s.arm.toLowerCase().includes(search.toLowerCase()) ||
    s.initials.toLowerCase().includes(search.toLowerCase())
  );

  // Aggregate stats from current list
  const drugCount = filtered.filter(s => s.arm?.toUpperCase() === 'DRUG').length;
  const placeboCount = filtered.filter(s => s.arm?.toUpperCase() === 'PLACEBO').length;
  const dupCount = filtered.filter(s => s.is_duplicate).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Subject List</h1>
          <p className="text-sm text-gray-500 mt-1">
            {filtered.length} subjects{siteFilter ? ` at site ${siteFilter}` : ''} ·{' '}
            {drugCount} DRUG · {placeboCount} PLACEBO
            {dupCount > 0 && ` · ${dupCount} duplicate enrollment(s)`}
          </p>
        </div>
      </div>

      {/* Search + filter */}
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Search by subject ID, site, arm, initials…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {siteFilter && (
          <Link to="/subjects" className="btn-secondary">Clear site filter</Link>
        )}
      </div>

      {/* Subjects table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="table-th">Subject ID</th>
              <th className="table-th">Site</th>
              <th className="table-th">Arm</th>
              <th className="table-th">Initials</th>
              <th className="table-th">Age</th>
              <th className="table-th">Sex</th>
              <th className="table-th">HbA1c</th>
              <th className="table-th">Flags</th>
              <th className="table-th">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map(s => (
              <tr key={s.usubjid} className="hover:bg-blue-50 transition-colors">
                <td className="table-td font-mono font-semibold text-blue-700">{s.usubjid}</td>
                <td className="table-td">{s.siteid}</td>
                <td className="table-td">
                  <Badge variant={s.arm?.toUpperCase() === 'DRUG' ? 'blue' : 'gray'}>
                    {s.arm || '—'}
                  </Badge>
                </td>
                <td className="table-td">{s.initials || '—'}</td>
                <td className="table-td">{s.age ?? '—'}</td>
                <td className="table-td">{s.sex || '—'}</td>
                <td className="table-td">
                  {s.screening_hba1c != null ? `${s.screening_hba1c}%` : '—'}
                </td>
                <td className="table-td">
                  {s.is_duplicate && <Badge variant="yellow">Dup. Enroll.</Badge>}
                </td>
                <td className="table-td">
                  <Link
                    to={`/patient360/${s.usubjid}`}
                    className="text-blue-600 hover:underline text-xs font-medium"
                  >
                    360° View →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400">No subjects match your search.</div>
        )}
      </div>
    </div>
  );
}
