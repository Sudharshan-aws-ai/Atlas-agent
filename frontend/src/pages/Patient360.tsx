import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { Patient360 as P360 } from '../types';
import { Spinner, ErrorMessage, Badge, Tabs, Table } from '../components';

const d = (v: unknown): string => (v == null || v === '') ? '—' : String(v);

export default function Patient360() {
  const { usubjid: paramId } = useParams();
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState(paramId || '');
  const [data, setData] = useState<P360 | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('labs');

  const load = (id: string) => {
    if (!id.trim()) return;
    setLoading(true);
    setError(null);
    api.patient360(id.trim())
      .then(dat => { setData(dat); setActiveTab('labs'); })
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (paramId) load(paramId);
  }, [paramId]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      navigate(`/patient360/${searchInput.trim().toUpperCase()}`);
    }
  };

  const tabs = data ? [
    { id: 'labs', label: 'Laboratory', count: data.laboratory.length },
    { id: 'aes', label: 'Adverse Events', count: data.adverse_events.length },
    { id: 'ex', label: 'Doses', count: data.exposure.length },
    { id: 'cm', label: 'ConMeds', count: data.concomitant_medications.length },
    { id: 'vs', label: 'Vitals', count: data.vital_signs.length },
    { id: 'ecg', label: 'ECG', count: data.ecg.length },
    { id: 'ds', label: 'Disposition', count: data.disposition.length },
    { id: 'mh', label: 'Med History', count: data.medical_history.length },
  ] : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Patient 360°</h1>
        <p className="text-sm text-gray-500 mt-1">Full subject dossier across all clinical domains</p>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-3">
        <input
          type="text"
          placeholder="Enter Subject ID (e.g. 042-S01-001)"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
        />
        <button type="submit" className="btn-primary">Load Subject</button>
      </form>

      {loading && <div className="flex justify-center py-16"><Spinner size="lg" /></div>}
      {error && <ErrorMessage message={error} />}

      {data && !loading && (
        <div className="space-y-6">
          {/* Demographics card */}
          <div className="card">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-2xl font-bold font-mono text-blue-800">{data.usubjid}</div>
                <div className="text-sm text-gray-500 mt-0.5">{data.initials} · Site {data.siteid}</div>
              </div>
              <div className="flex gap-2">
                <Badge variant={data.arm?.toUpperCase() === 'DRUG' ? 'blue' : 'gray'}>
                  {data.arm}
                </Badge>
                {data.is_duplicate_enrollment && <Badge variant="yellow">Duplicate Enrollment</Badge>}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              {[
                { label: 'Age', value: data.age != null ? `${data.age} yrs` : '—' },
                { label: 'Sex', value: data.sex || '—' },
                { label: 'Screening HbA1c', value: data.screening_hba1c != null ? `${data.screening_hba1c}%` : '—' },
                { label: 'First Dose', value: data.first_dose_date || '—' },
                { label: 'Protocol Version', value: `v${data.applicable_protocol_version}` },
                { label: 'Active Cut', value: String(data.active_cut ?? 'All') },
                { label: 'Visits', value: data.visits.join(', ') || '—' },
                { label: 'Duplicate Of', value: data.duplicate_of || 'N/A' },
              ].map(item => (
                <div key={item.label}>
                  <div className="text-xs text-gray-400 font-medium">{item.label}</div>
                  <div className="text-gray-800 font-semibold mt-0.5">{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Tabs */}
          <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

          {/* Tab content */}
          {activeTab === 'labs' && (
            <Table
              columns={[
                { key: 'seq', label: '#' },
                { key: 'visit', label: 'Visit', render: v => d(v) },
                { key: 'date', label: 'Date', render: v => d(v) },
                { key: 'test', label: 'Test' },
                { key: 'result', label: 'Result' },
                { key: 'unit', label: 'Unit', render: v => d(v) },
                {
                  key: 'normalized',
                  label: 'Numeric',
                  render: (v) => {
                    const n = v as P360['laboratory'][0]['normalized'];
                    if (n.is_not_detected) return <Badge variant="gray">ND</Badge>;
                    if (n.is_less_than) return `<${n.numeric_value}`;
                    return n.numeric_value != null ? String(n.numeric_value) : '—';
                  }
                },
              ]}
              rows={data.laboratory as unknown as Record<string, unknown>[]}
              emptyMsg="No laboratory records."
            />
          )}

          {activeTab === 'aes' && (
            <Table
              columns={[
                { key: 'seq', label: '#' },
                { key: 'term', label: 'AE Term' },
                {
                  key: 'severity',
                  label: 'Severity',
                  render: v => {
                    const s = String(v || '').toUpperCase();
                    return <Badge variant={s === 'SEVERE' ? 'red' : s === 'MODERATE' ? 'yellow' : 'gray'}>{String(v || '—')}</Badge>;
                  }
                },
                {
                  key: 'is_serious',
                  label: 'Serious',
                  render: v => v ? <Badge variant="red">YES</Badge> : <Badge variant="gray">No</Badge>
                },
                {
                  key: 'is_miscoded',
                  label: 'Miscoded SAE',
                  render: v => v ? <Badge variant="red">⚠ MISCODED</Badge> : <span>—</span>
                },
                { key: 'start_date', label: 'Start', render: v => d(v) },
                { key: 'end_date', label: 'End', render: v => d(v) },
                { key: 'outcome', label: 'Outcome', render: v => d(v) },
              ]}
              rows={data.adverse_events as unknown as Record<string, unknown>[]}
              emptyMsg="No adverse events."
            />
          )}

          {activeTab === 'ex' && (
            <Table
              columns={[
                { key: 'seq', label: '#' },
                { key: 'visit', label: 'Visit', render: v => d(v) },
                { key: 'date', label: 'Date', render: v => d(v) },
                { key: 'treatment', label: 'Treatment', render: v => d(v) },
                {
                  key: 'dose',
                  label: 'Dose',
                  render: (v, row) => {
                    const dose = v as number | null;
                    const arm = (data.arm || '').toUpperCase();
                    const expected = arm === 'DRUG' ? 10 : 0;
                    const isError = dose != null && dose !== expected;
                    return (
                      <span className={isError ? 'text-red-600 font-bold' : ''}>
                        {dose != null ? dose : '—'} {d(row.unit)} {isError && '⚠'}
                      </span>
                    );
                  }
                },
              ]}
              rows={data.exposure as unknown as Record<string, unknown>[]}
              emptyMsg="No exposure records."
            />
          )}

          {activeTab === 'cm' && (
            <Table
              columns={[
                { key: 'seq', label: '#' },
                { key: 'treatment', label: 'Drug', render: v => d(v) },
                { key: 'class', label: 'Class', render: v => d(v) },
                { key: 'indication', label: 'Indication', render: v => d(v) },
                { key: 'start_date', label: 'Start', render: v => d(v) },
              ]}
              rows={data.concomitant_medications as unknown as Record<string, unknown>[]}
              emptyMsg="No concomitant medications."
            />
          )}

          {activeTab === 'vs' && (
            <Table
              columns={[
                { key: 'seq', label: '#' },
                { key: 'visit', label: 'Visit', render: v => d(v) },
                { key: 'date', label: 'Date', render: v => d(v) },
                { key: 'test', label: 'Test', render: v => d(v) },
                { key: 'value', label: 'Value', render: v => d(v) },
                { key: 'unit', label: 'Unit', render: v => d(v) },
              ]}
              rows={data.vital_signs as unknown as Record<string, unknown>[]}
              emptyMsg="No vital signs."
            />
          )}

          {activeTab === 'ecg' && (
            <Table
              columns={[
                { key: 'seq', label: '#' },
                { key: 'visit', label: 'Visit', render: v => d(v) },
                { key: 'date', label: 'Date', render: v => d(v) },
                { key: 'test', label: 'Test', render: v => d(v) },
                { key: 'value', label: 'Value', render: v => d(v) },
                { key: 'unit', label: 'Unit', render: v => d(v) },
              ]}
              rows={data.ecg as unknown as Record<string, unknown>[]}
              emptyMsg="No ECG records."
            />
          )}

          {activeTab === 'ds' && (
            <Table
              columns={[
                { key: 'seq', label: '#' },
                { key: 'status', label: 'Status', render: v => d(v) },
                { key: 'date', label: 'Date', render: v => d(v) },
                { key: 'reason', label: 'Reason', render: v => d(v) },
              ]}
              rows={data.disposition as unknown as Record<string, unknown>[]}
              emptyMsg="No disposition records."
            />
          )}

          {activeTab === 'mh' && (
            <Table
              columns={[
                { key: 'seq', label: '#' },
                { key: 'term', label: 'Medical History Term', render: v => d(v) },
              ]}
              rows={data.medical_history as unknown as Record<string, unknown>[]}
              emptyMsg="No medical history."
            />
          )}
        </div>
      )}

      {!data && !loading && !error && (
        <div className="text-center py-20 text-gray-400">
          <div className="text-4xl mb-3">🔍</div>
          <p>Enter a subject ID to view their full 360° dossier.</p>
        </div>
      )}
    </div>
  );
}
