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
    {
      id: 'monitor',
      label: 'MONITOR Surveillance',
      count: ((data.monitor?.findings?.length || 0) + (data.monitor?.queries?.length || 0) + (data.monitor?.escalations?.length || 0)),
    },
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

          {/* Clinical Safety Finding Card */}
          {data.findings && data.findings.length > 0 && (
            <div className="card bg-rose-50 border border-rose-200 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">⚠️</span>
                <h3 className="font-bold text-rose-900 text-sm uppercase tracking-wider">
                  Active Clinical Safety Finding
                </h3>
              </div>
              {data.findings.map((f, i) => (
                <div key={i} className="space-y-2 text-xs">
                  <div className="font-bold text-rose-950 text-sm">{f.title}</div>
                  <p className="text-rose-900">{f.description}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                    {f.transaminase && (
                      <div className="bg-white p-2 rounded border border-rose-200">
                        <div className="text-gray-500 font-medium">Transaminase Finding</div>
                        <div className="font-mono font-bold text-rose-900 mt-0.5">{f.transaminase}</div>
                      </div>
                    )}
                    {f.bilirubin && (
                      <div className="bg-white p-2 rounded border border-rose-200">
                        <div className="text-gray-500 font-medium">Bilirubin Finding</div>
                        <div className="font-mono font-bold text-rose-900 mt-0.5">{f.bilirubin}</div>
                      </div>
                    )}
                  </div>
                  {f.evidence && f.evidence.length > 0 && (
                    <div className="pt-1 text-gray-700">
                      <span className="font-bold text-rose-950">Supporting Evidence: </span>
                      <span className="font-mono font-bold text-rose-800">{f.evidence.join(' + ')}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

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

          {activeTab === 'monitor' && (
            <div className="space-y-6">
              {/* Findings */}
              <div className="card space-y-3">
                <div className="flex items-center justify-between border-b pb-2">
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <span>1. ATLAS Clinical Findings & Evidence</span>
                    <span className="text-xs font-normal text-gray-500">
                      ({data.monitor?.findings?.length || 0} detected)
                    </span>
                  </h3>
                </div>
                {(!data.monitor?.findings || data.monitor.findings.length === 0) ? (
                  <div className="text-xs text-gray-400 italic py-3">No active ATLAS findings for this subject.</div>
                ) : (
                  <div className="space-y-3">
                    {data.monitor.findings.map((f, i) => {
                      const sev = (f.severity || '').toUpperCase();
                      const isSerious = ['CRITICAL', 'HIGH', 'SERIOUS'].includes(sev);
                      const isMod = ['MEDIUM', 'MODERATE'].includes(sev);
                      return (
                        <div
                          key={i}
                          className={`p-3.5 rounded-lg border ${
                            isSerious
                              ? 'bg-rose-50/70 border-rose-200'
                              : isMod
                              ? 'bg-amber-50/70 border-amber-200'
                              : 'bg-emerald-50/70 border-emerald-200'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-gray-900">{f.finding_code}</span>
                            <span
                              className={`text-xs px-2 py-0.5 rounded font-bold ${
                                isSerious
                                  ? 'bg-red-600 text-white'
                                  : isMod
                                  ? 'bg-yellow-500 text-gray-900'
                                  : 'bg-green-600 text-white'
                              }`}
                            >
                              {isSerious ? '🔴 SERIOUS / CRITICAL' : isMod ? '🟡 MODERATE' : '🟢 NORMAL / LOW'}
                            </span>
                          </div>
                          <p className="text-xs text-gray-800 font-medium mt-1.5">{f.rationale}</p>
                          <div className="text-[11px] text-gray-600 mt-2 font-mono flex items-center gap-2">
                            <span className="font-semibold">Evidence:</span>
                            {f.evidence?.map((ev, idx) => (
                              <span key={idx} className="bg-white border px-1.5 py-0.5 rounded text-blue-800">
                                {ev.domain} seq {ev.seq}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Queries */}
              <div className="card space-y-3">
                <div className="flex items-center justify-between border-b pb-2">
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <span>2. Data Manager EDC Queries</span>
                    <span className="text-xs font-normal text-gray-500">
                      ({data.monitor?.queries?.length || 0} tracked)
                    </span>
                  </h3>
                </div>
                {(!data.monitor?.queries || data.monitor.queries.length === 0) ? (
                  <div className="text-xs text-gray-400 italic py-3">No EDC queries issued for this subject.</div>
                ) : (
                  <div className="space-y-2.5">
                    {data.monitor.queries.map((q, i) => (
                      <div key={i} className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-xs text-indigo-900">
                            {q.query_id} · {q.domain} seq {q.seq}
                          </span>
                          <span
                            className={`text-[10px] font-extrabold px-2 py-0.5 rounded ${
                              q.reply_status === 'CLOSED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {q.reply_status}
                          </span>
                        </div>
                        <div className="text-xs text-gray-800 font-medium">{q.question}</div>
                        {q.reply_text && (
                          <div className="text-[11px] text-gray-600 bg-white p-2 rounded border border-gray-200">
                            <span className="font-bold text-gray-700">Site Reply: </span>
                            {q.reply_text}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Escalations & Human Gate Decisions */}
              <div className="card space-y-3">
                <div className="flex items-center justify-between border-b pb-2">
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <span>3. Escalations & Human Gate Adjudications</span>
                    <span className="text-xs font-normal text-gray-500">
                      ({data.monitor?.escalations?.length || 0} escalations, {data.monitor?.decisions?.length || 0} decisions)
                    </span>
                  </h3>
                </div>
                {(!data.monitor?.escalations || data.monitor.escalations.length === 0) && (!data.monitor?.decisions || data.monitor.decisions.length === 0) ? (
                  <div className="text-xs text-gray-400 italic py-3">No escalations or Human Gate decisions recorded.</div>
                ) : (
                  <div className="space-y-2.5">
                    {data.monitor?.escalations?.map((e, i) => (
                      <div key={i} className="p-3 bg-purple-50/70 border border-purple-200 rounded-lg space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-xs text-purple-900">{e.escalation_id}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-200 text-purple-900">
                            {e.status || 'PENDING'}
                          </span>
                        </div>
                        <div className="text-xs text-gray-800">{e.summary}</div>
                        <div className="text-[11px] text-gray-600 font-medium">Reason: {e.reason_for_escalation}</div>
                      </div>
                    ))}
                    {data.monitor?.decisions?.map((d, i) => (
                      <div key={i} className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-xs text-blue-900">{d.decision_id}</span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              d.outcome === 'APPROVED'
                                ? 'bg-blue-600 text-white'
                                : d.outcome === 'REJECTED'
                                ? 'bg-amber-600 text-white'
                                : 'bg-purple-600 text-white'
                            }`}
                          >
                            {d.outcome}
                          </span>
                        </div>
                        <div className="text-xs text-gray-800">{d.reason}</div>
                        {d.resubmission_outcome && (
                          <div className="text-[11px] text-emerald-800 font-semibold">
                            Resubmission: {d.resubmission_outcome}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions Executed */}
              <div className="card space-y-3">
                <div className="flex items-center justify-between border-b pb-2">
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <span>4. Executed Safety Interventions</span>
                    <span className="text-xs font-normal text-gray-500">
                      ({data.monitor?.actions?.length || 0} actions)
                    </span>
                  </h3>
                </div>
                {(!data.monitor?.actions || data.monitor.actions.length === 0) ? (
                  <div className="text-xs text-gray-400 italic py-3">No actions executed for this subject.</div>
                ) : (
                  <div className="space-y-2">
                    {data.monitor.actions.map((act, i) => (
                      <div key={i} className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg flex items-center justify-between">
                        <div>
                          <div className="font-mono font-bold text-xs text-emerald-900">{act.action_type}</div>
                          <div className="text-xs text-gray-800 mt-0.5">{act.detail}</div>
                        </div>
                        <span className="text-emerald-700 text-sm font-bold">✓</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
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
