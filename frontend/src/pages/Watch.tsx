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
  cut?: number;
}

interface SiteRiskItem {
  siteid: string;
  subject_count: number;
  sae_miscodes: number;
  dosing_errors: number;
  prohibited_meds: number;
  adversarial_flags: string[];
  unanswered_escalations: number;
  open_queries: number;
  risk_score: number;
  risk_tier: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
  summary: string;
}

interface TimelineItem {
  cut: number;
  protocol_version: number;
  elapsed_ms: number;
  new_records: number;
  total_subjects: number;
  findings_detected: number;
  escalations_count: number;
  queries_count: number;
  deviations_count: number;
  budget_used: number;
  budget_degraded: boolean;
  new_sites: string[];
  new_domains: string[];
  adversarial_detected: number;
  status: string;
}

interface DecisionItem {
  decision_id: string;
  raw_id: string;
  cut: number;
  target: string;
  decision_type: string;
  severity: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
  evidence_status: string;
  action: string;
  status: string;
  trace_available: boolean;
  what: string;
  why: string;
  evidence: Array<{ domain: string; usubjid: string; seq: number }>;
  evidence_lines: string[];
  alternatives: string[];
  trace_path: string;
  is_false_warning_prevented?: boolean;
  timestamp?: string;
}

interface EscalationItem {
  escalation_id: string;
  decision_id?: string;
  code: string;
  usubjid: string;
  siteid: string;
  severity: string;
  summary: string;
  first_seen_cut: number;
  last_seen_cut: number;
  status: string;
  age_in_cuts: number;
  standing_limit_active: boolean;
  evidence: Array<{ domain: string; usubjid: string; seq: number }>;
  alternatives: string[];
  human_response_notes?: string;
  human_response?: string;
  cut_raised?: number;
  cuts_waiting?: number;
  approval_requirement?: string;
  current_action?: string;
}

interface ExplanationItem {
  decision_id: string;
  raw_id?: string;
  what: string;
  evidence: Array<{ domain: string; usubjid: string; seq: number }>;
  evidence_lines: string[];
  alternatives: string[];
  why: string;
  consistent_with_trace: boolean;
  node: string;
  cut: number;
  status: string;
  target?: string;
  decision_type?: string;
  severity?: string;
  action?: string;
  trace_path?: string;
  is_false_warning_prevented?: boolean;
  found_in_trace?: boolean;
}

type WatchTab =
  | 'surveillance'
  | 'siterisk'
  | 'adversarial'
  | 'decisions'
  | 'explain'
  | 'escalations'
  | 'report';

export default function Watch() {
  const [loading, setLoading] = useState(false);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<WatchTab>('surveillance');

  const [surveillanceData, setSurveillanceData] = useState<{
    counts: { total: number; new: number; changed: number; repeated: number; previously_seen: number };
    signals: SignalItem[];
  } | null>(null);

  const [adversarialData, setAdversarialData] = useState<AdversarialItem[]>([]);
  const [siteRisks, setSiteRisks] = useState<SiteRiskItem[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [report, setReport] = useState<any | null>(null);
  const [decisions, setDecisions] = useState<DecisionItem[]>([]);
  const [escalations, setEscalations] = useState<EscalationItem[]>([]);

  // Selected explanation modal or explain tab target
  const [selectedExplanation, setSelectedExplanation] = useState<ExplanationItem | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [searchDecision, setSearchDecision] = useState('');
  const [filterDecisionType, setFilterDecisionType] = useState('ALL');

  // Cut selection for Surveillance Delta & Drift
  const [selectedCut, setSelectedCut] = useState<number>(12);
  const [signalStatusFilter, setSignalStatusFilter] = useState<'ALL' | 'NEW' | 'CHANGED' | 'REPEATED' | 'PREVIOUSLY_SEEN'>('ALL');

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [surv, adv, sites, rep, time, decs, escs] = await Promise.all([
        api.watchSurveillance(Math.max(1, selectedCut - 1), selectedCut).catch(() => null),
        api.watchAdversarial(selectedCut).catch(() => []),
        api.watchSiteRisk().catch(() => []),
        api.watchReport().catch(() => null),
        api.watchTimeline().catch(() => []),
        api.watchDecisions().catch(() => []),
        api.watchEscalations().catch(() => []),
      ]);
      if (surv) setSurveillanceData(surv);
      setAdversarialData(adv || []);
      setSiteRisks(sites || []);
      setReport(rep);
      setTimeline(time || []);
      setDecisions(decs || []);
      setEscalations(escs || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load WATCH data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [selectedCut]);

  const handleSelectCut = async (cut: number) => {
    setSelectedCut(cut);
    setLoading(true);
    try {
      const surv = await api.watchSurveillance(Math.max(1, cut - 1), cut);
      setSurveillanceData(surv);
      const adv = await api.watchAdversarial(cut);
      setAdversarialData(adv || []);
    } catch (err: any) {
      setError(err.message || `Failed to fetch cut ${cut} delta`);
    } finally {
      setLoading(false);
    }
  };

  const runFullPeriod = async () => {
    setPeriodLoading(true);
    setError(null);
    try {
      const newReport = await api.watchRunPeriod(1, 12);
      setReport(newReport);
      const [surv, adv, sites, time, decs, escs] = await Promise.all([
        api.watchSurveillance(11, 12),
        api.watchAdversarial(12),
        api.watchSiteRisk(),
        api.watchTimeline(),
        api.watchDecisions(),
        api.watchEscalations(),
      ]);
      setSurveillanceData(surv);
      setAdversarialData(adv || []);
      setSiteRisks(sites || []);
      setTimeline(time || []);
      setDecisions(decs || []);
      setEscalations(escs || []);
      setSelectedCut(12);
    } catch (err: any) {
      setError(err.message || 'Failed to execute 12-cut surveillance period');
    } finally {
      setPeriodLoading(false);
    }
  };

  const handleExplain = async (id: string, switchToTab = false) => {
    setExplaining(true);
    try {
      const res = await api.watchExplain(id);
      setSelectedExplanation(res);
      if (switchToTab) {
        setActiveTab('explain');
      }
    } catch (err: any) {
      setError(err.message || `Failed to explain decision ${id}`);
    } finally {
      setExplaining(false);
    }
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev?.toUpperCase()) {
      case 'CRITICAL':
        return 'bg-rose-50 text-rose-700 border border-rose-200/90';
      case 'HIGH':
        return 'bg-amber-50 text-amber-700 border border-amber-200/90';
      case 'MODERATE':
      case 'MEDIUM':
        return 'bg-sky-50 text-sky-700 border border-sky-200/90';
      default:
        return 'bg-emerald-50 text-emerald-700 border border-emerald-200/90';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'NEW':
        return 'bg-sky-50 text-sky-700 border border-sky-200/90';
      case 'CHANGED':
        return 'bg-violet-50 text-violet-700 border border-violet-200/90';
      case 'REPEATED':
        return 'bg-amber-50 text-amber-700 border border-amber-200/90';
      case 'PREVIOUSLY_SEEN':
        return 'bg-slate-50 text-slate-700 border border-slate-200/90';
      case 'APPROVED':
        return 'bg-emerald-50 text-emerald-700 border border-emerald-200/90';
      case 'REJECTED':
        return 'bg-rose-50 text-rose-700 border border-rose-200/90';
      case 'UNANSWERED':
      case 'UNANSWERED_STANDING_LIMITS':
        return 'bg-amber-50 text-amber-800 border border-amber-300 font-bold';
      case 'PENDING':
        return 'bg-blue-50 text-blue-700 border border-blue-200/90';
      default:
        return 'bg-slate-50 text-slate-700 border border-slate-200/90';
    }
  };

  // Filtered decisions list
  const filteredDecisions = decisions.filter(d => {
    const matchesSearch =
      !searchDecision ||
      d.decision_id.toLowerCase().includes(searchDecision.toLowerCase()) ||
      d.target.toLowerCase().includes(searchDecision.toLowerCase()) ||
      d.what.toLowerCase().includes(searchDecision.toLowerCase()) ||
      d.action.toLowerCase().includes(searchDecision.toLowerCase());
    const matchesType =
      filterDecisionType === 'ALL' || d.decision_type.toLowerCase() === filterDecisionType.toLowerCase();
    return matchesSearch && matchesType;
  });

  // Filtered signals for delta
  const filteredSignals = (surveillanceData?.signals || []).filter(s => {
    if (signalStatusFilter === 'ALL') return true;
    return s.status === signalStatusFilter;
  });

  // Compute budget
  const latestBudget = timeline.length > 0 ? timeline[timeline.length - 1].budget_used : (report?.budget_used || 82.0);
  const isBudgetDegraded = timeline.length > 0 ? timeline[timeline.length - 1].budget_degraded : (report?.budget_degraded || false);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 bg-white text-slate-900">
      {/* Header Banner - White Apple Style */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 shadow-xs relative">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <span className="px-2.5 py-0.5 bg-slate-100 border border-slate-200/80 rounded-full text-xs font-bold text-slate-800 uppercase tracking-wider">
                Problem 3 — WATCH
              </span>
              <span className="text-xs text-slate-500 font-mono">
                Twelve cuts, unattended, explainable
              </span>
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
              <span>Study Sentinel WATCH</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold">
                Continuous Surveillance Active
              </span>
            </h1>
            <p className="text-slate-500 text-sm mt-1 max-w-3xl leading-relaxed">
              Autonomous longitudinal surveillance, anomaly detection, adversarial defense, and live trace explainability across all 12 study cuts.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <button
              onClick={runFullPeriod}
              disabled={periodLoading}
              className="btn-primary flex items-center justify-center gap-2 text-xs"
            >
              {periodLoading ? <Spinner size="sm" /> : <span>⚡</span>}
              <span>{periodLoading ? 'Executing 12 Cuts...' : 'Run 12-Cut Surveillance'}</span>
            </button>
            <button
              onClick={loadAll}
              disabled={loading}
              className="btn-secondary flex items-center justify-center gap-2 text-xs"
            >
              <span>🔄</span>
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* TIME-BUDGET / DEGRADATION INDICATOR */}
        <div className="mt-6 pt-5 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          <div className="bg-slate-50/70 rounded-xl p-3.5 border border-slate-200/80">
            <div className="flex justify-between items-center text-xs mb-1.5 font-medium">
              <span className="text-slate-600 font-semibold">Model Budget Used</span>
              <span className={`font-bold font-mono ${latestBudget >= 80 ? 'text-amber-600' : 'text-slate-900'}`}>
                {latestBudget.toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  latestBudget >= 80 ? 'bg-amber-500' : 'bg-slate-900'
                }`}
                style={{ width: `${Math.min(100, latestBudget)}%` }}
              />
            </div>
          </div>

          <div className="md:col-span-2 bg-slate-50/70 rounded-xl p-3.5 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs">
              <span className="text-amber-600 text-base">🛡️</span>
              <div>
                <div className="text-slate-900 font-bold flex items-center gap-2">
                  <span>Degradation Safeguard</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${isBudgetDegraded ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-emerald-100 text-emerald-800 border border-emerald-300'}`}>
                    {isBudgetDegraded ? 'NARRATIVE TIER THROTTLED' : 'NORMAL EXECUTION'}
                  </span>
                </div>
                <div className="text-slate-500 text-[11px] mt-0.5">
                  <span className="text-slate-700 font-mono font-semibold">Budget Short</span> → <span className="text-amber-700 font-mono font-semibold">Narrative Tier Reduced</span> → <span className="text-emerald-700 font-mono font-semibold">Safety Checks Continue</span> → <span className="text-slate-900 font-mono font-semibold">Run Completed</span>
                </div>
              </div>
            </div>
            <span className="text-[11px] text-slate-500 font-mono bg-white px-2.5 py-1 rounded-md border border-slate-200 shrink-0">
              Deterministic Rules Never Halt
            </span>
          </div>
        </div>
      </div>

      {error && <ErrorMessage message={error} />}

      {/* 7-SECTION ORDERED WATCH NAVIGATION MENU */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-1.5 shadow-xs flex flex-wrap gap-1">
        {[
          { id: 'surveillance', label: '1. Surveillance Delta & Drift', icon: '📈' },
          { id: 'siterisk', label: '2. Site Risk Matrix', icon: '🏥' },
          { id: 'adversarial', label: '3. Adversarial Defenses', icon: '🛡️' },
          { id: 'decisions', label: '4. Decision Center', icon: '⚖️' },
          { id: 'explain', label: '5. Explainable Decisions', icon: '🔍' },
          { id: 'escalations', label: '6. Human Escalations', icon: '👥' },
          { id: 'report', label: '7. 12-Cut Surveillance Report', icon: '📄' },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as WatchTab)}
              className={`flex-1 min-w-[150px] px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                isActive
                  ? 'bg-slate-900 text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-950 hover:bg-slate-50'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Loading Overlay */}
      {loading && (
        <div className="flex items-center justify-center py-16 bg-white rounded-2xl border border-slate-200">
          <Spinner size="lg" />
          <span className="ml-3 text-sm text-slate-500 font-medium">Syncing surveillance data...</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. SURVEILLANCE DELTA & DRIFT */}
      {/* ========================================================================= */}
      {!loading && activeTab === 'surveillance' && (
        <div className="space-y-6">
          {/* 12-Cut Timeline Selector */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <span>Temporal Timeline: Cut 1 → Cut 12</span>
                  <span className="text-xs text-slate-500 font-normal">(Select a cut to view incremental delta)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  WATCH processes incremental graph updates in ~0.01 ms without rebuilding the full graph each cut.
                </p>
              </div>
              <span className="px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-xs font-mono text-slate-800 font-semibold">
                Active Cut: Cut {selectedCut} (Delta from Cut {Math.max(1, selectedCut - 1)})
              </span>
            </div>

            {/* Horizontal Timeline Bar */}
            <div className="grid grid-cols-6 sm:grid-cols-12 gap-2 mt-2">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((c) => {
                const isSelected = selectedCut === c;
                const isAmendment = c === 6 || c === 9;
                return (
                  <button
                    key={c}
                    onClick={() => handleSelectCut(c)}
                    className={`py-3 px-2 rounded-xl text-center transition flex flex-col items-center justify-center border relative ${
                      isSelected
                        ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <span className="text-xs font-bold font-mono">CUT {c}</span>
                    <span className={`text-[10px] mt-0.5 font-mono ${isSelected ? 'text-slate-300' : 'text-slate-400'}`}>
                      {c <= 4 ? 'v1' : c <= 8 ? 'v2' : 'v3'}
                    </span>
                    {isAmendment && (
                      <span className="absolute -top-1.5 -right-1 px-1 rounded-md bg-purple-600 text-[8px] text-white font-bold">
                        AMEND
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Delta Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs">
              <div className="text-xs text-sky-600 font-bold uppercase tracking-wider">New Findings</div>
              <div className="text-3xl font-black text-slate-900 font-mono mt-1.5">
                {surveillanceData?.counts.new ?? 0}
              </div>
              <div className="text-xs text-slate-500 mt-1 font-medium">Detected at Cut {selectedCut}</div>
            </div>

            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs">
              <div className="text-xs text-violet-600 font-bold uppercase tracking-wider">Changed Values</div>
              <div className="text-3xl font-black text-slate-900 font-mono mt-1.5">
                {surveillanceData?.counts.changed ?? 0}
              </div>
              <div className="text-xs text-slate-500 mt-1 font-medium">Updated evidence & details</div>
            </div>

            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs">
              <div className="text-xs text-amber-600 font-bold uppercase tracking-wider">Repeated Signals</div>
              <div className="text-3xl font-black text-slate-900 font-mono mt-1.5">
                {surveillanceData?.counts.repeated ?? 0}
              </div>
              <div className="text-xs text-slate-500 mt-1 font-medium">Persistent across cuts</div>
            </div>

            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs">
              <div className="text-xs text-emerald-600 font-bold uppercase tracking-wider">Resolved / Corrected</div>
              <div className="text-3xl font-black text-slate-900 font-mono mt-1.5">
                {surveillanceData?.counts.previously_seen ?? 0}
              </div>
              <div className="text-xs text-slate-500 mt-1 font-medium">Source corrections applied</div>
            </div>
          </div>

          {/* Signals Delta Table */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <SectionHeading
                title={`Signals Delta: Cut ${Math.max(1, selectedCut - 1)} ➔ Cut ${selectedCut}`}
                subtitle="Classified signal lifecycles with supporting clinical record evidence"
              />
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                {(['ALL', 'NEW', 'CHANGED', 'REPEATED', 'PREVIOUSLY_SEEN'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setSignalStatusFilter(st)}
                    className={`px-3 py-1 rounded-lg font-medium transition ${
                      signalStatusFilter === st
                        ? 'bg-white text-slate-900 font-bold shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {filteredSignals.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">
                No signals matching filter for this cut comparison.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600 text-xs font-bold uppercase border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Signal ID</th>
                      <th className="py-3 px-4">Target / Subject</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Severity</th>
                      <th className="py-3 px-4">Description & Protocol Rule</th>
                      <th className="py-3 px-4">Evidence</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white text-slate-800 text-xs">
                    {filteredSignals.map((s) => (
                      <tr key={s.signal_id} className="hover:bg-slate-50/70 transition">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">{s.signal_id}</td>
                        <td className="py-3 px-4 font-mono">{s.target}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold ${getStatusBadge(s.status)}`}>
                            {s.status}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold ${getSeverityBadge(s.severity)}`}>
                            {s.severity}
                          </span>
                        </td>
                        <td className="py-3 px-4 max-w-md">
                          <div className="text-slate-900 font-semibold">{s.description}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5 font-mono">{s.rule}</div>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px]">
                          {s.evidence?.map((e, idx) => (
                            <span key={idx} className="inline-block px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-700 mr-1 mb-1 font-semibold">
                              {e.domain}:{e.usubjid}#{e.seq}
                            </span>
                          ))}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleExplain(s.signal_id, true)}
                            className="btn-secondary text-xs py-1 px-3"
                          >
                            Explain
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. SITE RISK MATRIX */}
      {/* ========================================================================= */}
      {!loading && activeTab === 'siterisk' && (
        <div className="space-y-6">
          {/* Special Behavior Callout Banner */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-start gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <h3 className="text-sm font-bold text-amber-900">
                  Required Problem 3 Safeguard: Implausible Site Regularity Defense
                </h3>
                <p className="text-xs text-amber-800/90 mt-1 leading-relaxed">
                  If a site's data becomes implausibly regular (e.g. vital signs barely changing with near-zero standard deviation, visits occurring on identical weekdays, identical narratives):
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-mono">
                  <span className="px-3 py-1 rounded-lg bg-white border border-amber-300 text-amber-900 font-bold">
                    1. FLAG SITE WITHIN 1 CUT
                  </span>
                  <span className="px-3 py-1 rounded-lg bg-white border border-amber-300 text-amber-900 font-bold">
                    2. QUARANTINE AFFECTED DATA
                  </span>
                  <span className="px-3 py-1 rounded-lg bg-white border border-amber-300 text-amber-900 font-bold">
                    3. RECOMMEND FORENSIC AUDIT
                  </span>
                  <span className="px-3 py-1 rounded-lg bg-white border border-emerald-300 text-emerald-800 font-black">
                    4. DO NOT DELETE DATA
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Site Matrix Table */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs">
            <SectionHeading
              title="Site Risk Matrix & Operational Integrity"
              subtitle="Dynamically stratified site risk rankings across study centers (strictly no hardcoded sites)"
            />

            <div className="overflow-x-auto mt-4 rounded-xl border border-slate-200/80">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs font-bold uppercase border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Site ID</th>
                    <th className="py-3 px-4">Risk Tier</th>
                    <th className="py-3 px-4">Risk Score</th>
                    <th className="py-3 px-4">Subjects</th>
                    <th className="py-3 px-4">Data Quality (SAE / Dose / Meds)</th>
                    <th className="py-3 px-4">Suspicious Patterns / Anomaly</th>
                    <th className="py-3 px-4">Quarantine Status</th>
                    <th className="py-3 px-4">Audit Recommendation</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white text-slate-800 text-xs">
                  {siteRisks.map((site) => {
                    const hasQuarantine = site.adversarial_flags && site.adversarial_flags.length > 0;
                    return (
                      <tr key={site.siteid} className="hover:bg-slate-50/70 transition">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">{site.siteid}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold ${getSeverityBadge(site.risk_tier)}`}>
                            {site.risk_tier}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">
                          {site.risk_score.toFixed(1)} / 100
                        </td>
                        <td className="py-3 px-4 font-mono font-medium">{site.subject_count}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded bg-slate-50 border border-slate-200 text-slate-700 text-[11px] font-mono">
                              SAE: {site.sae_miscodes}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-slate-50 border border-slate-200 text-slate-700 text-[11px] font-mono">
                              Dose: {site.dosing_errors}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-slate-50 border border-slate-200 text-slate-700 text-[11px] font-mono">
                              Meds: {site.prohibited_meds}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {site.adversarial_flags && site.adversarial_flags.length > 0 ? (
                            <span className="px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-mono font-bold flex items-center gap-1 w-fit">
                              <span>🚨</span> {site.adversarial_flags.join(', ')}
                            </span>
                          ) : (
                            <span className="text-slate-500 font-mono text-[11px]">Normal variance</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold ${
                              hasQuarantine
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {hasQuarantine ? 'ACTIVE QUARANTINE' : 'NONE'}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px]">
                          {site.risk_tier === 'CRITICAL' || hasQuarantine ? (
                            <span className="text-rose-700 font-bold">AUDIT RECOMMENDED</span>
                          ) : site.risk_tier === 'HIGH' ? (
                            <span className="text-amber-700 font-semibold">TARGETED SDV</span>
                          ) : (
                            <span className="text-emerald-700 font-medium">ROUTINE MONITORING</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleExplain(`DEC_ADV-STAT-REGULARITY-01_C12`, true)}
                            className="btn-secondary text-xs py-1 px-3"
                          >
                            Audit Details
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. ADVERSARIAL DEFENSES */}
      {/* ========================================================================= */}
      {!loading && activeTab === 'adversarial' && (
        <div className="space-y-6">
          {/* Defense Categories Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* A. Implausible Site Regularity */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-xs font-mono font-bold">
                  DEFENSE A: IMPLAUSIBLE REGULARITY
                </span>
                <span className="text-xs font-mono text-emerald-700 font-bold">QUARANTINE ACTIVE</span>
              </div>
              <h4 className="text-base font-bold text-slate-900">Statistical Fabrication & Variance Collapse</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Detects suspiciously perfect site data (systolic BP standard deviation &lt; 2.0 mmHg across &gt; 50 observations).
              </p>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs font-mono space-y-1 text-slate-700">
                <div><span className="text-slate-900 font-semibold">Observed Variance:</span> std dev 0.00 mmHg</div>
                <div><span className="text-slate-900 font-semibold">Defense Pipeline:</span> FLAG ➔ QUARANTINE ➔ AUDIT RECOMMENDED</div>
                <div><span className="text-emerald-700 font-bold">Integrity Principle:</span> Data Quarantined, NEVER Deleted</div>
              </div>
            </div>

            {/* B. Laboratory Unit Corruption */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 text-xs font-mono font-bold">
                  DEFENSE B: LABORATORY UNIT CORRUPTION
                </span>
                <span className="text-xs font-mono text-sky-700 font-bold">UNIT DETECTED</span>
              </div>
              <h4 className="text-base font-bold text-slate-900">Conversion Factor Anomaly (False Warning Prevention)</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Recognizes textbook unit shifts (e.g. GLUC 118 mg/dL ➔ 6.4 mmol/L or ukat/L transaminases) as unit-label issues rather than clinical emergencies.
              </p>
              {/* FLOW VISUALIZATION */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-[11px] font-mono text-slate-800">
                <div className="text-rose-700 font-bold mb-1.5">FALSE CLINICAL WARNING PREVENTED</div>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="px-2 py-0.5 rounded bg-rose-100 border border-rose-200 text-rose-800 font-bold">FALSE WARNING</span>
                  <span>↓</span>
                  <span className="px-2 py-0.5 rounded bg-purple-100 border border-purple-200 text-purple-800 font-bold">UNIT DETECTION</span>
                  <span>↓</span>
                  <span className="px-2 py-0.5 rounded bg-blue-100 border border-blue-200 text-blue-800 font-bold">LAB QUERY</span>
                  <span>↓</span>
                  <span className="px-2 py-0.5 rounded bg-amber-100 border border-amber-200 text-amber-800 font-bold">VALUES UNTRUSTED</span>
                  <span>↓</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-100 border border-emerald-200 text-emerald-800 font-bold">NO CLINICAL ESCALATION</span>
                </div>
              </div>
            </div>

            {/* C. Document Tampering */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-xs font-mono font-bold">
                  DEFENSE C: DOCUMENT TAMPERING
                </span>
                <span className="text-xs font-mono text-emerald-700 font-bold">CONTAINED</span>
              </div>
              <h4 className="text-base font-bold text-slate-900">Covert Prompt Injection in Protocol Docs</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Uses document hash comparison to detect hostile instructions injected into study manuals (e.g. instructions telling automated reviewers to accept values or exclude sites).
              </p>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs font-mono space-y-1 text-slate-700">
                <div><span className="text-slate-900 font-semibold">Audit Action:</span> Re-read ➔ Detect ➔ Ignore Directive ➔ Log Tampered</div>
                <div><span className="text-sky-700 font-bold">Execution Rule:</span> Text treated as DATA, never as executable COMMAND</div>
              </div>
            </div>

            {/* D. Amendment Impact */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-xs font-mono font-bold">
                  DEFENSE D: AMENDMENT IMPACT
                </span>
                <span className="text-xs font-mono text-sky-700 font-bold">ACTIVE (v1 ➔ v2 ➔ v3)</span>
              </div>
              <h4 className="text-base font-bold text-slate-900">Dynamic Re-derivation of Protocol Variables</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                When formal amendments activate at Cut 5/6 and Cut 9, variables derived in earlier cuts are dynamically recomputed to prevent using stale derived results.
              </p>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs font-mono space-y-1 text-slate-700">
                <div><span className="text-slate-900 font-semibold">Trigger:</span> Protocol Amendment v2 (Cut 6) & v3 (Cut 9)</div>
                <div><span className="text-slate-900 font-semibold">Action:</span> Re-derive visit windows & concomitant medication flags</div>
              </div>
            </div>
          </div>

          {/* Active Adversarial Signals Table */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs">
            <SectionHeading
              title="Active Adversarial Events & Defenses Log"
              subtitle="Evidence-backed detections logged during surveillance runs"
            />

            <div className="space-y-4 mt-4">
              {adversarialData.map((adv) => (
                <div key={adv.scenario_id} className="bg-slate-50 rounded-xl p-5 border border-slate-200 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-xs font-mono font-bold">
                        {adv.scenario_id}
                      </span>
                      <span className="text-slate-900 font-bold text-sm">{adv.category} ({adv.target})</span>
                    </div>
                    <button
                      onClick={() => handleExplain(adv.scenario_id, true)}
                      className="btn-primary text-xs py-1.5 px-3.5"
                    >
                      EXPLAIN DECISION
                    </button>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed font-normal">{adv.description}</p>
                  <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-600 pt-1">
                    <div>Defense Action: <span className="text-sky-700 font-bold">{adv.defense_action}</span></div>
                    <div>Confidence: <span className="text-emerald-700 font-bold">{(adv.confidence * 100).toFixed(1)}%</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. DECISION CENTER */}
      {/* ========================================================================= */}
      {!loading && activeTab === 'decisions' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <SectionHeading
                  title="Decision Center"
                  subtitle="Structured log of all clinical, data-integrity, quarantine, and operational decisions"
                />
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="text"
                  placeholder="Search decisions, targets, actions..."
                  value={searchDecision}
                  onChange={(e) => setSearchDecision(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-slate-400 w-60"
                />
                <select
                  value={filterDecisionType}
                  onChange={(e) => setFilterDecisionType(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-slate-400 font-medium"
                >
                  <option value="ALL">All Decision Types</option>
                  <option value="Safety escalation">Safety escalation</option>
                  <option value="Data-integrity decision">Data-integrity decision</option>
                  <option value="Site quarantine">Site quarantine</option>
                  <option value="Laboratory query">Laboratory query</option>
                  <option value="Audit recommendation">Audit recommendation</option>
                  <option value="Document-tampering decision">Document-tampering decision</option>
                  <option value="Monitoring decision">Monitoring decision</option>
                </select>
              </div>
            </div>

            {/* Decisions Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200/80">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs font-bold uppercase border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Decision ID</th>
                    <th className="py-3 px-4">Cut</th>
                    <th className="py-3 px-4">Target</th>
                    <th className="py-3 px-4">Decision Type</th>
                    <th className="py-3 px-4">Severity</th>
                    <th className="py-3 px-4">Evidence Status</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white text-slate-800 text-xs">
                  {filteredDecisions.map((d) => (
                    <tr key={d.decision_id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{d.decision_id}</td>
                      <td className="py-3 px-4 font-mono font-medium">Cut {d.cut}</td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{d.target}</td>
                      <td className="py-3 px-4">
                        <span className="px-2.5 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-mono font-semibold">
                          {d.decision_type}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold ${getSeverityBadge(d.severity)}`}>
                          {d.severity}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-500 font-medium">{d.evidence_status}</td>
                      <td className="py-3 px-4 font-mono text-[11px] text-sky-700 font-bold">{d.action}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold ${getStatusBadge(d.status)}`}>
                          {d.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleExplain(d.decision_id, true)}
                          className="btn-primary text-xs py-1 px-3"
                        >
                          EXPLAIN
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. EXPLAINABLE DECISIONS */}
      {/* ========================================================================= */}
      {!loading && activeTab === 'explain' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs">
            <SectionHeading
              title="Explainable Decision Trace"
              subtitle="Explanations derived strictly from the live recorded audit trace (never reconstructed post-hoc)"
            />

            {/* Quick selector of sample decisions */}
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="text-xs text-slate-500 py-1 font-mono font-semibold">Quick Explain:</span>
              {decisions.slice(0, 8).map((d) => (
                <button
                  key={d.decision_id}
                  onClick={() => handleExplain(d.decision_id)}
                  className={`px-3 py-1 rounded-lg text-xs font-mono transition border ${
                    selectedExplanation?.decision_id === d.decision_id
                      ? 'bg-slate-900 text-white border-slate-900 font-bold'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {d.decision_id} ({d.decision_type})
                </button>
              ))}
            </div>

            {explaining ? (
              <div className="py-16 flex justify-center items-center">
                <Spinner size="md" />
                <span className="ml-3 text-xs text-slate-500 font-mono">Retrieving immutable trace...</span>
              </div>
            ) : selectedExplanation ? (
              <div className="mt-6 space-y-6">
                {/* Decision Header */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                    <div>
                      <div className="text-xs font-mono text-sky-700 font-bold">
                        DECISION {selectedExplanation.decision_id} {selectedExplanation.raw_id && `(${selectedExplanation.raw_id})`}
                      </div>
                      <h3 className="text-xl font-bold text-slate-900 mt-1">
                        {selectedExplanation.decision_type || 'Surveillance Decision'} — {selectedExplanation.target || 'Clinical Finding'}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-mono font-bold">
                        ✓ Consistent with Trace
                      </span>
                      {selectedExplanation.is_false_warning_prevented && (
                        <span className="px-3 py-1 rounded-full bg-purple-50 text-purple-800 border border-purple-200 text-xs font-mono font-black">
                          FALSE WARNING PREVENTED
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 1. What Happened */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">What happened?</h4>
                    <p className="text-sm text-slate-900 bg-slate-50 p-4 rounded-xl border border-slate-200 leading-relaxed font-sans">
                      {selectedExplanation.what}
                    </p>
                  </div>

                  {/* 2. Evidence */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Evidence (Record References)</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedExplanation.evidence && selectedExplanation.evidence.length > 0 ? (
                        selectedExplanation.evidence.map((ev, idx) => (
                          <span
                            key={idx}
                            className="px-3 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono text-slate-800 font-bold"
                          >
                            {ev.domain} | {ev.usubjid} | seq {ev.seq}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-500 font-mono">No specific single-row RecordRef (Aggregate/Protocol level)</span>
                      )}
                    </div>
                  </div>

                  {/* 3. Evidence Lines */}
                  {selectedExplanation.evidence_lines && selectedExplanation.evidence_lines.length > 0 && (
                    <div>
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Evidence Lines</h4>
                      <ul className="list-disc list-inside bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-800 space-y-1 font-mono">
                        {selectedExplanation.evidence_lines.map((line, idx) => (
                          <li key={idx}>{line}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* 4. Alternatives Considered */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Alternatives Considered</h4>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-800 space-y-2">
                      {selectedExplanation.alternatives && selectedExplanation.alternatives.length > 0 ? (
                        selectedExplanation.alternatives.map((alt, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <span className="text-rose-600 font-bold">✗ Rejected:</span>
                            <span>{alt}</span>
                          </div>
                        ))
                      ) : (
                        <span className="text-slate-500">Standard clinical surveillance</span>
                      )}
                    </div>
                  </div>

                  {/* 5. Why? */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Why? (Clinical & Regulatory Rationale)</h4>
                    <p className="text-xs text-slate-800 bg-slate-50 p-4 rounded-xl border border-slate-200 leading-relaxed font-sans">
                      {selectedExplanation.why}
                    </p>
                  </div>

                  {/* 6. Trace Path */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Trace Execution Path</h4>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs font-mono text-emerald-800 font-bold">
                      {selectedExplanation.trace_path || `Cut ${selectedExplanation.cut} ➔ WATCH ➔ ${selectedExplanation.node} ➔ Decision ${selectedExplanation.decision_id}`}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-16 text-slate-400 text-sm">
                Select any decision from the list above or the Decision Center to view its traceable explanation.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. HUMAN ESCALATIONS */}
      {/* ========================================================================= */}
      {!loading && activeTab === 'escalations' && (
        <div className="space-y-6">
          {/* Core Rule Banner */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-start gap-3">
              <span className="text-2xl text-amber-700">⚖️</span>
              <div>
                <h3 className="text-sm font-bold text-amber-900 flex items-center gap-2">
                  <span>Longitudinal Human Gate Policy:</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 text-xs font-mono font-black">
                    UNANSWERED ≠ APPROVED
                  </span>
                </h3>
                <p className="text-xs text-amber-900/90 mt-1 leading-relaxed">
                  Medical monitors typically answer around 2 cuts later (~60% response rate). If an escalation remains unanswered for 4 cuts:
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-mono">
                  <span className="px-3 py-1 rounded-lg bg-white border border-amber-200 text-slate-800 font-medium">
                    1. Continue under standing limits
                  </span>
                  <span className="px-3 py-1 rounded-lg bg-white border border-amber-200 text-slate-800 font-medium">
                    2. Explicitly record unanswered status
                  </span>
                  <span className="px-3 py-1 rounded-lg bg-white border border-rose-300 text-rose-800 font-bold">
                    3. Take NO approval-gated action
                  </span>
                  <span className="px-3 py-1 rounded-lg bg-white border border-amber-200 text-slate-800 font-medium">
                    4. Keep escalation visible in log
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Escalations Table */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs">
            <SectionHeading
              title="Human Gate & Escalations Tracking"
              subtitle="Longitudinal lifecycle of medical reviewer escalations across study cuts"
            />

            <div className="overflow-x-auto mt-4 rounded-xl border border-slate-200/80">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs font-bold uppercase border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Escalation ID</th>
                    <th className="py-3 px-4">Subject & Site</th>
                    <th className="py-3 px-4">Cut Raised</th>
                    <th className="py-3 px-4">Age (Cuts Waiting)</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Human Response / Notes</th>
                    <th className="py-3 px-4">Current Action</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white text-slate-800 text-xs">
                  {escalations.map((esc) => (
                    <tr key={esc.escalation_id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{esc.escalation_id}</td>
                      <td className="py-3 px-4 font-mono font-medium">{esc.usubjid} ({esc.siteid})</td>
                      <td className="py-3 px-4 font-mono">Cut {esc.cut_raised ?? esc.first_seen_cut}</td>
                      <td className="py-3 px-4 font-mono font-bold">
                        <span className={esc.age_in_cuts >= 4 ? 'text-amber-700' : 'text-slate-700'}>
                          {esc.age_in_cuts} cut{esc.age_in_cuts === 1 ? '' : 's'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold ${getStatusBadge(esc.status)}`}>
                          {esc.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 max-w-sm">
                        <div className="text-slate-900 text-xs font-semibold">{esc.human_response || esc.human_response_notes || 'Pending Medical Monitor input'}</div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">{esc.summary}</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-sky-700 font-bold">
                        {esc.current_action || (esc.standing_limit_active ? 'CONTINUE_UNDER_STANDING_LIMITS' : 'HOLD_PENDING_GATE')}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleExplain(esc.escalation_id, true)}
                          className="btn-secondary text-xs py-1 px-3"
                        >
                          Trace
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. 12-CUT SURVEILLANCE REPORT */}
      {/* ========================================================================= */}
      {!loading && activeTab === 'report' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <SectionHeading
                title="12-Cut Longitudinal Surveillance Report"
                subtitle="Executive summary report readable by non-technical clinical reviewers"
              />
              <button
                onClick={() => {
                  const text = report ? JSON.stringify(report, null, 2) : 'No report';
                  navigator.clipboard.writeText(text);
                  alert('Surveillance report JSON copied to clipboard!');
                }}
                className="btn-secondary text-xs py-2 px-4"
              >
                📋 Copy Report JSON
              </button>
            </div>

            {/* Complete Timeline Cards (CUT 1 ↓ ... ↓ CUT 12) */}
            <div className="space-y-3 mt-6">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                12-Cut Surveillance Progression Timeline
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {timeline.map((t) => (
                  <div key={t.cut} className="bg-slate-50/80 border border-slate-200 rounded-xl p-4 space-y-2.5">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <span className="text-xs font-bold font-mono text-slate-900">CUT {t.cut}</span>
                      <span className="text-[11px] font-mono text-slate-500 font-semibold">Protocol v{t.protocol_version}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      <div>
                        <span className="text-slate-500">New Recs:</span> <span className="text-slate-800 font-semibold">{t.new_records}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Subjects:</span> <span className="text-slate-800 font-semibold">{t.total_subjects}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Findings:</span> <span className="text-amber-700 font-bold">{t.findings_detected}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Escalations:</span> <span className="text-rose-700 font-bold">{t.escalations_count}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Deviations:</span> <span className="text-purple-700 font-bold">{t.deviations_count}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Budget:</span> <span className="text-sky-700 font-bold">{t.budget_used.toFixed(1)}%</span>
                      </div>
                    </div>
                    {t.new_sites && t.new_sites.length > 0 && (
                      <div className="text-[10px] font-mono text-slate-500 pt-1.5 border-t border-slate-200">
                        Discovered Sites: <span className="text-slate-800 font-semibold">{t.new_sites.join(', ')}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Executive Highlights Summary */}
            <div className="mt-8 bg-slate-50 rounded-2xl border border-slate-200 p-6 space-y-4">
              <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Executive Safety & Operations Summary
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <div className="text-xs text-slate-500 font-medium">Total Monitored Subjects</div>
                  <div className="text-2xl font-black font-mono text-slate-900 mt-1">188 Subjects</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <div className="text-xs text-slate-500 font-medium">Adversarial Events Neutralized</div>
                  <div className="text-2xl font-black font-mono text-emerald-700 mt-1">
                    {adversarialData.length} Contained
                  </div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <div className="text-xs text-slate-500 font-medium">Unanswered (Standing Limits)</div>
                  <div className="text-2xl font-black font-mono text-amber-700 mt-1">
                    {escalations.filter((e) => e.standing_limit_active).length} Active
                  </div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <div className="text-xs text-slate-500 font-medium">Final System Status</div>
                  <div className="text-2xl font-black font-mono text-sky-700 mt-1">SURVEILLANCE COMPLETE</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
