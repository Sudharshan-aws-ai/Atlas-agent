import { useState, useEffect } from 'react';
import { api } from '../api';
import { Spinner, ErrorMessage, SectionHeading } from '../components';

interface SignalItem {
  signal_id: string;
  signal_type: string;
  target: string;
  status: 'NEW' | 'CHANGED' | 'REPEATED' | 'PREVIOUSLY_SEEN';
  first_seen_cut: number;
  last_seen_cut: number;
  severity: string;
  description: string;
  rule: string;
  evidence: Array<{ domain: string; usubjid: string; seq: number }>;
  details: Record<string, any>;
}

interface AdversarialItem {
  scenario_id: string;
  category: string;
  target: string;
  confidence: number;
  description: string;
  metric_observed: Record<string, any>;
  evidence: Array<{ domain: string; usubjid: string; seq: number }>;
  defense_action: string;
  rule: string;
}

export default function Watch() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [surveillanceData, setSurveillanceData] = useState<{
    counts: { total: number; new: number; changed: number; repeated: number; previously_seen: number };
    signals: SignalItem[];
  } | null>(null);
  const [adversarialData, setAdversarialData] = useState<AdversarialItem[]>([]);
  const [selectedTrace, setSelectedTrace] = useState<any | null>(null);
  const [cutFrom, setCutFrom] = useState(1);
  const [cutTo, setCutTo] = useState(12);

  const loadData = async (from: number, to: number) => {
    setLoading(true);
    setError(null);
    try {
      const [surv, adv] = await Promise.all([
        api.watchSurveillance(from, to),
        api.watchAdversarial(to),
      ]);
      setSurveillanceData(surv);
      setAdversarialData(adv);
    } catch (err: any) {
      setError(err.message || 'Failed to load WATCH surveillance data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(cutFrom, cutTo);
  }, []);

  const openTrace = async (signalId: string) => {
    try {
      const trace = await api.watchExplain(signalId);
      setSelectedTrace(trace);
    } catch (err: any) {
      alert(`Error loading trace: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-indigo-600 inline-block"></span>
            WATCH — Longitudinal Surveillance & Adversarial Defense
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Tracks signals across cuts (NEW, CHANGED, REPEATED, PREVIOUSLY_SEEN) & defends against data falsification and injections.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-600">From Cut:</label>
          <select
            value={cutFrom}
            onChange={e => {
              const f = Number(e.target.value);
              setCutFrom(f);
              loadData(f, cutTo);
            }}
            className="border border-gray-300 rounded px-2 py-1 text-xs bg-white"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(c => (
              <option key={c} value={c}>Cut {c}</option>
            ))}
          </select>
          <label className="text-xs font-semibold text-gray-600">To Cut:</label>
          <select
            value={cutTo}
            onChange={e => {
              const t = Number(e.target.value);
              setCutTo(t);
              loadData(cutFrom, t);
            }}
            className="border border-gray-300 rounded px-2 py-1 text-xs bg-white"
          >
            {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(c => (
              <option key={c} value={c}>Cut {c}</option>
            ))}
          </select>
          <button
            onClick={() => loadData(cutFrom, cutTo)}
            disabled={loading}
            className="btn-primary text-xs px-3 py-1.5"
          >
            {loading ? <Spinner size="sm" /> : 'Run Surveillance'}
          </button>
        </div>
      </div>

      {error && <ErrorMessage message={error} />}

      {/* Surveillance Summary Cards */}
      {surveillanceData && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="card p-3 text-center border-t-2 border-blue-500">
            <div className="text-xs text-gray-500 font-medium">Total Signals</div>
            <div className="text-2xl font-bold text-gray-900 font-mono mt-0.5">
              {surveillanceData.counts.total}
            </div>
            <div className="text-[10px] text-gray-400">Across Cut {cutFrom} → {cutTo}</div>
          </div>
          <div className="card p-3 text-center border-t-2 border-emerald-500">
            <div className="text-xs text-gray-500 font-medium">NEW Signals</div>
            <div className="text-2xl font-bold text-emerald-700 font-mono mt-0.5">
              {surveillanceData.counts.new}
            </div>
            <div className="text-[10px] text-emerald-600 font-medium">First appeared at Cut {cutTo}</div>
          </div>
          <div className="card p-3 text-center border-t-2 border-amber-500">
            <div className="text-xs text-gray-500 font-medium">CHANGED Signals</div>
            <div className="text-2xl font-bold text-amber-700 font-mono mt-0.5">
              {surveillanceData.counts.changed}
            </div>
            <div className="text-[10px] text-amber-600 font-medium">Value/Evidence drifted</div>
          </div>
          <div className="card p-3 text-center border-t-2 border-indigo-500">
            <div className="text-xs text-gray-500 font-medium">REPEATED Signals</div>
            <div className="text-2xl font-bold text-indigo-700 font-mono mt-0.5">
              {surveillanceData.counts.repeated}
            </div>
            <div className="text-[10px] text-indigo-600 font-medium">Persistent unchanged</div>
          </div>
          <div className="card p-3 text-center border-t-2 border-purple-500">
            <div className="text-xs text-gray-500 font-medium">PREVIOUSLY SEEN</div>
            <div className="text-2xl font-bold text-purple-700 font-mono mt-0.5">
              {surveillanceData.counts.previously_seen}
            </div>
            <div className="text-[10px] text-purple-600 font-medium">Resolved / Corrected</div>
          </div>
        </div>
      )}

      {/* Adversarial Defense Section */}
      <div className="card space-y-4 border-l-4 border-l-rose-500">
        <div className="flex items-center justify-between">
          <SectionHeading>Adversarial Surveillance & Defense Center</SectionHeading>
          <span className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded">
            {adversarialData.length} Anomalies Intercepted
          </span>
        </div>
        <p className="text-xs text-gray-600">
          Proactively protects the clinical review pipeline against statistical falsification, enzyme unit shifts, and covert prompt injection attacks.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {adversarialData.map((adv, idx) => (
            <div key={idx} className="p-3.5 bg-rose-50/50 border border-rose-200 rounded-lg space-y-2 text-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-rose-800">{adv.scenario_id}</span>
                  <span className="text-[10px] font-bold bg-rose-200/80 text-rose-900 px-1.5 py-0.5 rounded">
                    {Math.round(adv.confidence * 100)}% Conf
                  </span>
                </div>
                <div className="font-bold text-gray-900 mt-1">{adv.target}</div>
                <div className="text-[11px] text-gray-700 mt-1 leading-relaxed">{adv.description}</div>
              </div>
              <div className="pt-2 border-t border-rose-200 space-y-1.5">
                <div>
                  <span className="font-semibold text-gray-700">Defense Action: </span>
                  <span className="font-mono font-bold text-emerald-800 text-[10px]">{adv.defense_action}</span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-gray-500">
                    Evidence: {adv.evidence.length} record(s)
                  </span>
                  <button
                    onClick={() => openTrace(adv.scenario_id)}
                    className="btn-secondary text-[10px] py-0.5 px-2 text-blue-700"
                  >
                    Explain Trace
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cross-Cut Longitudinal Signals Table */}
      {surveillanceData && (
        <div className="card space-y-3">
          <SectionHeading>Longitudinal Signal Tracking (Cut {cutFrom} → Cut {cutTo})</SectionHeading>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-100 text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="table-th">Status</th>
                  <th className="table-th">Signal ID</th>
                  <th className="table-th">Target</th>
                  <th className="table-th">Type / Severity</th>
                  <th className="table-th">Description</th>
                  <th className="table-th">Evidence</th>
                  <th className="table-th text-right">Audit Trace</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 bg-white">
                {surveillanceData.signals.map((sig, i) => (
                  <tr key={i} className="hover:bg-blue-50/30">
                    <td className="table-td">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          sig.status === 'NEW'
                            ? 'bg-emerald-100 text-emerald-800'
                            : sig.status === 'CHANGED'
                            ? 'bg-amber-100 text-amber-800'
                            : sig.status === 'REPEATED'
                            ? 'bg-indigo-100 text-indigo-800'
                            : 'bg-purple-100 text-purple-800'
                        }`}
                      >
                        {sig.status}
                      </span>
                    </td>
                    <td className="table-td font-mono font-bold text-gray-700">{sig.signal_id}</td>
                    <td className="table-td font-mono font-bold text-blue-800">{sig.target}</td>
                    <td className="table-td font-medium text-gray-700">
                      {sig.signal_type} ({sig.severity})
                    </td>
                    <td className="table-td text-gray-600">{sig.description}</td>
                    <td className="table-td font-mono text-[10px] text-gray-600">
                      {sig.evidence.map(e => `${e.domain}|${e.seq}`).slice(0, 2).join(', ')}
                      {sig.evidence.length > 2 && ` +${sig.evidence.length - 2}`}
                    </td>
                    <td className="table-td text-right">
                      <button
                        onClick={() => openTrace(sig.signal_id)}
                        className="btn-secondary text-[11px] py-1 px-2 text-blue-700 hover:bg-blue-100"
                      >
                        Explain
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recorded Audit Trace Modal */}
      {selectedTrace && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900">
                  WATCH explain() — Audit Trail
                </h2>
                <div className="text-xs text-gray-500 font-mono mt-0.5">
                  Signal: {selectedTrace.signal_id} · {selectedTrace.trace_events_count} Event(s)
                </div>
              </div>
              <button
                onClick={() => setSelectedTrace(null)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold px-2"
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-y-auto space-y-3">
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded text-xs text-indigo-950 font-medium">
                <div><strong>Final Decision:</strong> {selectedTrace.final_decision}</div>
                <div><strong>Defense Action:</strong> {selectedTrace.final_action}</div>
                <div><strong>Rule Grounding:</strong> {selectedTrace.rule}</div>
              </div>
              <div className="space-y-2">
                {selectedTrace.chronological_steps && selectedTrace.chronological_steps.map((s: any, idx: number) => (
                  <div key={idx} className="p-3 border border-gray-200 rounded-lg bg-gray-50 space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-indigo-800">
                        Event #{idx + 1} — {s.operation}
                      </span>
                      <span className="font-mono text-gray-400 text-[10px]">{s.timestamp}</span>
                    </div>
                    <div className="text-gray-700">{s.input_summary}</div>
                    <div className="pt-1">
                      <span className="font-semibold text-gray-700">Evidence Citing: </span>
                      {s.evidence && s.evidence.map((ev: any, evIdx: number) => (
                        <span key={evIdx} className="bg-white border border-gray-300 px-1 py-0.5 rounded font-mono text-[10px] mr-1">
                          {ev.domain}|{ev.usubjid}|{ev.seq}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-3 border-t border-gray-200 text-right">
              <button
                onClick={() => setSelectedTrace(null)}
                className="btn-primary text-xs px-4 py-1.5"
              >
                Close Trace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
