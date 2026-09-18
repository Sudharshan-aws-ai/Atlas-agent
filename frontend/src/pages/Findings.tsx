import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { FindingsResponse } from '../types';
import { Spinner, ErrorMessage, Badge, Tabs, SectionHeading, Table } from '../components';

export default function Findings() {
  const [data, setData] = useState<FindingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('hys');

  useEffect(() => {
    api.findings()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-24"><Spinner size="lg" /></div>;
  if (error) return <ErrorMessage message={error} />;
  if (!data) return null;

  const { summary } = data;

  const tabs = [
    { id: 'hys', label: "Hy's Law", count: summary.hys_law_count },
    { id: 'dosing', label: 'Dosing Errors', count: summary.dosing_error_count },
    { id: 'sae', label: 'Miscoded SAEs', count: summary.miscoded_sae_count },
    { id: 'meds', label: 'Prohibited Meds', count: summary.prohibited_med_count },
    { id: 'dup', label: 'Duplicate Enroll.', count: summary.duplicate_enrollment_count },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Clinical Findings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Rule-engine findings — derived deterministically from study data per Protocol STUDY-042
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Hy's Law", val: summary.hys_law_count, color: 'red' as const, tab: 'hys' },
          { label: 'Dosing Errors', val: summary.dosing_error_count, color: 'red' as const, tab: 'dosing' },
          { label: 'Miscoded SAEs', val: summary.miscoded_sae_count, color: 'yellow' as const, tab: 'sae' },
          { label: 'Prohibited Meds', val: summary.prohibited_med_count, color: 'yellow' as const, tab: 'meds' },
          { label: 'Dup. Enrollments', val: summary.duplicate_enrollment_count, color: 'yellow' as const, tab: 'dup' },
        ].map(item => (
          <button
            key={item.tab}
            onClick={() => setActiveTab(item.tab)}
            className={`rounded-xl border p-4 text-left transition-all hover:shadow-md ${
              activeTab === item.tab ? 'ring-2 ring-blue-500 shadow-sm' : ''
            } ${item.color === 'red' ? 'bg-red-50 border-red-100' : 'bg-yellow-50 border-yellow-100'}`}
          >
            <div className={`text-2xl font-bold ${item.color === 'red' ? 'text-red-700' : 'text-yellow-700'}`}>
              {item.val}
            </div>
            <div className="text-xs font-semibold text-gray-600 mt-1">{item.label}</div>
          </button>
        ))}
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {/* Hys Law */}
      {activeTab === 'hys' && (
        <div className="space-y-4">
          <SectionHeading>
            🔴 Hy's Law Candidates
          </SectionHeading>
          <p className="text-sm text-gray-500">
            Subjects with (ALT or AST &gt; 3× ULN) AND (Total Bilirubin &gt; 2× ULN) within 14 days,
            not excluded by elevated screening transaminases. Protocol §7.
          </p>
          {data.hys_law_candidates.length === 0 ? (
            <div className="text-sm text-gray-400 italic py-8 text-center">No Hy's law candidates at current cut.</div>
          ) : (
            <div className="space-y-4">
              {data.hys_law_candidates.map((h, i) => (
                <div key={i} className="card border-l-4 border-red-400">
                  <div className="flex items-center justify-between">
                    <div className="font-mono font-bold text-blue-700 text-lg">{h.usubjid}</div>
                    <Link to={`/patient360/${h.usubjid}`} className="text-xs text-blue-500 hover:underline">
                      View 360° →
                    </Link>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-gray-400 text-xs">Transaminase</span>
                      <div className="font-semibold">
                        {h.transaminase} · <span className="text-red-600">{h.transaminase_multiple?.toFixed(1)}× ULN</span>
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-400 text-xs">Bilirubin</span>
                      <div className="font-semibold">
                        BILI · <span className="text-red-600">{h.bilirubin_multiple?.toFixed(1)}× ULN</span>
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-400 text-xs">Days Apart</span>
                      <div className="font-semibold">{h.day_difference} days</div>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-gray-600 bg-gray-50 rounded p-2">{h.rationale}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Dosing Errors */}
      {activeTab === 'dosing' && (
        <div className="space-y-4">
          <SectionHeading>⚠ Dosing Errors</SectionHeading>
          <p className="text-sm text-gray-500">
            DRUG arm: expected 10 mg. PLACEBO arm: expected 0 mg. Protocol §8.
          </p>
          <Table
            columns={[
              {
                key: 'usubjid', label: 'Subject ID',
                render: (v) => (
                  <Link to={`/patient360/${v}`} className="font-mono text-blue-700 hover:underline">{v as string}</Link>
                )
              },
              { key: 'arm', label: 'Arm', render: v => <Badge variant={v === 'DRUG' ? 'blue' : 'gray'}>{v as string || '—'}</Badge> },
              { key: 'visit', label: 'Visit' },
              {
                key: 'actual_dose', label: 'Actual Dose',
                render: (v, row) => <span className="text-red-600 font-bold">{v as number} {row.dose_unit as string}</span>
              },
              { key: 'date', label: 'Date', render: v => String(v ?? '—') },
            ]}
            rows={data.dosing_errors as unknown as Record<string, unknown>[]}
            emptyMsg="No dosing errors found."
          />
        </div>
      )}

      {/* Miscoded SAEs */}
      {activeTab === 'sae' && (
        <div className="space-y-4">
          <SectionHeading>⚠ Miscoded Serious Adverse Events</SectionHeading>
          <p className="text-sm text-gray-500">
            AESHOSP=Y but AESER=N. Hospitalisation flag overrides AESER coding. Protocol §6.
          </p>
          <Table
            columns={[
              {
                key: 'usubjid', label: 'Subject ID',
                render: (v) => (
                  <Link to={`/patient360/${v}`} className="font-mono text-blue-700 hover:underline">{v as string}</Link>
                )
              },
              { key: 'ae_term', label: 'AE Term' },
              {
                key: 'severity', label: 'Severity',
                render: v => {
                  const s = String(v || '').toUpperCase();
                  return <Badge variant={s === 'SEVERE' ? 'red' : s === 'MODERATE' ? 'yellow' : 'gray'}>{v as string || '—'}</Badge>;
                }
              },
              { key: 'aeshosp', label: 'AESHOSP', render: v => <Badge variant="red">{v as string}</Badge> },
              { key: 'aeser_coded', label: 'AESER coded', render: v => <Badge variant="yellow">{v as string}</Badge> },
              { key: 'ae_seq', label: 'AE Seq' },
            ]}
            rows={data.miscoded_saes as unknown as Record<string, unknown>[]}
            emptyMsg="No miscoded SAEs found."
          />
        </div>
      )}

      {/* Prohibited Meds */}
      {activeTab === 'meds' && (
        <div className="space-y-4">
          <SectionHeading>⚠ Prohibited Concomitant Medications</SectionHeading>
          <p className="text-sm text-gray-500">
            v1/v2: Systemic Glucocorticoids. v3: + Sulfonylureas. Protocol §5.
          </p>
          <Table
            columns={[
              {
                key: 'usubjid', label: 'Subject ID',
                render: (v) => (
                  <Link to={`/patient360/${v}`} className="font-mono text-blue-700 hover:underline">{v as string}</Link>
                )
              },
              { key: 'drug', label: 'Drug' },
              { key: 'drug_class', label: 'Drug Class' },
              { key: 'indication', label: 'Indication', render: v => String(v ?? '—') },
              { key: 'date', label: 'Date', render: v => String(v ?? '—') },
            ]}
            rows={data.prohibited_medications as unknown as Record<string, unknown>[]}
            emptyMsg="No prohibited medications found."
          />
        </div>
      )}

      {/* Duplicate Enrollments */}
      {activeTab === 'dup' && (
        <div className="space-y-4">
          <SectionHeading>⚠ Duplicate Enrollments</SectionHeading>
          <p className="text-sm text-gray-500">
            Subjects sharing the same initials, birth date, and sex enrolled at different sites.
          </p>
          <Table
            columns={[
              {
                key: 'usubjid', label: 'Subject ID',
                render: (v) => (
                  <Link to={`/patient360/${v}`} className="font-mono text-blue-700 hover:underline">{v as string}</Link>
                )
              },
              {
                key: 'duplicate_of', label: 'Duplicate Of',
                render: (v) => (
                  <Link to={`/patient360/${v}`} className="font-mono text-yellow-700 hover:underline">{v as string}</Link>
                )
              },
            ]}
            rows={data.duplicate_enrollments as unknown as Record<string, unknown>[]}
            emptyMsg="No duplicate enrollments found."
          />
        </div>
      )}
    </div>
  );
}
