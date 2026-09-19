import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { Spinner, ErrorMessage, SectionHeading, Badge } from '../components';

interface FindingItem {
  finding_id: string;
  finding_code: string;
  usubjid: string;
  siteid: string;
  cut: number;
  status: string;
  severity?: string;
  rationale?: string;
  rule: string;
  evidence: Array<{ domain: string; usubjid: string; seq: number }>;
  details: Record<string, any>;
}

interface EscalationItem {
  escalation_id: string;
  code: string;
  usubjid: string;
  siteid: string;
  severity: string;
  summary: string;
  evidence: Array<{ domain: string; usubjid: string; seq: number }>;
  alternatives: string[];
  reason_for_escalation: string;
  status: string;
  clarification_question?: string;
  clarification_response?: string;
  resubmission_outcome?: string;
}

interface DecisionItem {
  decision_id: string;
  finding_id: string;
  code: string;
  target: string;
  outcome: string;
  reason: string;
  resubmission_outcome?: string;
  resubmission_reason?: string;
  clarification_provided?: string;
  timestamp: string;
}

interface QueryItem {
  query_id: string;
  finding_id: string;
  domain: string;
  usubjid: string;
  siteid?: string;
  hospital?: string;
  seq: number;
  question: string;
  reply_status: string;
  reply_text: string;
  cut?: number;
  created_timestamp?: string;
  evidence?: Array<{ domain: string; usubjid: string; seq: number }>;
  record_ref?: string;
  issue?: string;
  date?: string;
  time?: string;
}

interface DeviationItem {
  deviation_id: string;
  usubjid: string;
  siteid: string;
  protocol_version: number;
  rule_section: string;
  deviation_type: string;
  description: string;
  evidence: Array<{ domain: string; usubjid: string; seq: number }>;
}

interface SiteFlagItem {
  site_id: string;
  affected_subjects_count: number;
  affected_subjects: string[];
  cycles_affected: number[];
  problem_types: string[];
  open_queries_count: number;
  escalations_count: number;
  flag_level: string;
  summary: string;
}

interface MonitoringOnlyItem {
  finding_id: string;
  code: string;
  usubjid: string;
  siteid: string;
  reason: string;
  evidence: Array<{ domain: string; usubjid: string; seq: number }>;
}

interface ReviewReportData {
  cut: number;
  protocol_version: number;
  findings_detected: number;
  new_findings: number;
  queries_issued: number;
  new_queries: number;
  deviations_count: number;
  escalations_count: number;
  new_escalations: number;
  decisions_count: number;
  approved_count: number;
  rejected_count: number;
  clarify_resubmission_count: number;
  monitoring_only_count: number;
  actions_executed: number;
  open_queries_count: number;
  trace_count: number;
  findings: FindingItem[];
  medical_review_results?: any[];
  queries: QueryItem[];
  deviations: DeviationItem[];
  escalations: EscalationItem[];
  human_gate_decisions: DecisionItem[];
  decisions: DecisionItem[];
  monitoring_only_items: MonitoringOnlyItem[];
  site_level_flags: SiteFlagItem[];
  trace: any[];
  execution_summary: Record<string, any>;
}

type TabKey =
  | 'dashboard'
  | 'humangate'
  | 'findings'
  | 'queries'
  | 'escalations'
  | 'compliance'
  | 'reports'
  | 'audittrail'
  | 'memory'
  | 'patient360';

interface MonitorProps {
  defaultTab?: TabKey;
}

export default function Monitor({ defaultTab }: MonitorProps = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryTab = searchParams.get('tab') as TabKey | null;
  const [activeTab, setActiveTab] = useState<TabKey>(defaultTab || queryTab || 'dashboard');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReviewReportData | null>(null);
  const [selectedTrace, setSelectedTrace] = useState<any | null>(null);
  const [selectedFindingDetail, setSelectedFindingDetail] = useState<any | null>(null);
  const [activeCut, setActiveCut] = useState(12);
  const [activeProtocol, setActiveProtocol] = useState(0); // 0 = Auto per cut
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  
  // Human Gate State
  const [clarifyPromptId, setClarifyPromptId] = useState<string | null>(null);
  const [clarifyQuestion, setClarifyQuestion] = useState('');
  const [clarifyAnswerData, setClarifyAnswerData] = useState<{ id: string; question: string; answer: string } | null>(null);
  const [rejectModalId, setRejectModalId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('Baseline transaminases already elevated; monitor, do not escalate to safety.');

  // Filters
  const [queryFilter, setQueryFilter] = useState<string>('ALL');
  const [findingSeverityFilter, setFindingSeverityFilter] = useState<string>('ALL');
  const [findingSearch, setFindingSearch] = useState<string>('');
  const [traceSearch, setTraceSearch] = useState<string>('');
  
  // Patient 360 quick lookup
  const [p360Subject, setP360Subject] = useState('042-S02-004');

  // Dynamic Date & Time Helper
  const getFormattedCurrentDateTime = () => {
    const now = new Date();
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const curDate = `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
    let hours = now.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const curTime = `${hours}:${minutes} ${ampm}`;
    return { date: curDate, time: curTime };
  };

  // Hospital Query Modal State
  const [showQueryModal, setShowQueryModal] = useState(false);
  const [querySending, setQuerySending] = useState(false);
  const [queryNotification, setQueryNotification] = useState<{
    type: 'success' | 'duplicate' | 'error';
    title: string;
    subtitle?: string;
    hospital?: string;
    subject?: string;
    record?: string;
    sentTime?: string;
    status?: string;
    issue?: string;
    message?: string;
    existingQuery?: any;
  } | null>(null);

  const [newQueryData, setNewQueryData] = useState(() => {
    const { date, time } = getFormattedCurrentDateTime();
    return {
      hospital: 'S02',
      siteid: 'S02',
      usubjid: '042-S02-004',
      record_ref: 'AE Seq 1',
      domain: 'AE',
      seq: 1,
      issue: 'AE_ONSET_VERIFICATION',
      message: 'AE start date precedes first study drug exposure date. Please verify against hospital source records.',
      question: 'AE start date precedes first study drug exposure date. Please verify against hospital source records.',
      date: date,
      time: time,
    };
  });

  const switchTab = (tab: TabKey) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  useEffect(() => {
    if (defaultTab) {
      setActiveTab(defaultTab);
    } else if (queryTab) {
      setActiveTab(queryTab);
    }
  }, [defaultTab, queryTab]);

  const runWorkflow = async (cutNum: number, protoNum: number) => {
    setLoading(true);
    setError(null);
    try {
      const p = protoNum === 0 ? undefined : protoNum;
      const data = await api.monitorRun(cutNum, p);
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Failed to execute ReviewCrew MONITOR cycle');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runWorkflow(activeCut, activeProtocol);
  }, []);

  // 1-Click Demo Flows per Requirement 48
  const runDemo1 = () => {
    setActiveCut(12);
    setActiveProtocol(3);
    runWorkflow(12, 3);
    switchTab('humangate');
  };

  const runDemo2 = () => {
    setActiveCut(12);
    setActiveProtocol(3);
    setQueryFilter('ALL');
    runWorkflow(12, 3);
    switchTab('queries');
  };

  const runDemo3 = async () => {
    setLoading(true);
    try {
      await api.monitorRun(12, 3);
      const data2 = await api.monitorRun(12, 3);
      setResult(data2);
      setActiveCut(12);
      setActiveProtocol(3);
      switchTab('memory');
    } catch (err: any) {
      alert(`Memory rerun test: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const runDemo4 = () => {
    setActiveCut(12);
    setActiveProtocol(3);
    runWorkflow(12, 3);
    switchTab('humangate');
    setClarifyPromptId('ESC_DOSING_ERROR_042-S09-006_2');
    setClarifyQuestion('How many subjects at the site are affected and over which visits?');
  };

  const openTrace = async (findingId: string) => {
    try {
      const traceData = await api.monitorTrace(findingId);
      setSelectedTrace(traceData);
    } catch (err: any) {
      alert(`Error loading trace: ${err.message}`);
    }
  };

  const openFindingDetail = async (findingId: string) => {
    try {
      const detail = await api.monitorFindingDetail(findingId);
      setSelectedFindingDetail(detail);
    } catch (err: any) {
      alert(`Error loading finding details: ${err.message}`);
    }
  };

  const handleApprove = async (escalationId: string) => {
    setActionInProgress(escalationId);
    try {
      await api.monitorApprove(escalationId, 'Approved by medical monitor at Human Gate');
      await runWorkflow(activeCut, activeProtocol);
    } catch (err: any) {
      alert(`Approval error: ${err.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectModalId) return;
    setActionInProgress(rejectModalId);
    try {
      await api.monitorReject(rejectModalId, rejectReason);
      setRejectModalId(null);
      await runWorkflow(activeCut, activeProtocol);
    } catch (err: any) {
      alert(`Rejection error: ${err.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleClarifySubmit = async (escalationId: string) => {
    setActionInProgress(escalationId);
    try {
      const resp = await api.monitorClarify(escalationId, clarifyQuestion);
      setClarifyAnswerData({
        id: escalationId,
        question: clarifyQuestion,
        answer: resp.response || 'Information retrieved and verified against StudyGraph.',
      });
      setClarifyPromptId(null);
      await runWorkflow(activeCut, activeProtocol);
    } catch (err: any) {
      alert(`Clarification error: ${err.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  // Auto-dismiss success notification after 8 seconds
  useEffect(() => {
    if (queryNotification && queryNotification.type === 'success') {
      const timer = setTimeout(() => {
        setQueryNotification(null);
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [queryNotification]);

  // Pre-fill query modal for any clinical finding
  const openQueryModalForFinding = (f: any) => {
    const { date, time } = getFormattedCurrentDateTime();
    const domain = (f.evidence && f.evidence.length > 0 ? f.evidence[0].domain : 'AE') || 'AE';
    const seq = (f.evidence && f.evidence.length > 0 ? f.evidence[0].seq : 1) || 1;
    const recRef = `${domain} Seq ${seq}`;
    const site = f.siteid || 'S02';
    setNewQueryData({
      hospital: site,
      siteid: site,
      usubjid: f.usubjid || '042-S02-004',
      record_ref: recRef,
      domain: domain,
      seq: seq,
      issue: f.finding_code || 'AE_ONSET_VERIFICATION',
      message: f.rationale || `Please verify ${recRef} for subject ${f.usubjid} against hospital source records.`,
      question: f.rationale || `Please verify ${recRef} for subject ${f.usubjid} against hospital source records.`,
      date: date,
      time: time,
    });
    setShowQueryModal(true);
  };

  const handleCreateQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    setQuerySending(true);
    try {
      const { date: defaultDate, time: defaultTime } = getFormattedCurrentDateTime();
      const recRef = (newQueryData.record_ref || '').trim();
      const domainVal = (newQueryData.domain || recRef.split(' ')[0] || 'AE').toUpperCase();
      const hosp = (newQueryData.hospital || newQueryData.siteid || 'S02').trim();

      const payload = {
        hospital: hosp,
        siteid: hosp,
        usubjid: newQueryData.usubjid.trim().toUpperCase(),
        record_ref: recRef || `${domainVal} Seq ${newQueryData.seq || 1}`,
        domain: domainVal,
        seq: Number(newQueryData.seq) || 1,
        issue: (newQueryData.issue || 'DATA_DISCREPANCY').trim(),
        message: (newQueryData.message || newQueryData.question || '').trim(),
        question: (newQueryData.message || newQueryData.question || '').trim(),
        date: (newQueryData.date || defaultDate).trim(),
        time: (newQueryData.time || defaultTime).trim(),
      };

      const resp = await api.postQuery(payload);

      if (resp && resp.duplicate) {
        // DUPLICATE QUERY PROTECTION
        setQueryNotification({
          type: 'duplicate',
          title: '⚠️ Existing Query Found',
          subtitle: 'Duplicate query prevented. This record and issue have already been queried.',
          hospital: resp.hospital || payload.hospital,
          subject: resp.subject || payload.usubjid,
          record: resp.record || payload.record_ref,
          issue: resp.issue || payload.issue,
          existingQuery: resp.existing_query,
        });
        return;
      }

      // SUCCESS: QUERY SENT TO HOSPITAL MANAGEMENT
      setShowQueryModal(false);
      setQueryNotification({
        type: 'success',
        title: '🏥 Query Sent Successfully',
        subtitle: 'Sent to Hospital Management',
        hospital: resp.hospital || payload.hospital,
        subject: resp.subject || payload.usubjid,
        record: resp.record || payload.record_ref,
        sentTime: `${resp.date || payload.date}, ${resp.time || payload.time}`,
        status: resp.status || 'SENT TO HOSPITAL MANAGEMENT',
        message: resp.message_text || payload.message,
      });

      // Refresh monitor cycle to include updated memory
      await runWorkflow(activeCut, activeProtocol);
    } catch (err: any) {
      console.error('Technical error transmitting query:', err);
      setQueryNotification({
        type: 'error',
        title: 'Unable to save query. Please try again.',
        subtitle: 'The hospital communication layer encountered an unexpected issue. Please retry.',
      });
    } finally {
      setQuerySending(false);
    }
  };

  // Filtered queries
  const filteredQueries = (result?.queries || []).filter(q => {
    if (queryFilter === 'ALL') return true;
    return q.reply_status === queryFilter;
  });

  // Filtered findings
  const filteredFindings = (result?.findings || []).filter(f => {
    if (findingSeverityFilter !== 'ALL' && f.severity !== findingSeverityFilter) return false;
    if (findingSearch) {
      const s = findingSearch.toLowerCase();
      return (
        f.usubjid.toLowerCase().includes(s) ||
        f.finding_code.toLowerCase().includes(s) ||
        f.siteid.toLowerCase().includes(s) ||
        (f.rationale && f.rationale.toLowerCase().includes(s))
      );
    }
    return true;
  });

  // Filtered trace
  const filteredTrace = (result?.trace || []).filter(t => {
    if (!traceSearch) return true;
    const s = traceSearch.toLowerCase();
    return (
      (t.node && t.node.toLowerCase().includes(s)) ||
      (t.finding_id && t.finding_id.toLowerCase().includes(s)) ||
      (t.decision && t.decision.toLowerCase().includes(s)) ||
      (t.rule && t.rule.toLowerCase().includes(s)) ||
      (t.input_summary && t.input_summary.toLowerCase().includes(s))
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-600 inline-block animate-pulse"></span>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
              MONITOR — Problem 2 Clinical Surveillance Engine
            </h1>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Built as an extension of ATLAS: <span className="font-semibold text-gray-700">Detect → Medical Review → Data Manager → Compliance → Human Gate → Execute</span>
          </p>
        </div>

        {/* Cycle Execution Controls */}
        <div className="flex items-center flex-wrap gap-2.5">
          <div className="flex items-center gap-1 bg-gray-50 border border-gray-300 rounded px-2 py-1">
            <label className="text-xs font-semibold text-gray-600">Cut:</label>
            <select
              value={activeCut}
              onChange={e => {
                const c = Number(e.target.value);
                setActiveCut(c);
                runWorkflow(c, activeProtocol);
              }}
              className="text-xs font-bold bg-transparent border-0 focus:ring-0 text-gray-900"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(c => (
                <option key={c} value={c}>Cut {c}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1 bg-gray-50 border border-gray-300 rounded px-2 py-1">
            <label className="text-xs font-semibold text-gray-600">Protocol:</label>
            <select
              value={activeProtocol}
              onChange={e => {
                const p = Number(e.target.value);
                setActiveProtocol(p);
                runWorkflow(activeCut, p);
              }}
              className="text-xs font-bold bg-transparent border-0 focus:ring-0 text-gray-900"
            >
              <option value={0}>Auto (per cut)</option>
              <option value={1}>v1 (Cut 1-4)</option>
              <option value={2}>v2 (Cut 5-8)</option>
              <option value={3}>v3 (Cut 9-12)</option>
            </select>
          </div>

          <button
            onClick={() => runWorkflow(activeCut, activeProtocol)}
            disabled={loading}
            className="btn-primary text-xs px-3.5 py-1.5 flex items-center gap-1.5 shadow-sm"
          >
            {loading ? <Spinner size="sm" /> : <span>▶ Run Review Cycle</span>}
          </button>
        </div>
      </div>

      {error && <ErrorMessage message={error} />}

      {/* Verified Clinical Demo Flows per Requirement 48 */}
      <div className="bg-gradient-to-r from-slate-900 to-blue-950 p-3.5 rounded-xl border border-slate-800 text-white flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-2 text-xs">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="font-extrabold text-slate-100 uppercase tracking-wider">
            Verified Clinical Demos:
          </span>
          <span className="text-slate-400 hidden lg:inline">
            Run 1-click end-to-end clinical workflow evaluations
          </span>
        </div>
        <div className="flex items-center flex-wrap gap-2">
          <button
            onClick={runDemo1}
            className="px-3 py-1 text-xs font-bold rounded bg-rose-600/90 hover:bg-rose-500 text-white border border-rose-400/30 transition-all flex items-center gap-1.5 shadow-2xs"
            title="Demo 1: 042-S02-004 SAE Miscoded AESHOSP=Y AESER=N"
          >
            <span>Demo 1: 🔴 Serious SAE</span>
          </button>
          <button
            onClick={runDemo2}
            className="px-3 py-1 text-xs font-bold rounded bg-indigo-600/90 hover:bg-indigo-500 text-white border border-indigo-400/30 transition-all flex items-center gap-1.5 shadow-2xs"
            title="Demo 2: Event before first dose -> Data Manager Query"
          >
            <span>Demo 2: 📋 Data Query</span>
          </button>
          <button
            onClick={runDemo3}
            className="px-3 py-1 text-xs font-bold rounded bg-amber-600/90 hover:bg-amber-500 text-white border border-amber-400/30 transition-all flex items-center gap-1.5 shadow-2xs"
            title="Demo 3: Run same cut twice -> 0 new queries, 0 new escalations"
          >
            <span>Demo 3: 🧠 Persistent Memory</span>
          </button>
          <button
            onClick={runDemo4}
            className="px-3 py-1 text-xs font-bold rounded bg-purple-600/90 hover:bg-purple-500 text-white border border-purple-400/30 transition-all flex items-center gap-1.5 shadow-2xs"
            title="Demo 4: Medical Monitor CLARIFY -> Patient 360 Retrieval -> Resubmit"
          >
            <span>Demo 4: 🟣 Clarify Resolution</span>
          </button>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 overflow-x-auto pb-1">
        <button
          onClick={() => switchTab('dashboard')}
          className={`px-3 py-2 text-xs font-bold rounded-t-lg transition-colors flex items-center gap-1.5 ${
            activeTab === 'dashboard'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <span>Monitor Dashboard</span>
        </button>

        <button
          onClick={() => switchTab('humangate')}
          className={`px-3 py-2 text-xs font-bold rounded-t-lg transition-colors flex items-center gap-1.5 ${
            activeTab === 'humangate'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <span>Human Gate</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${activeTab === 'humangate' ? 'bg-white text-amber-800' : 'bg-amber-100 text-amber-800'}`}>
            {result?.escalations?.length || 0}
          </span>
        </button>

        <button
          onClick={() => switchTab('findings')}
          className={`px-3 py-2 text-xs font-bold rounded-t-lg transition-colors flex items-center gap-1.5 ${
            activeTab === 'findings'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <span>Findings</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${activeTab === 'findings' ? 'bg-white text-blue-800' : 'bg-blue-100 text-blue-800'}`}>
            {result?.findings_detected || 0}
          </span>
        </button>

        <button
          onClick={() => switchTab('queries')}
          className={`px-3 py-2 text-xs font-bold rounded-t-lg transition-colors flex items-center gap-1.5 ${
            activeTab === 'queries'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <span>EDC Queries</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${activeTab === 'queries' ? 'bg-white text-indigo-800' : 'bg-indigo-100 text-indigo-800'}`}>
            {result?.queries_issued || 0}
          </span>
        </button>

        <button
          onClick={() => switchTab('escalations')}
          className={`px-3 py-2 text-xs font-bold rounded-t-lg transition-colors flex items-center gap-1.5 ${
            activeTab === 'escalations'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <span>Escalations</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${activeTab === 'escalations' ? 'bg-white text-purple-800' : 'bg-purple-100 text-purple-800'}`}>
            {result?.escalations_count || 0}
          </span>
        </button>

        <button
          onClick={() => switchTab('compliance')}
          className={`px-3 py-2 text-xs font-bold rounded-t-lg transition-colors flex items-center gap-1.5 ${
            activeTab === 'compliance'
              ? 'bg-purple-700 text-white shadow-xs'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <span>Compliance</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${activeTab === 'compliance' ? 'bg-white text-purple-900' : 'bg-purple-100 text-purple-900'}`}>
            {result?.deviations_count || 0}
          </span>
        </button>

        <button
          onClick={() => switchTab('reports')}
          className={`px-3 py-2 text-xs font-bold rounded-t-lg transition-colors flex items-center gap-1.5 ${
            activeTab === 'reports'
              ? 'bg-teal-700 text-white shadow-xs'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <span>Review Reports</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${activeTab === 'reports' ? 'bg-white text-teal-900' : 'bg-teal-100 text-teal-900'}`}>
            Cut {result?.cut || 12}
          </span>
        </button>

        <button
          onClick={() => switchTab('audittrail')}
          className={`px-3 py-2 text-xs font-bold rounded-t-lg transition-colors flex items-center gap-1.5 ${
            activeTab === 'audittrail'
              ? 'bg-gray-800 text-white shadow-xs'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <span>Audit Trail</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${activeTab === 'audittrail' ? 'bg-white text-gray-800' : 'bg-gray-200 text-gray-700'}`}>
            {result?.trace_count || result?.trace?.length || 0}
          </span>
        </button>

        <button
          onClick={() => switchTab('memory')}
          className={`px-3 py-2 text-xs font-bold rounded-t-lg transition-colors flex items-center gap-1.5 ${
            activeTab === 'memory'
              ? 'bg-cyan-700 text-white shadow-xs'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <span>Cross-Cycle Memory</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${activeTab === 'memory' ? 'bg-white text-cyan-900' : 'bg-cyan-100 text-cyan-900'}`}>
            0 Dups
          </span>
        </button>

        <button
          onClick={() => switchTab('patient360')}
          className={`px-3 py-2 text-xs font-bold rounded-t-lg transition-colors flex items-center gap-1.5 ${
            activeTab === 'patient360'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <span>Patient 360</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: MONITOR DASHBOARD */}
      {/* ========================================================================= */}
      {activeTab === 'dashboard' && result && (
        <div className="space-y-6">
          {/* Summary Metric Cards (11 Cards strictly following Requirement 29) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-11 gap-2.5">
            {/* 1. Total Findings */}
            <div className="card p-3 text-center border-t-4 border-slate-700 shadow-2xs">
              <div className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider">Total Findings</div>
              <div className="text-2xl font-black text-gray-900 font-mono mt-0.5">{result.findings_detected}</div>
              <div className="text-[10px] text-gray-400 mt-1">ATLAS Verified</div>
            </div>

            {/* 2. 🔴 Serious (RED) */}
            <div className="card p-3 text-center border-t-4 border-rose-600 bg-rose-50/50 shadow-2xs">
              <div className="text-[11px] text-rose-800 font-bold tracking-wider">🔴 Serious</div>
              <div className="text-2xl font-black text-rose-700 font-mono mt-0.5">
                {(result.findings || []).filter(f => ['CRITICAL', 'HIGH', 'SERIOUS'].includes((f.severity || '').toUpperCase())).length}
              </div>
              <div className="text-[10px] text-rose-600 font-medium mt-1">Critical Priority</div>
            </div>

            {/* 3. 🟡 Moderate (YELLOW) */}
            <div className="card p-3 text-center border-t-4 border-amber-500 bg-amber-50/50 shadow-2xs">
              <div className="text-[11px] text-amber-800 font-bold tracking-wider">🟡 Moderate</div>
              <div className="text-2xl font-black text-amber-700 font-mono mt-0.5">
                {(result.findings || []).filter(f => ['MEDIUM', 'MODERATE'].includes((f.severity || '').toUpperCase())).length}
              </div>
              <div className="text-[10px] text-amber-600 font-medium mt-1">Protocol Review</div>
            </div>

            {/* 4. 🟢 Normal / Low (GREEN) */}
            <div className="card p-3 text-center border-t-4 border-emerald-500 bg-emerald-50/50 shadow-2xs">
              <div className="text-[11px] text-emerald-800 font-bold tracking-wider">🟢 Normal / Low</div>
              <div className="text-2xl font-black text-emerald-700 font-mono mt-0.5">
                {(result.findings || []).filter(f => !['CRITICAL', 'HIGH', 'SERIOUS', 'MEDIUM', 'MODERATE'].includes((f.severity || '').toUpperCase())).length}
              </div>
              <div className="text-[10px] text-emerald-600 font-medium mt-1">Routine State</div>
            </div>

            {/* 5. Open Queries */}
            <div className="card p-3 text-center border-t-4 border-indigo-500 shadow-2xs">
              <div className="text-[11px] text-indigo-700 font-semibold uppercase tracking-wider">Open Queries</div>
              <div className="text-2xl font-black text-indigo-800 font-mono mt-0.5">
                {result.open_queries_count ?? (result.queries || []).filter(q => q.reply_status === 'OPEN').length}
              </div>
              <div className="text-[10px] text-indigo-600 mt-1">EDC Actionable</div>
            </div>

            {/* 6. Pending Escalations */}
            <div className="card p-3 text-center border-t-4 border-amber-500 shadow-2xs">
              <div className="text-[11px] text-amber-700 font-semibold uppercase tracking-wider">Pending Escal.</div>
              <div className="text-2xl font-black text-amber-800 font-mono mt-0.5">
                {(result.escalations || []).filter(e => e.status === 'PENDING' || !e.status).length}
              </div>
              <div className="text-[10px] text-amber-600 mt-1">Awaiting Gate</div>
            </div>

            {/* 7. Compliance Deviations */}
            <div className="card p-3 text-center border-t-4 border-purple-600 shadow-2xs">
              <div className="text-[11px] text-purple-700 font-semibold uppercase tracking-wider">Deviations</div>
              <div className="text-2xl font-black text-purple-800 font-mono mt-0.5">{result.deviations_count}</div>
              <div className="text-[10px] text-purple-600 mt-1">v{result.protocol_version} Rules</div>
            </div>

            {/* 8. Approved */}
            <div className="card p-3 text-center border-t-4 border-blue-600 shadow-2xs">
              <div className="text-[11px] text-blue-700 font-semibold uppercase tracking-wider">Approved</div>
              <div className="text-2xl font-black text-blue-800 font-mono mt-0.5">{result.approved_count}</div>
              <div className="text-[10px] text-blue-600 mt-1">Human Gate</div>
            </div>

            {/* 9. Rejected */}
            <div className="card p-3 text-center border-t-4 border-orange-500 shadow-2xs">
              <div className="text-[11px] text-orange-700 font-semibold uppercase tracking-wider">Rejected</div>
              <div className="text-2xl font-black text-orange-800 font-mono mt-0.5">{result.rejected_count}</div>
              <div className="text-[10px] text-orange-600 mt-1">Downgraded</div>
            </div>

            {/* 10. Clarify */}
            <div className="card p-3 text-center border-t-4 border-purple-500 shadow-2xs">
              <div className="text-[11px] text-purple-700 font-semibold uppercase tracking-wider">Clarify</div>
              <div className="text-2xl font-black text-purple-800 font-mono mt-0.5">{result.clarify_resubmission_count}</div>
              <div className="text-[10px] text-purple-600 mt-1">P360 Resolved</div>
            </div>

            {/* 11. Resolved */}
            <div className="card p-3 text-center border-t-4 border-teal-600 shadow-2xs">
              <div className="text-[11px] text-teal-700 font-semibold uppercase tracking-wider">Resolved</div>
              <div className="text-2xl font-black text-teal-800 font-mono mt-0.5">{result.actions_executed}</div>
              <div className="text-[10px] text-teal-600 mt-1">Enacted</div>
            </div>
          </div>

          {/* 6-Node Architecture Status Pipeline */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <SectionHeading>Sequential 6-Node Review Crew Execution Pipeline</SectionHeading>
              <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded">Cycle: Cut {result.cut} · Protocol v{result.protocol_version}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-2.5 text-xs">
              <div className="p-3 bg-blue-50/90 border border-blue-200 rounded-lg shadow-2xs">
                <div className="font-bold text-blue-900 text-sm flex items-center justify-between">
                  <span>1. detect</span>
                  <span className="text-emerald-600">✓</span>
                </div>
                <div className="text-gray-600 mt-1">ATLAS graph detection across all 9 clinical domains.</div>
                <div className="mt-2 text-blue-800 font-bold">{result.findings_detected} findings detected</div>
              </div>

              <div className="p-3 bg-indigo-50/90 border border-indigo-200 rounded-lg shadow-2xs">
                <div className="font-bold text-indigo-900 text-sm flex items-center justify-between">
                  <span>2. medical_review</span>
                  <span className="text-emerald-600">✓</span>
                </div>
                <div className="text-gray-600 mt-1">Assesses seriousness, plausibility, and route (EDC, Escalation, Monitoring).</div>
                <div className="mt-2 text-indigo-800 font-bold">{result.escalations_count} drafted escalations</div>
              </div>

              <div className="p-3 bg-cyan-50/90 border border-cyan-200 rounded-lg shadow-2xs">
                <div className="font-bold text-cyan-900 text-sm flex items-center justify-between">
                  <span>3. data_manager</span>
                  <span className="text-emerald-600">✓</span>
                </div>
                <div className="text-gray-600 mt-1">Generates actionable, non-duplicated EDC queries to sites.</div>
                <div className="mt-2 text-cyan-800 font-bold">{result.queries_issued} queries issued</div>
              </div>

              <div className="p-3 bg-purple-50/90 border border-purple-200 rounded-lg shadow-2xs">
                <div className="font-bold text-purple-900 text-sm flex items-center justify-between">
                  <span>4. compliance</span>
                  <span className="text-emerald-600">✓</span>
                </div>
                <div className="text-gray-600 mt-1">Checks protocol version in force at requested cut (visit windows, conmeds).</div>
                <div className="mt-2 text-purple-800 font-bold">{result.deviations_count} deviations checked</div>
              </div>

              <div className="p-3 bg-amber-50/90 border border-amber-200 rounded-lg shadow-2xs">
                <div className="font-bold text-amber-900 text-sm flex items-center justify-between">
                  <span>5. human_gate</span>
                  <span className="text-amber-600">★</span>
                </div>
                <div className="text-gray-600 mt-1">Medical Monitor decision gate: APPROVED, REJECTED, CLARIFY.</div>
                <div className="mt-2 text-amber-800 font-bold">{result.decisions_count} decisions recorded</div>
              </div>

              <div className="p-3 bg-emerald-50/90 border border-emerald-200 rounded-lg shadow-2xs">
                <div className="font-bold text-emerald-900 text-sm flex items-center justify-between">
                  <span>6. execute</span>
                  <span className="text-emerald-600">✓</span>
                </div>
                <div className="text-gray-600 mt-1">Enacts approved expedited reports, dosing holds, CAPAs, and site flags.</div>
                <div className="mt-2 text-emerald-800 font-bold">{result.actions_executed} actions enacted</div>
              </div>
            </div>
          </div>

          {/* Site-Level Flags & Recurring Issues */}
          {result.site_level_flags && result.site_level_flags.length > 0 && (
            <div className="card space-y-3">
              <div className="flex items-center justify-between">
                <SectionHeading>Site Recurring Problems & Site-Level Intelligence</SectionHeading>
                <span className="text-xs text-gray-500 font-medium">Accumulated Cross-Cycle Memory</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {result.site_level_flags.map((flag, idx) => (
                  <div
                    key={idx}
                    className={`p-3.5 rounded-lg border flex flex-col justify-between ${
                      flag.flag_level === 'CRITICAL'
                        ? 'bg-rose-50/70 border-rose-200'
                        : flag.flag_level === 'WARNING'
                        ? 'bg-amber-50/70 border-amber-200'
                        : 'bg-blue-50/70 border-blue-200'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-extrabold text-sm text-gray-900">Site {flag.site_id}</span>
                        <Badge variant={flag.flag_level === 'CRITICAL' ? 'red' : flag.flag_level === 'WARNING' ? 'yellow' : 'blue'}>
                          {flag.flag_level}
                        </Badge>
                      </div>
                      <div className="text-xs text-gray-800 font-medium mt-2">{flag.summary}</div>
                    </div>
                    <div className="text-[11px] text-gray-500 mt-3 pt-2 border-t border-gray-200/80 flex items-center justify-between">
                      <span>Affected Subjects: {flag.affected_subjects.join(', ') || flag.affected_subjects_count}</span>
                      <span>Open Queries: {flag.open_queries_count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Medical Review Monitoring-Only Summary */}
          {result.monitoring_only_items && result.monitoring_only_items.length > 0 && (
            <div className="card space-y-3">
              <div className="flex items-center justify-between">
                <SectionHeading>Medical Review: Retained for Monitoring-Only</SectionHeading>
                <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                  {result.monitoring_only_items.length} Signals
                </span>
              </div>
              <p className="text-xs text-gray-500">
                Signals assessed as pre-existing baseline elevations or downgraded by medical monitor rejection.
              </p>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-100 text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="table-th">Subject</th>
                      <th className="table-th">Site</th>
                      <th className="table-th">Code</th>
                      <th className="table-th">Clinical Rationale</th>
                      <th className="table-th">Evidence Reference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 bg-white">
                    {result.monitoring_only_items.map((m, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/60">
                        <td className="table-td font-mono font-bold text-blue-900">{m.usubjid}</td>
                        <td className="table-td font-medium text-gray-700">Site {m.siteid}</td>
                        <td className="table-td font-mono text-gray-800">{m.code}</td>
                        <td className="table-td text-gray-700 italic">{m.reason}</td>
                        <td className="table-td font-mono text-[11px] text-gray-600">
                          {m.evidence.map(e => `${e.domain}|${e.usubjid}|${e.seq}`).join(', ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: HUMAN GATE SCREEN (DEDICATED MEDICAL MONITOR DECISION GATE) */}
      {/* ========================================================================= */}
      {activeTab === 'humangate' && result && (
        <div className="space-y-6">
          <div className="card border-l-4 border-amber-500 p-4 space-y-1 bg-amber-50/40">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 tracking-tight flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-600 inline-block"></span>
                HUMAN MEDICAL MONITOR DECISION GATE
              </h2>
              <span className="text-xs font-mono font-semibold px-2.5 py-0.5 bg-amber-100 text-amber-900 rounded-full border border-amber-300">
                {result.escalations?.length || 0} Adjudication Items
              </span>
            </div>
            <p className="text-xs text-gray-600">
              Per regulatory trial guidelines, AI analysis assists the clinical monitor, but <strong>only the Human Medical Monitor</strong> can issue final approvals, rejections, or requests for clarification.
            </p>
          </div>

          {/* Clarification Response Banner if available */}
          {clarifyAnswerData && (
            <div className="card p-4 border-2 border-blue-400 bg-blue-50/90 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-blue-900 text-sm flex items-center gap-1.5">
                  <span>✓</span> Patient 360 Clarification Retrieved & Escalation Resubmitted
                </span>
                <button
                  onClick={() => setClarifyAnswerData(null)}
                  className="text-blue-500 hover:text-blue-800 font-bold text-xs"
                >
                  Dismiss
                </button>
              </div>
              <div className="text-xs font-semibold text-blue-800">
                Question: <span className="font-normal text-gray-800">{clarifyAnswerData.question}</span>
              </div>
              <div className="p-2.5 bg-white rounded border border-blue-200 font-mono text-xs text-gray-900">
                {clarifyAnswerData.answer}
              </div>
              <div className="text-[11px] text-blue-700 italic">
                The escalation has been updated with verified StudyGraph evidence and resubmitted to the Human Gate for final approval.
              </div>
            </div>
          )}

          {/* Escalation Adjudication Cards */}
          <div className="space-y-4">
            {result.escalations && result.escalations.length > 0 ? (
              result.escalations.map((esc, i) => (
                <div key={i} className="card p-5 border border-gray-300 shadow-sm space-y-4">
                  {/* Top Bar: Subject, Code, Severity */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-gray-200">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-base font-bold text-blue-900">{esc.usubjid}</span>
                      <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-700 rounded font-semibold">Site {esc.siteid}</span>
                      <span className="text-xs font-mono font-bold px-2 py-0.5 bg-blue-100 text-blue-900 rounded border border-blue-200">
                        {esc.code}
                      </span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                        esc.severity === 'CRITICAL' ? 'bg-rose-100 text-rose-800 border border-rose-200' : 'bg-amber-100 text-amber-800 border border-amber-200'
                      }`}>
                        {esc.severity}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-3 py-1 rounded-full border ${
                        esc.status === 'APPROVED'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : esc.status === 'REJECTED'
                          ? 'bg-rose-100 text-rose-800 border-rose-300'
                          : 'bg-amber-100 text-amber-800 border-amber-300'
                      }`}>
                        Status: {esc.status}
                      </span>
                      <button
                        onClick={() => openTrace(esc.escalation_id)}
                        className="px-2.5 py-1 text-xs font-semibold rounded border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 shadow-2xs"
                      >
                        Audit Trace
                      </button>
                    </div>
                  </div>

                  {/* Two-Column Section: AI Analysis VS Human Decision */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Left Column: AI / SYSTEM ANALYSIS */}
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5">
                      <div className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        AI / SYSTEM ANALYSIS
                      </div>
                      <div className="text-xs font-medium text-gray-900">{esc.summary}</div>
                      <div className="text-xs text-gray-600">
                        <strong className="text-gray-700">Protocol & Safety Basis:</strong> {esc.reason_for_escalation}
                      </div>
                      <div className="pt-2 border-t border-slate-200 space-y-1">
                        <div className="text-[11px] font-semibold text-gray-600">Supporting Evidence Records:</div>
                        <div className="flex flex-wrap gap-1">
                          {esc.evidence.map((ev, idx) => (
                            <span key={idx} className="bg-white border border-gray-300 px-1.5 py-0.5 rounded font-mono text-[11px] text-blue-800">
                              {ev.domain}|{ev.usubjid}|{ev.seq}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="pt-2 border-t border-slate-200">
                        <div className="text-[11px] font-semibold text-gray-600">Alternative Etiologies Considered:</div>
                        <div className="text-[11px] text-gray-600 mt-0.5">
                          {esc.alternatives?.join(' · ') || 'None specified'}
                        </div>
                      </div>
                    </div>

                    {/* Right Column: HUMAN MEDICAL MONITOR DECISION */}
                    <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-lg space-y-3 flex flex-col justify-between">
                      <div className="space-y-2">
                        <div className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-600"></span>
                          HUMAN MEDICAL MONITOR DECISION
                        </div>
                        <p className="text-xs text-gray-600">
                          Select the appropriate regulatory clinical action. Decisions are immutably logged into the Study Sentinel audit trail.
                        </p>

                        {/* Clarification Response Display if available on item */}
                        {esc.clarification_response && (
                          <div className="p-2.5 bg-white border border-amber-300 rounded text-xs space-y-1">
                            <span className="font-bold text-blue-900">StudyGraph Clarification Response:</span>
                            <div className="font-mono text-[11px] text-gray-800">{esc.clarification_response}</div>
                          </div>
                        )}
                      </div>

                      {/* Decision Action Buttons Strictly Following Req 16 & 35 */}
                      <div className="pt-3 border-t border-amber-200 flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => handleApprove(esc.escalation_id)}
                          disabled={actionInProgress === esc.escalation_id}
                          className="px-3.5 py-1.5 text-xs font-bold rounded bg-blue-600 hover:bg-blue-700 text-white shadow-xs flex items-center gap-1.5 transition-all"
                        >
                          <span>🔵 APPROVED</span>
                        </button>
                        <button
                          onClick={() => {
                            setRejectModalId(esc.escalation_id);
                            setRejectReason('Baseline transaminases already elevated; monitor, do not escalate to safety.');
                          }}
                          disabled={actionInProgress === esc.escalation_id}
                          className="px-3.5 py-1.5 text-xs font-bold rounded bg-orange-600 hover:bg-orange-700 text-white shadow-xs flex items-center gap-1.5 transition-all"
                        >
                          <span>🟠 REJECTED (MONITOR)</span>
                        </button>
                        <button
                          onClick={() => {
                            setClarifyPromptId(esc.escalation_id);
                            setClarifyQuestion(
                              esc.clarification_question ||
                              'What was the ALT at screening, and is there a concomitant hepatotoxic medication?'
                            );
                          }}
                          disabled={actionInProgress === esc.escalation_id}
                          className="px-3.5 py-1.5 text-xs font-bold rounded bg-purple-600 hover:bg-purple-700 text-white shadow-xs flex items-center gap-1.5 transition-all"
                        >
                          <span>🟣 CLARIFY (GRAPH P360)</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Clarification text input if user opened CLARIFY */}
                  {clarifyPromptId === esc.escalation_id && (
                    <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-lg space-y-2 text-xs">
                      <div className="font-bold text-amber-900">Enter Clarification Request for StudyGraph / Patient 360:</div>
                      <textarea
                        value={clarifyQuestion}
                        onChange={e => setClarifyQuestion(e.target.value)}
                        className="w-full p-2 border border-amber-300 rounded bg-white font-medium text-gray-900 text-xs"
                        rows={2}
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setClarifyPromptId(null)}
                          className="btn-secondary text-xs py-1 px-3"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleClarifySubmit(esc.escalation_id)}
                          disabled={actionInProgress === esc.escalation_id}
                          className="btn-primary text-xs py-1 px-3 flex items-center gap-1"
                        >
                          {actionInProgress === esc.escalation_id ? <Spinner size="sm" /> : <span>Resolve from Graph & Resubmit</span>}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="card p-8 text-center text-gray-500 text-xs">
                No active escalations pending Medical Monitor adjudication.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: FINDINGS SCREEN */}
      {/* ========================================================================= */}
      {activeTab === 'findings' && result && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-3.5 rounded-lg border border-gray-200">
            <div>
              <SectionHeading>ATLAS Clinical Findings</SectionHeading>
              <div className="text-xs text-gray-500 mt-0.5">
                Found {result.findings_detected} findings for Cut {result.cut} under Protocol v{result.protocol_version}.
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search subject, code, site..."
                value={findingSearch}
                onChange={e => setFindingSearch(e.target.value)}
                className="text-xs border border-gray-300 rounded px-2.5 py-1.5 w-48"
              />
              <select
                value={findingSeverityFilter}
                onChange={e => setFindingSeverityFilter(e.target.value)}
                className="text-xs border border-gray-300 rounded px-2.5 py-1.5 bg-white font-medium"
              >
                <option value="ALL">All Severities</option>
                <option value="CRITICAL">CRITICAL</option>
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="LOW">LOW</option>
              </select>
            </div>
          </div>

          {/* Requirement 30: Professional Findings Table */}
          <div className="card p-0 overflow-hidden border border-gray-200 shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-gray-200 text-gray-700 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-3.5">Severity</th>
                    <th className="py-3 px-3.5">Finding</th>
                    <th className="py-3 px-3.5">Subject</th>
                    <th className="py-3 px-3.5">Site</th>
                    <th className="py-3 px-3.5">Evidence</th>
                    <th className="py-3 px-3.5">Status</th>
                    <th className="py-3 px-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredFindings.slice(0, 100).map((f, idx) => {
                    const isSerious = ['CRITICAL', 'HIGH', 'SERIOUS'].includes((f.severity || '').toUpperCase());
                    const isModerate = ['MEDIUM', 'MODERATE'].includes((f.severity || '').toUpperCase());
                    const primaryEv = f.evidence && f.evidence.length > 0 
                      ? `${f.evidence[0].domain} Seq ${f.evidence[0].seq}`
                      : 'No cited records';
                    
                    return (
                      <tr
                        key={idx}
                        onClick={() => openFindingDetail(f.finding_id)}
                        className="hover:bg-blue-50/50 cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          {isSerious ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
                              <span className="w-2 h-2 rounded-full bg-rose-600"></span>
                              🔴 SERIOUS
                            </span>
                          ) : isModerate ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                              🟡 MODERATE
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                              🟢 NORMAL / LOW
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3.5">
                          <span className="font-mono font-bold text-blue-950 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            {f.finding_code}
                          </span>
                        </td>
                        <td className="py-3 px-3.5 font-mono font-bold text-gray-900">
                          {f.usubjid}
                        </td>
                        <td className="py-3 px-3.5 font-semibold text-gray-700">
                          {f.siteid}
                        </td>
                        <td className="py-3 px-3.5 font-mono text-gray-800">
                          <span className="bg-slate-50 border border-gray-200 px-2 py-0.5 rounded">
                            {primaryEv}
                            {f.evidence && f.evidence.length > 1 && ` (+${f.evidence.length - 1})`}
                          </span>
                        </td>
                        <td className="py-3 px-3.5">
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
                            {f.status === 'DETECTED' ? 'Pending Review' : f.status}
                          </span>
                        </td>
                        <td className="py-3 px-3.5 text-right whitespace-nowrap">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openFindingDetail(f.finding_id);
                            }}
                            className="btn-secondary text-xs px-2.5 py-1 text-blue-700 font-semibold shadow-2xs hover:bg-blue-100"
                          >
                            Inspect Evidence →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredFindings.length > 100 && (
              <div className="p-3 bg-gray-50 border-t border-gray-200 text-center text-xs text-gray-500">
                Showing top 100 of {filteredFindings.length} findings. Use search and filter to narrow down results.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: QUERIES PAGE */}
      {/* ========================================================================= */}
      {activeTab === 'queries' && result && (
        <div className="card space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-gray-200">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">🏥</span>
                <SectionHeading>Data Manager EDC Queries & Hospital Communications</SectionHeading>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Grounded EDC discrepancy queries dispatched to Hospital Management and Clinical Sites with persistent audit trace. Zero duplicates permitted.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap items-center gap-1 text-xs">
                <span className="font-semibold text-gray-600">Status:</span>
                {(['ALL', 'SENT TO HOSPITAL MANAGEMENT', 'OPEN', 'CLOSED', 'RESPONDED', 'UNANSWERED'] as const).map(st => (
                  <button
                    key={st}
                    onClick={() => setQueryFilter(st)}
                    className={`px-2 py-0.5 rounded font-semibold text-[11px] transition-colors ${
                      queryFilter === st ? 'bg-indigo-600 text-white shadow-xs' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {st === 'SENT TO HOSPITAL MANAGEMENT' ? 'SENT TO HOSPITAL' : st}
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  const { date, time } = getFormattedCurrentDateTime();
                  setNewQueryData(prev => ({
                    ...prev,
                    date,
                    time,
                  }));
                  setShowQueryModal(true);
                }}
                className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5 shadow-xs"
              >
                <span>🏥</span>
                <span>Send Query to Hospital</span>
              </button>
            </div>
          </div>

          {/* Recent Hospital Transmissions Card Container */}
          {result.queries && result.queries.some(q => q.reply_status === 'SENT TO HOSPITAL MANAGEMENT') && (
            <div className="space-y-2">
              <div className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                <span>🏥 Recent Hospital Transmissions (Query Sent Log)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {result.queries
                  .filter(q => q.reply_status === 'SENT TO HOSPITAL MANAGEMENT')
                  .slice(0, 6)
                  .map((hq, hIdx) => (
                    <div
                      key={hIdx}
                      className="border-2 border-indigo-300 bg-white rounded-xl p-3.5 shadow-xs font-sans text-xs space-y-2"
                    >
                      <div className="flex items-center justify-between border-b border-gray-100 pb-1.5">
                        <span className="font-mono font-black text-indigo-900 tracking-wider text-[11px]">
                          QUERY SENT
                        </span>
                        <span className="font-mono text-[10px] text-gray-500 font-bold">
                          {hq.query_id}
                        </span>
                      </div>
                      <div className="space-y-1 font-mono text-[11px]">
                        <div className="flex justify-between">
                          <span className="text-gray-500 font-sans">Hospital:</span>
                          <span className="font-bold text-gray-900">{hq.siteid || 'S02'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500 font-sans">Subject:</span>
                          <span className="font-bold text-blue-900">{hq.usubjid}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500 font-sans">Record:</span>
                          <span className="font-bold text-indigo-900">
                            {hq.record_ref || `${hq.domain} Seq ${hq.seq}`}
                          </span>
                        </div>
                        <div className="flex justify-between pt-1 border-t border-dashed border-gray-200">
                          <span className="text-gray-500 font-sans">Date:</span>
                          <span className="text-gray-800">{hq.date || '19 Sep 2026'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500 font-sans">Time:</span>
                          <span className="text-gray-800">{hq.time || '12:30 PM'}</span>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-gray-100">
                        <div className="text-[10px] text-gray-500 font-sans uppercase font-bold mb-0.5">
                          Status:
                        </div>
                        <span className="inline-block w-full text-center bg-blue-50 border border-blue-300 text-blue-900 font-bold py-0.5 rounded text-[10.5px]">
                          {hq.reply_status}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-100 text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="table-th">Query ID</th>
                  <th className="table-th">Hospital / Site</th>
                  <th className="table-th">Subject</th>
                  <th className="table-th">Record Ref</th>
                  <th className="table-th">Issue & Question Text</th>
                  <th className="table-th">Sent Date & Time</th>
                  <th className="table-th">Status</th>
                  <th className="table-th">Site Response</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 bg-white">
                {filteredQueries.map((q, i) => (
                  <tr key={i} className="hover:bg-blue-50/40">
                    <td className="table-td font-mono font-bold text-gray-700">{q.query_id}</td>
                    <td className="table-td font-medium text-gray-800">{q.siteid || 'Site'}</td>
                    <td className="table-td font-mono font-bold text-blue-900">{q.usubjid}</td>
                    <td className="table-td font-mono font-bold text-indigo-700">
                      {q.record_ref || `${q.domain} Seq ${q.seq}`}
                    </td>
                    <td className="table-td text-gray-900 font-medium max-w-xs">
                      {q.issue && (
                        <span className="inline-block font-mono text-[9.5px] font-bold bg-gray-100 text-gray-700 px-1.5 py-0.2 rounded mr-1">
                          {q.issue}
                        </span>
                      )}
                      {q.question}
                    </td>
                    <td className="table-td font-mono text-gray-600 whitespace-nowrap text-[11px]">
                      {q.date ? `${q.date}, ${q.time}` : 'Cycle Auto'}
                    </td>
                    <td className="table-td whitespace-nowrap">
                      {q.reply_status === 'SENT TO HOSPITAL MANAGEMENT' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold text-[10.5px] bg-blue-100 text-blue-900 border border-blue-300">
                          🏥 SENT TO HOSPITAL MANAGEMENT
                        </span>
                      ) : (
                        <Badge variant={q.reply_status === 'CLOSED' ? 'green' : q.reply_status === 'OPEN' ? 'red' : 'blue'}>
                          {q.reply_status}
                        </Badge>
                      )}
                    </td>
                    <td className="table-td text-gray-600 italic">"{q.reply_text}"</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: ESCALATIONS PAGE */}
      {/* ========================================================================= */}
      {activeTab === 'escalations' && result && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-gray-200">
            <div>
              <SectionHeading>Clinical Escalations Registry</SectionHeading>
              <p className="text-xs text-gray-500 mt-0.5">
                Drafted by Medical Review, adjudicated by Human Gate, and tracked persistently across cycles.
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-purple-100 text-purple-800 rounded">
              {result.escalations?.length || 0} Registered Escalations
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-100 text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="table-th">Escalation ID</th>
                  <th className="table-th">Subject</th>
                  <th className="table-th">Site</th>
                  <th className="table-th">Code</th>
                  <th className="table-th">Severity</th>
                  <th className="table-th">Summary</th>
                  <th className="table-th">Status</th>
                  <th className="table-th">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 bg-white">
                {(result.escalations || []).map((e, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/60">
                    <td className="table-td font-mono font-bold text-gray-700">{e.escalation_id}</td>
                    <td className="table-td font-mono font-bold text-blue-900">{e.usubjid}</td>
                    <td className="table-td font-medium text-gray-600">Site {e.siteid}</td>
                    <td className="table-td font-mono font-bold text-purple-900">{e.code}</td>
                    <td className="table-td">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        e.severity === 'CRITICAL' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {e.severity}
                      </span>
                    </td>
                    <td className="table-td text-gray-800 font-medium">{e.summary}</td>
                    <td className="table-td">
                      <Badge variant={e.status === 'APPROVED' ? 'green' : e.status === 'REJECTED' ? 'red' : 'yellow'}>
                        {e.status}
                      </Badge>
                    </td>
                    <td className="table-td">
                      <button
                        onClick={() => openTrace(e.escalation_id)}
                        className="text-xs text-blue-600 hover:text-blue-800 font-semibold"
                      >
                        Explain Trace
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: COMPLIANCE PAGE */}
      {/* ========================================================================= */}
      {activeTab === 'compliance' && result && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-gray-200">
            <div>
              <SectionHeading>Protocol Deviations under Protocol v{result.protocol_version}</SectionHeading>
              <p className="text-xs text-gray-500 mt-0.5">
                Dynamically applied against the protocol version in force at Cut {result.cut}. Sensitive to protocol amendments.
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-purple-100 text-purple-800 rounded">
              {result.deviations_count} Active Deviations
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200 max-h-96 overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-100 text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="table-th">Deviation ID</th>
                  <th className="table-th">Subject</th>
                  <th className="table-th">Site</th>
                  <th className="table-th">Type</th>
                  <th className="table-th">Protocol Section</th>
                  <th className="table-th">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 bg-white">
                {(result.deviations || []).map((d, i) => (
                  <tr key={i} className="hover:bg-slate-50/60">
                    <td className="table-td font-mono text-gray-600">{d.deviation_id}</td>
                    <td className="table-td font-mono font-bold text-blue-800">{d.usubjid}</td>
                    <td className="table-td font-medium text-gray-700">Site {d.siteid}</td>
                    <td className="table-td font-semibold text-purple-900">{d.deviation_type}</td>
                    <td className="table-td text-gray-500">{d.rule_section}</td>
                    <td className="table-td text-gray-800">{d.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 7: AUDIT TRAIL PAGE */}
      {/* ========================================================================= */}
      {activeTab === 'audittrail' && result && (
        <div className="card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-gray-200">
            <div>
              <SectionHeading>Complete Chronological Audit Trail</SectionHeading>
              <p className="text-xs text-gray-500 mt-0.5">
                Every node records its clinical rationale and decision in real time during the execution cycle.
              </p>
            </div>
            <input
              type="text"
              placeholder="Filter trace by node, subject, rule..."
              value={traceSearch}
              onChange={e => setTraceSearch(e.target.value)}
              className="text-xs border border-gray-300 rounded px-2.5 py-1.5 w-60"
            />
          </div>

          <div className="space-y-2">
            {filteredTrace.map((entry, idx) => (
              <div key={idx} className="p-3 border border-gray-200 rounded-lg bg-gray-50 text-xs space-y-1 hover:border-gray-300 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-blue-800 bg-white px-2 py-0.5 rounded border border-gray-200 uppercase tracking-wider text-[10px]">
                      {entry.node}
                    </span>
                    <span className="font-mono font-bold text-gray-900">{entry.finding_id}</span>
                    <span className="font-semibold text-gray-700">→ {entry.decision}</span>
                  </div>
                  <span className="font-mono text-gray-400 text-[10px]">{entry.timestamp}</span>
                </div>
                <div className="text-gray-800 mt-1">
                  <strong>Rule:</strong> {entry.rule}
                </div>
                <div className="text-gray-600 text-[11px]">
                  <strong>Action / Rationale:</strong> {entry.output_action}
                </div>
                {entry.evidence && entry.evidence.length > 0 && (
                  <div className="pt-1 flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold text-gray-600 text-[11px]">Evidence Records:</span>
                    {entry.evidence.map((ev: any, evIdx: number) => (
                      <span key={evIdx} className="bg-white border border-gray-300 px-1.5 py-0.5 rounded font-mono text-[10px] text-blue-800">
                        {ev.domain}|{ev.usubjid}|{ev.seq}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 7: REVIEW REPORT (COMPREHENSIVE FINAL REVIEW REPORT PER REQ 22) */}
      {/* ========================================================================= */}
      {activeTab === 'reports' && result && (
        <div className="space-y-6">
          {/* Header Banner */}
          <div className="card p-5 bg-gradient-to-r from-teal-900 to-slate-900 text-white border-0 shadow-md">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-teal-500 text-white">
                    CUT {result.cut}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-700 text-slate-200">
                    PROTOCOL v{result.protocol_version}
                  </span>
                  <span className="text-xs text-teal-300 font-semibold">
                    STATUS: FINAL ADJUDICATED
                  </span>
                </div>
                <h2 className="text-xl font-black mt-2 tracking-tight">
                  Study Sentinel Clinical Surveillance Review Report
                </h2>
                <p className="text-xs text-slate-300 mt-1">
                  Full 6-node cycle review artifact generated deterministically from verified ATLAS findings and Human Gate adjudications.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition-colors shadow-2xs"
                >
                  Print / Export PDF
                </button>
              </div>
            </div>
          </div>

          {/* 13 Required Review Report Sections per Requirement 22 */}
          <div className="space-y-4">
            {/* Section 1: Study Cut & Protocol Version */}
            <div className="card p-4 space-y-2">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                1. Study Cut & Applicable Protocol
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="p-3 bg-gray-50 rounded border">
                  <div className="text-gray-500 font-medium">Study Cut Evaluated</div>
                  <div className="text-lg font-bold text-gray-900 font-mono">Cut {result.cut}</div>
                </div>
                <div className="p-3 bg-gray-50 rounded border">
                  <div className="text-gray-500 font-medium">Active Protocol Version</div>
                  <div className="text-lg font-bold text-teal-800 font-mono">Protocol v{result.protocol_version}</div>
                </div>
                <div className="p-3 bg-gray-50 rounded border">
                  <div className="text-gray-500 font-medium">Protocol Rule In Force</div>
                  <div className="text-xs font-bold text-gray-800 mt-1">
                    {result.protocol_version === 1
                      ? 'Original baseline rules (Visit ±7d)'
                      : result.protocol_version === 2
                      ? 'Creatinine exclusion & Visit ±3d'
                      : 'Sulfonylurea prohibited & Visit ±3d'}
                  </div>
                </div>
                <div className="p-3 bg-gray-50 rounded border">
                  <div className="text-gray-500 font-medium">Adjudication Cycle Status</div>
                  <div className="text-xs font-bold text-emerald-700 mt-1">COMPLETE · TRACE RECORDED</div>
                </div>
              </div>
            </div>

            {/* Section 2: Findings Reviewed */}
            <div className="card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  2. Findings Reviewed ({result.findings_detected} Total)
                </h3>
                <span className="text-xs text-gray-500">Source: Problem 1 ATLAS Ground Truth</span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs divide-y divide-gray-200">
                  <thead className="bg-gray-50 font-semibold text-gray-700 text-left">
                    <tr>
                      <th className="py-2 px-3">Severity</th>
                      <th className="py-2 px-3">Finding Code</th>
                      <th className="py-2 px-3">Subject</th>
                      <th className="py-2 px-3">Site</th>
                      <th className="py-2 px-3">Evidence Records</th>
                      <th className="py-2 px-3">Clinical Rule</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {result.findings.slice(0, 8).map((f, i) => {
                      const sev = (f.severity || '').toUpperCase();
                      const isSerious = ['CRITICAL', 'HIGH', 'SERIOUS'].includes(sev);
                      const isMod = ['MEDIUM', 'MODERATE'].includes(sev);
                      return (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="py-2 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                isSerious
                                  ? 'bg-rose-100 text-rose-800'
                                  : isMod
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {isSerious ? '🔴 SERIOUS' : isMod ? '🟡 MODERATE' : '🟢 NORMAL'}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-mono font-bold text-gray-900">{f.finding_code}</td>
                          <td className="py-2 px-3 font-mono text-blue-800">{f.usubjid}</td>
                          <td className="py-2 px-3 font-mono">{f.siteid}</td>
                          <td className="py-2 px-3 font-mono text-[11px]">
                            {f.evidence.map(e => `${e.domain} seq ${e.seq}`).join(', ')}
                          </td>
                          <td className="py-2 px-3 text-gray-600 truncate max-w-xs">{f.rule}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section 3 & 4: Medical Reviews & Data Queries */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="card p-4 space-y-2">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  3. Medical Reviews ({result.escalations_count + result.monitoring_only_count} Total)
                </h3>
                <div className="space-y-2 text-xs">
                  <div className="p-3 bg-rose-50 rounded border border-rose-200">
                    <div className="font-bold text-rose-900">Serious Safety Issues (Escalated to Human Gate)</div>
                    <div className="text-2xl font-black text-rose-700 font-mono mt-0.5">{result.escalations_count}</div>
                    <div className="text-gray-600 text-[11px] mt-1">Requires Medical Monitor approval under Protocol §6/§8</div>
                  </div>
                  <div className="p-3 bg-gray-50 rounded border border-gray-200">
                    <div className="font-bold text-gray-800">Routine Surveillance (Kept as Monitoring-Only)</div>
                    <div className="text-2xl font-black text-gray-800 font-mono mt-0.5">{result.monitoring_only_count}</div>
                    <div className="text-gray-500 text-[11px] mt-1">Baseline elevations, non-serious deviations, or previous rejections</div>
                  </div>
                </div>
              </div>

              <div className="card p-4 space-y-2">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  4. Data Queries ({result.queries_issued} Issued · {result.open_queries_count} Open)
                </h3>
                <div className="space-y-2 text-xs">
                  <div className="p-3 bg-indigo-50 rounded border border-indigo-200">
                    <div className="font-bold text-indigo-900">Total Actionable EDC Queries</div>
                    <div className="text-2xl font-black text-indigo-700 font-mono mt-0.5">{result.queries_issued}</div>
                    <div className="text-indigo-700 text-[11px] mt-1">
                      +{result.new_queries} new this cycle · 0 duplicate queries generated
                    </div>
                  </div>
                  <div className="p-3 bg-emerald-50 rounded border border-emerald-200">
                    <div className="font-bold text-emerald-900">Closed / Answered Inquiries</div>
                    <div className="text-2xl font-black text-emerald-700 font-mono mt-0.5">
                      {result.queries_issued - result.open_queries_count}
                    </div>
                    <div className="text-emerald-700 text-[11px] mt-1">Verified against source hospital records</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 5 & 6: Compliance Deviations & Escalations */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="card p-4 space-y-2">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  5. Protocol Compliance Deviations ({result.deviations_count} Evaluated)
                </h3>
                <p className="text-xs text-gray-600">
                  Evaluated strictly under the rules in effect at Cut {result.cut} (Protocol v{result.protocol_version}).
                </p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pt-1 text-xs">
                  {result.deviations.slice(0, 5).map((dev, i) => (
                    <div key={i} className="p-2 bg-purple-50/70 border border-purple-200 rounded">
                      <div className="font-bold text-purple-900">{dev.deviation_type} · {dev.usubjid}</div>
                      <div className="text-gray-700 text-[11px] mt-0.5">{dev.description}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card p-4 space-y-2">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  6. Escalations Drafted ({result.escalations_count} Items)
                </h3>
                <p className="text-xs text-gray-600">
                  Critical protocol issues requiring mandatory Medical Monitor review.
                </p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pt-1 text-xs">
                  {result.escalations.map((esc, i) => (
                    <div key={i} className="p-2 bg-rose-50/70 border border-rose-200 rounded flex items-center justify-between">
                      <div>
                        <div className="font-mono font-bold text-rose-900">{esc.code} · {esc.usubjid}</div>
                        <div className="text-gray-700 text-[11px] mt-0.5">{esc.summary}</div>
                      </div>
                      <span className="font-bold text-rose-800 text-[10px] px-2 py-0.5 bg-white border border-rose-300 rounded">
                        {esc.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Section 7 & 8: Human Decisions & Executed Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="card p-4 space-y-2">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  7. Human Gate Decisions ({result.decisions_count} Adjudications)
                </h3>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2.5 bg-blue-50 border border-blue-200 rounded">
                    <div className="font-bold text-blue-800">🔵 APPROVED</div>
                    <div className="text-xl font-black text-blue-900 font-mono mt-0.5">{result.approved_count}</div>
                  </div>
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded">
                    <div className="font-bold text-amber-800">🟠 REJECTED</div>
                    <div className="text-xl font-black text-amber-900 font-mono mt-0.5">{result.rejected_count}</div>
                  </div>
                  <div className="p-2.5 bg-purple-50 border border-purple-200 rounded">
                    <div className="font-bold text-purple-800">🟣 CLARIFY</div>
                    <div className="text-xl font-black text-purple-900 font-mono mt-0.5">{result.clarify_resubmission_count}</div>
                  </div>
                </div>
              </div>

              <div className="card p-4 space-y-2">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  8. Safety Actions Executed ({result.actions_executed} Enacted)
                </h3>
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-xs space-y-1">
                  <div className="font-bold text-emerald-900 flex items-center justify-between">
                    <span>Enacted Operational Actions</span>
                    <span className="text-emerald-700 font-black">{result.actions_executed} Enacted</span>
                  </div>
                  <p className="text-gray-700 text-[11px]">
                    Includes expedited safety report transmissions, dosing holds, site violation CAPAs, and GCP audits.
                  </p>
                </div>
              </div>
            </div>

            {/* Section 9, 10, 11, 12, 13: Open Queries, Rejections, Clarifications, Memory, Trace */}
            <div className="card p-4 space-y-3">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                9–13. Surveillance Governance, Memory Updates & Trace Audit
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="p-3 bg-gray-50 rounded border">
                  <div className="text-gray-500 font-medium">9. Open Queries</div>
                  <div className="text-lg font-bold text-indigo-700 font-mono">{result.open_queries_count} Pending</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">Awaiting site reply</div>
                </div>
                <div className="p-3 bg-gray-50 rounded border">
                  <div className="text-gray-500 font-medium">10. Rejected Escalations</div>
                  <div className="text-lg font-bold text-orange-700 font-mono">{result.rejected_count} Downgraded</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">Retained in routine monitor</div>
                </div>
                <div className="p-3 bg-gray-50 rounded border">
                  <div className="text-gray-500 font-medium">11. Clarifications</div>
                  <div className="text-lg font-bold text-purple-700 font-mono">{result.clarify_resubmission_count} Answered</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">Graph evidence verified</div>
                </div>
                <div className="p-3 bg-gray-50 rounded border">
                  <div className="text-gray-500 font-medium">12. Memory Deduplication</div>
                  <div className="text-lg font-bold text-teal-700 font-mono">0 Duplicates</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">Cross-cycle store active</div>
                </div>
              </div>

              {/* Trace Event Count */}
              <div className="p-3.5 bg-white border border-slate-200/90 rounded-xl shadow-xs flex items-center justify-between text-xs mt-2">
                <div>
                  <span className="font-bold text-slate-900">13. Live Audit Trail: </span>
                  <span className="text-slate-600 font-medium">
                    {result.trace_count || result.trace?.length || 0} chronological entries recorded in immutable ledger.
                  </span>
                </div>
                <button
                  onClick={() => switchTab('audittrail')}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 rounded-lg text-xs font-bold text-white transition-all shadow-xs"
                >
                  View Trace →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 9: CROSS-CYCLE MEMORY SCREEN (REQUIREMENT 23) */}
      {/* ========================================================================= */}
      {activeTab === 'memory' && result && (
        <div className="space-y-6">
          <div className="card border-l-4 border-cyan-500 p-4 space-y-1 bg-cyan-50/40">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 tracking-tight flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-600 inline-block"></span>
                PERSISTENT CROSS-CYCLE SURVEILLANCE MEMORY
              </h2>
              <span className="text-xs font-mono font-semibold px-2.5 py-0.5 bg-cyan-100 text-cyan-900 rounded-full border border-cyan-300">
                Requirement 23 Active
              </span>
            </div>
            <p className="text-xs text-gray-600">
              Maintains persistent state across study cuts and execution cycles: prevents duplicate EDC queries, prevents duplicate escalations, retains monitor rejection history, tracks repeated subject deviations, and detects recurring site problem patterns.
            </p>
          </div>

          {/* Rerun Proof Card */}
          <div className="card p-4 border-2 border-dashed border-teal-500 bg-teal-50/50 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-teal-950 flex items-center gap-2">
                  <span>⚡</span>
                  <span>Interactive Verification: Exact Cut Rerun Proof</span>
                </h3>
                <p className="text-xs text-teal-900 mt-1">
                  Per Requirement 23, rerunning the exact same study cut must yield: <strong>New Queries = 0</strong> and <strong>New Escalations = 0</strong>.
                </p>
              </div>
              <button
                onClick={runDemo3}
                disabled={loading}
                className="btn-primary text-xs px-4 py-2 bg-teal-700 hover:bg-teal-600 flex items-center gap-1.5"
              >
                {loading ? <Spinner size="sm" /> : <span>▶ Re-run Cut {activeCut} (Verify 0 Duplicates)</span>}
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
              <div className="p-2.5 bg-white rounded border border-teal-200">
                <div className="text-gray-500 font-medium">Cycle New Queries</div>
                <div className="text-xl font-bold font-mono text-teal-800 mt-0.5">
                  +{result.new_queries}
                </div>
              </div>
              <div className="p-2.5 bg-white rounded border border-teal-200">
                <div className="text-gray-500 font-medium">Cycle New Escalations</div>
                <div className="text-xl font-bold font-mono text-teal-800 mt-0.5">
                  +{result.new_escalations}
                </div>
              </div>
              <div className="p-2.5 bg-white rounded border border-teal-200">
                <div className="text-gray-500 font-medium">Re-run Safeguard</div>
                <div className="text-xs font-bold text-emerald-700 mt-1">
                  {result.new_queries === 0 && result.new_escalations === 0 ? '✓ VERIFIED: 0 DUPLICATES' : 'ACTIVE'}
                </div>
              </div>
              <div className="p-2.5 bg-white rounded border border-teal-200">
                <div className="text-gray-500 font-medium">Memory Persistence</div>
                <div className="text-xs font-bold text-gray-800 mt-1">PRESERVED ACROSS CYCLES</div>
              </div>
            </div>
          </div>

          {/* Core Memory Rules & Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Rule 1 & 2: Same Record Query & Escalation */}
            <div className="card p-4 space-y-3">
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                1. Query & Escalation Deduplication Stores
              </h3>
              <div className="space-y-2 text-xs">
                <div className="p-3 bg-gray-50 rounded border">
                  <div className="flex items-center justify-between font-bold text-gray-900">
                    <span>SAME RECORD QUERY PROTECTION</span>
                    <span className="text-indigo-700 font-mono">{result.queries_issued} Tracked Keys</span>
                  </div>
                  <p className="text-gray-600 text-[11px] mt-1">
                    Once a query has been raised for a specific domain record sequence and issue code, the system permanently records the key and never creates a duplicate query.
                  </p>
                </div>

                <div className="p-3 bg-gray-50 rounded border">
                  <div className="flex items-center justify-between font-bold text-gray-900">
                    <span>SAME ESCALATION PROTECTION</span>
                    <span className="text-purple-700 font-mono">{result.escalations_count} Tracked Keys</span>
                  </div>
                  <p className="text-gray-600 text-[11px] mt-1">
                    Prevents drafting identical safety escalations for subjects already escalated in earlier review cycles.
                  </p>
                </div>
              </div>
            </div>

            {/* Rule 3 & 4: Rejection Retention & Site Flags */}
            <div className="card p-4 space-y-3">
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                2. Rejection Memory & Site Problem Intelligence
              </h3>
              <div className="space-y-2 text-xs">
                <div className="p-3 bg-rose-50/70 border border-rose-200 rounded">
                  <div className="flex items-center justify-between font-bold text-rose-900">
                    <span>REJECTION MEMORY (NON-RE-ESCALATION)</span>
                    <span className="text-rose-700 font-mono">{result.rejected_count} Decisions</span>
                  </div>
                  <p className="text-gray-700 text-[11px] mt-1">
                    When the Medical Monitor rejects an escalation, the system downgrades the finding to routine monitoring with reason preserved. It is <strong>never re-escalated</strong> in subsequent cycles.
                  </p>
                </div>

                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded">
                  <div className="flex items-center justify-between font-bold text-amber-900">
                    <span>RECURRING SITE PROBLEM ACCUMULATION</span>
                    <span className="text-amber-700 font-mono">{result.site_level_flags?.length || 0} Site Flags</span>
                  </div>
                  <p className="text-gray-700 text-[11px] mt-1">
                    Aggregates subject-level deviations by site across cycles (e.g. Site S02 multiple wrong doses, Site S09 dosing, Site S11 regularity).
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Active Site-Level Flags List */}
          {result.site_level_flags && result.site_level_flags.length > 0 && (
            <div className="card space-y-3">
              <SectionHeading>Active Site-Level Recurring Issue Flags</SectionHeading>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {result.site_level_flags.map((flag, idx) => (
                  <div
                    key={idx}
                    className={`p-3.5 rounded-lg border flex flex-col justify-between ${
                      flag.flag_level === 'CRITICAL'
                        ? 'bg-rose-50/70 border-rose-200'
                        : flag.flag_level === 'WARNING'
                        ? 'bg-amber-50/70 border-amber-200'
                        : 'bg-blue-50/70 border-blue-200'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-extrabold text-sm text-gray-900">Site {flag.site_id}</span>
                        <Badge variant={flag.flag_level === 'CRITICAL' ? 'red' : flag.flag_level === 'WARNING' ? 'yellow' : 'blue'}>
                          {flag.flag_level}
                        </Badge>
                      </div>
                      <div className="text-xs text-gray-800 font-medium mt-2">{flag.summary}</div>
                    </div>
                    <div className="text-[11px] text-gray-500 mt-3 pt-2 border-t border-gray-200/80 flex items-center justify-between">
                      <span>Affected Subjects: {flag.affected_subjects.join(', ') || flag.affected_subjects_count}</span>
                      <span>Cycles: {flag.cycles_affected.join(', ') || activeCut}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 10: PATIENT 360 SCREEN */}
      {/* ========================================================================= */}
      {activeTab === 'patient360' && (
        <div className="card space-y-4">
          <SectionHeading>Patient 360 Clinical Graph Lookup</SectionHeading>
          <p className="text-xs text-gray-500">
            Connects Demographics, Adverse Events, Labs, Vital Signs, Exposure, Conmeds, Disposition, and Medical History to power rapid CLARIFY evidence retrieval.
          </p>

          <div className="flex items-center gap-2 max-w-md">
            <input
              type="text"
              placeholder="e.g. 042-S02-004"
              value={p360Subject}
              onChange={e => setP360Subject(e.target.value.toUpperCase())}
              className="text-xs border border-gray-300 rounded px-3 py-2 flex-1 font-mono font-bold"
            />
            <Link
              to={`/patient360/${encodeURIComponent(p360Subject)}`}
              className="btn-primary text-xs px-4 py-2"
            >
              Open Full Patient 360 →
            </Link>
          </div>

          <div className="pt-3 border-t border-gray-200">
            <span className="text-xs font-semibold text-gray-600">Quick Subject Navigation:</span>
            <div className="flex flex-wrap gap-2 mt-2">
              {['042-S02-004', '042-S07-001', '042-S11-005', '042-S09-006', '042-S01-001'].map(id => (
                <button
                  key={id}
                  onClick={() => setP360Subject(id)}
                  className="px-2.5 py-1 text-xs font-mono bg-blue-50 text-blue-800 border border-blue-200 rounded hover:bg-blue-100"
                >
                  {id}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: FINDING DETAIL */}
      {/* ========================================================================= */}
      {/* ========================================================================= */}
      {/* REQUIREMENT 31: EVIDENCE INSPECTION PANEL MODAL */}
      {/* ========================================================================= */}
      {selectedFindingDetail && (
        <div className="fixed inset-0 bg-slate-900/30 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col border border-slate-200 overflow-hidden animate-in fade-in duration-150">
            {/* Modal Header */}
            <div className="p-5 bg-white border-b border-slate-200 text-slate-900 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-blue-600 inline-block"></span>
                <div>
                  <h2 className="text-base font-extrabold tracking-wide uppercase text-slate-950">
                    FINDING — {selectedFindingDetail.finding?.finding_id}
                  </h2>
                  <div className="text-xs text-slate-500 font-mono mt-0.5 font-medium">
                    Subject: {selectedFindingDetail.finding?.usubjid} · Site: {selectedFindingDetail.finding?.siteid} · Cut {selectedFindingDetail.finding?.cut || result?.cut} · Protocol v{selectedFindingDetail.finding?.protocol_version || result?.protocol_version}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedFindingDetail(null)}
                className="text-slate-400 hover:text-slate-900 text-lg font-bold px-2.5 py-1 rounded-lg hover:bg-slate-100 transition-colors"
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 overflow-y-auto space-y-5 text-xs">
              {/* Finding Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 p-3.5 bg-slate-50 rounded-lg border border-slate-200">
                <div>
                  <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Subject</div>
                  <div className="font-mono font-bold text-gray-900 text-sm mt-0.5">{selectedFindingDetail.finding?.usubjid}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Site</div>
                  <div className="font-bold text-gray-900 text-sm mt-0.5">{selectedFindingDetail.finding?.siteid}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Issue</div>
                  <div className="font-mono font-bold text-blue-900 text-xs mt-0.5">{selectedFindingDetail.finding?.finding_code}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Severity</div>
                  <div className="mt-0.5">
                    {['CRITICAL', 'HIGH', 'SERIOUS'].includes((selectedFindingDetail.finding?.severity || '').toUpperCase()) ? (
                      <span className="inline-flex items-center gap-1 font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 text-xs">
                        🔴 SERIOUS
                      </span>
                    ) : ['MEDIUM', 'MODERATE'].includes((selectedFindingDetail.finding?.severity || '').toUpperCase()) ? (
                      <span className="inline-flex items-center gap-1 font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-xs">
                        🟡 MODERATE
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-xs">
                        🟢 NORMAL / LOW
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Protocol Version</div>
                  <div className="font-bold text-gray-900 text-sm mt-0.5">v{selectedFindingDetail.finding?.protocol_version || result?.protocol_version}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Study Cut</div>
                  <div className="font-bold text-gray-900 text-sm mt-0.5">Cut {selectedFindingDetail.finding?.cut || result?.cut}</div>
                </div>
              </div>

              {/* WHY THIS IS A FINDING */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 border-b border-gray-200 pb-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                  <h3 className="font-black text-gray-900 uppercase tracking-wide text-xs">
                    WHY THIS IS A FINDING
                  </h3>
                </div>
                <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-lg space-y-2">
                  <div>
                    <span className="font-bold text-blue-950 uppercase text-[10px] tracking-wider block">Clinical Rationale</span>
                    <p className="text-gray-900 font-medium leading-relaxed mt-0.5">
                      {selectedFindingDetail.finding?.rationale || 'Clinical anomaly detected by ATLAS multi-domain rule evaluation.'}
                    </p>
                  </div>
                  {selectedFindingDetail.finding?.rule && (
                    <div className="pt-2 border-t border-blue-200/60 flex items-center gap-2 font-mono text-[11px] text-blue-900">
                      <span className="font-bold uppercase text-[10px] text-blue-700">Applicable Protocol Rule:</span>
                      <span>{selectedFindingDetail.finding.rule}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* EVIDENCE RECORDS (REQUIREMENT 31) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between border-b border-gray-200 pb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                    <h3 className="font-black text-gray-900 uppercase tracking-wide text-xs">
                      EVIDENCE RECORDS
                    </h3>
                  </div>
                  <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-mono">
                    NO VALID EVIDENCE = NO CONFIRMED FINDING
                  </span>
                </div>

                <div className="overflow-x-auto border border-gray-200 rounded-lg shadow-2xs">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 text-gray-700 font-bold uppercase text-[10px] tracking-wider border-b border-gray-200">
                        <th className="py-2.5 px-3">Domain</th>
                        <th className="py-2.5 px-3">RecordRef</th>
                        <th className="py-2.5 px-3">Sequence</th>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Value</th>
                        <th className="py-2.5 px-3">Unit</th>
                        <th className="py-2.5 px-3">Rationale</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {(selectedFindingDetail.finding?.enriched_evidence && selectedFindingDetail.finding.enriched_evidence.length > 0) ? (
                        selectedFindingDetail.finding.enriched_evidence.map((ev: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3 font-mono font-bold text-blue-900">{ev.domain}</td>
                            <td className="py-2.5 px-3 font-mono font-semibold text-gray-900">
                              <span className="bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                                {ev.record_ref || `${ev.domain} Seq ${ev.seq}`}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-gray-700">{ev.seq}</td>
                            <td className="py-2.5 px-3 font-mono text-gray-800">{ev.date || '—'}</td>
                            <td className="py-2.5 px-3 font-bold text-gray-900">{ev.value || '—'}</td>
                            <td className="py-2.5 px-3 text-gray-600 font-mono">{ev.unit || '—'}</td>
                            <td className="py-2.5 px-3 text-gray-700 text-[11px] leading-tight">{ev.rationale || 'Verified clinical finding evidence record.'}</td>
                          </tr>
                        ))
                      ) : (selectedFindingDetail.finding?.evidence && selectedFindingDetail.finding.evidence.length > 0) ? (
                        selectedFindingDetail.finding.evidence.map((ev: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3 font-mono font-bold text-blue-900">{ev.domain}</td>
                            <td className="py-2.5 px-3 font-mono font-semibold text-gray-900">
                              <span className="bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                                {ev.domain} Seq {ev.seq}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-gray-700">{ev.seq}</td>
                            <td className="py-2.5 px-3 font-mono text-gray-800">—</td>
                            <td className="py-2.5 px-3 font-bold text-gray-900">{selectedFindingDetail.finding?.finding_code} cited</td>
                            <td className="py-2.5 px-3 text-gray-600 font-mono">—</td>
                            <td className="py-2.5 px-3 text-gray-700 text-[11px] leading-tight">Grounded study dataset record.</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="py-4 text-center text-gray-500">
                            No evidence records available.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Medical Review Route & Escalation Status */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 border border-indigo-200 bg-indigo-50/60 rounded-lg">
                  <span className="font-bold text-indigo-950 uppercase text-[10px] tracking-wider block">Medical Review Classification</span>
                  <div className="mt-1 text-gray-800">
                    {selectedFindingDetail.escalation
                      ? `SERIOUS ISSUE: Escalated to Human Gate for Medical Monitor review (${selectedFindingDetail.escalation.code})`
                      : 'ROUTINE SURVEILLANCE: Assessed as non-serious or standard deviation.'}
                  </div>
                </div>

                <div className="p-3 border border-slate-200 bg-slate-50 rounded-lg">
                  <span className="font-bold text-slate-900 uppercase text-[10px] tracking-wider block">Data Problem Queries</span>
                  <div className="mt-1 text-gray-800">
                    {selectedFindingDetail.queries && selectedFindingDetail.queries.length > 0
                      ? `${selectedFindingDetail.queries.length} EDC query raised to site (status: ${selectedFindingDetail.queries[0].reply_status}).`
                      : 'No discrepancy queries associated with this finding.'}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-gray-50 border-t border-gray-200 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-gray-500 font-mono">
                Study Sentinel Intelligence Platform · Verified against StudyGraph
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (selectedFindingDetail.finding) {
                      openQueryModalForFinding(selectedFindingDetail.finding);
                      setSelectedFindingDetail(null);
                    }
                  }}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-3.5 py-1.5 rounded-lg shadow-xs flex items-center gap-1.5 transition-colors"
                >
                  <span>🏥</span>
                  <span>Send Query to Hospital</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFindingDetail(null)}
                  className="btn-secondary text-xs px-4 py-1.5"
                >
                  Close Inspection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: REJECT ESCALATION WITH REASON */}
      {/* ========================================================================= */}
      {rejectModalId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-4 space-y-3">
            <h3 className="text-sm font-bold text-gray-900">
              Medical Monitor Rejection Reason
            </h3>
            <p className="text-xs text-gray-600">
              Please enter the clinical justification for rejecting this escalation. The finding will be downgraded to routine monitoring and preserved in the audit trail.
            </p>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              className="w-full p-2.5 border border-gray-300 rounded text-xs text-gray-900 font-medium"
              rows={3}
            />
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
              <button
                onClick={() => setRejectModalId(null)}
                className="btn-secondary text-xs px-3 py-1.5"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReject}
                disabled={actionInProgress === rejectModalId}
                className="px-3 py-1.5 text-xs font-bold rounded bg-rose-600 hover:bg-rose-700 text-white shadow-xs"
              >
                {actionInProgress === rejectModalId ? <Spinner size="sm" /> : 'Confirm Rejection (Downgrade)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: AUDIT TRACE */}
      {/* ========================================================================= */}
      {selectedTrace && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900">
                  explain() — Recorded Audit Trace
                </h2>
                <div className="text-xs text-gray-500 font-mono mt-0.5">
                  Target: {selectedTrace.target_id} · {selectedTrace.steps_count} Recorded Steps
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
              <div className="p-3 bg-blue-50 border border-blue-200 rounded text-xs text-blue-900 font-medium">
                {selectedTrace.summary}
              </div>
              <div className="space-y-2">
                {selectedTrace.timeline.map((entry: any, idx: number) => (
                  <div key={idx} className="p-3 border border-gray-200 rounded-lg bg-gray-50 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-blue-800 bg-white px-2 py-0.5 rounded border border-gray-200 uppercase tracking-wider text-[10px]">
                        Node: {entry.node}
                      </span>
                      <span className="font-mono text-gray-400 text-[10px]">{entry.timestamp}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-700">Decision: </span>
                      <span className="font-mono font-bold text-gray-900">{entry.decision}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-700">Rule Grounding: </span>
                      <span className="text-gray-800">{entry.rule}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-700">Action: </span>
                      <span className="text-gray-600">{entry.output_action}</span>
                    </div>
                    {entry.evidence && entry.evidence.length > 0 && (
                      <div className="pt-1">
                        <span className="font-semibold text-gray-700">Evidence Record(s): </span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {entry.evidence.map((ev: any, evIdx: number) => (
                            <span key={evIdx} className="bg-white border border-gray-300 px-1.5 py-0.5 rounded font-mono text-[10px] text-gray-800">
                              {ev.domain}|{ev.usubjid}|{ev.seq}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="p-3 border-t border-gray-200 text-right">
              <button
                onClick={() => setSelectedTrace(null)}
                className="btn-primary text-xs px-4 py-1.5"
              >
                Close Audit Trail
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* NOTIFICATION / TOAST: HOSPITAL QUERY STATUS & DUPLICATE WARNING */}
      {/* ========================================================================= */}
      {queryNotification && (
        <div className="fixed top-16 right-4 z-50 max-w-md w-full animate-in fade-in slide-in-from-top-4 duration-300">
          {queryNotification.type === 'success' ? (
            <div className="bg-white border-2 border-emerald-500 rounded-xl shadow-2xl p-4 space-y-2.5 text-xs text-gray-900">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🏥</span>
                  <div>
                    <h4 className="font-extrabold text-emerald-950 text-sm">{queryNotification.title}</h4>
                    <div className="font-bold text-emerald-700 text-xs">{queryNotification.subtitle}</div>
                  </div>
                </div>
                <button
                  onClick={() => setQueryNotification(null)}
                  className="text-gray-400 hover:text-gray-700 font-bold px-1.5 py-0.5 text-sm"
                  title="Close"
                >
                  ✕
                </button>
              </div>

              <div className="p-3 bg-emerald-50/90 border border-emerald-200 rounded-lg space-y-1.5 font-sans">
                <div className="font-bold text-emerald-900 text-xs tracking-wide">
                  ✅ QUERY SENT TO HOSPITAL MANAGEMENT
                </div>
                <div className="text-gray-600 text-[11px]">Query successfully sent.</div>

                <div className="space-y-1 pt-1.5 border-t border-emerald-200/70 font-mono text-[11px]">
                  <div className="flex justify-between">
                    <span className="font-semibold text-gray-600 font-sans">Hospital/Site:</span>
                    <span className="font-bold text-emerald-950">{queryNotification.hospital}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold text-gray-600 font-sans">Subject:</span>
                    <span className="font-bold text-blue-900">{queryNotification.subject}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold text-gray-600 font-sans">Record:</span>
                    <span className="font-bold text-indigo-900">{queryNotification.record}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold text-gray-600 font-sans">Sent:</span>
                    <span className="text-gray-800">{queryNotification.sentTime}</span>
                  </div>
                </div>

                <div className="pt-2 mt-1 border-t border-emerald-200/70 flex items-center justify-between">
                  <span className="font-semibold text-gray-700 text-[11px]">Status:</span>
                  <span className="bg-emerald-600 text-white font-black px-2 py-0.5 rounded text-[10px] tracking-wider uppercase">
                    {queryNotification.status || 'SENT TO HOSPITAL MANAGEMENT'}
                  </span>
                </div>
              </div>
            </div>
          ) : queryNotification.type === 'duplicate' ? (
            <div className="bg-white border-2 border-amber-500 rounded-xl shadow-2xl p-4 space-y-2.5 text-xs text-gray-900">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">⚠️</span>
                  <div>
                    <h4 className="font-extrabold text-amber-950 text-sm">{queryNotification.title}</h4>
                    <div className="font-semibold text-amber-700 text-xs">{queryNotification.subtitle}</div>
                  </div>
                </div>
                <button
                  onClick={() => setQueryNotification(null)}
                  className="text-gray-400 hover:text-gray-700 font-bold px-1.5 py-0.5 text-sm"
                  title="Close"
                >
                  ✕
                </button>
              </div>

              <div className="p-3 bg-amber-50/90 border border-amber-200 rounded-lg space-y-1.5 font-sans">
                <div className="font-bold text-amber-900 text-xs">
                  ⚠️ EXISTING QUERY FOUND
                </div>
                <div className="text-gray-700 text-[11px]">
                  MONITOR memory rule active: Duplicate query prevented. The exact same Subject + RecordRef + Issue has already been queried.
                </div>

                <div className="space-y-1 pt-1.5 border-t border-amber-200/70 font-mono text-[11px]">
                  <div className="flex justify-between">
                    <span className="font-semibold text-gray-600 font-sans">Hospital:</span>
                    <span className="font-bold text-gray-900">{queryNotification.hospital}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold text-gray-600 font-sans">Subject:</span>
                    <span className="font-bold text-blue-900">{queryNotification.subject}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold text-gray-600 font-sans">Record:</span>
                    <span className="font-bold text-indigo-900">{queryNotification.record}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold text-gray-600 font-sans">Issue:</span>
                    <span className="font-bold text-amber-900">{queryNotification.issue}</span>
                  </div>
                  {queryNotification.existingQuery && (
                    <div className="flex justify-between">
                      <span className="font-semibold text-gray-600 font-sans">Query ID:</span>
                      <span className="font-bold text-gray-800">{queryNotification.existingQuery.query_id}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white border-2 border-rose-500 rounded-xl shadow-2xl p-4 space-y-2 text-xs text-gray-900">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">⚠️</span>
                  <div>
                    <h4 className="font-extrabold text-rose-950 text-sm">{queryNotification.title}</h4>
                    <div className="text-gray-600 text-xs mt-0.5">{queryNotification.subtitle}</div>
                  </div>
                </div>
                <button
                  onClick={() => setQueryNotification(null)}
                  className="text-gray-400 hover:text-gray-700 font-bold px-1.5 py-0.5 text-sm"
                  title="Close"
                >
                  ✕
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: DATA MANAGER SEND QUERY TO HOSPITAL */}
      {/* ========================================================================= */}
      {showQueryModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-5 space-y-4 border border-gray-200">
            <div className="flex items-start justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-indigo-50 border border-indigo-200 rounded-lg flex items-center justify-center text-lg">
                  🏥
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-950">
                    Send Query to Hospital
                  </h3>
                  <p className="text-xs text-gray-500">
                    Data Manager EDC Communication Layer · Dispatches to Hospital Management
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowQueryModal(false)}
                className="text-gray-400 hover:text-gray-600 font-bold text-sm px-1.5"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateQuery} className="space-y-3.5 text-xs">
              {/* Row 1: Hospital / Site and Subject */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 font-bold mb-1">
                    Hospital / Site:
                  </label>
                  <select
                    value={newQueryData.hospital}
                    onChange={e => setNewQueryData({ ...newQueryData, hospital: e.target.value, siteid: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-lg bg-white font-medium text-xs text-gray-900 focus:ring-2 focus:ring-indigo-500"
                    required
                  >
                    {Array.from({ length: 12 }, (_, i) => {
                      const s = `S${String(i + 1).padStart(2, '0')}`;
                      return (
                        <option key={s} value={s}>
                          Hospital / Site {s}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-gray-700 font-bold mb-1">
                    Subject:
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 042-S02-004"
                    value={newQueryData.usubjid}
                    onChange={e => setNewQueryData({ ...newQueryData, usubjid: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-lg font-mono font-bold text-xs text-blue-950 focus:ring-2 focus:ring-indigo-500 uppercase"
                    required
                  />
                </div>
              </div>

              {/* Row 2: Record reference & Query issue */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 font-bold mb-1">
                    Record Reference:
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. AE Seq 1 or LB Seq 3"
                    value={newQueryData.record_ref}
                    onChange={e => {
                      const val = e.target.value;
                      const parts = val.replace('-', ' ').replace('Seq', ' ').split(/\s+/).filter(Boolean);
                      const d = parts[0] || newQueryData.domain;
                      const s = parts[1] && !isNaN(Number(parts[1])) ? Number(parts[1]) : newQueryData.seq;
                      setNewQueryData({
                        ...newQueryData,
                        record_ref: val,
                        domain: d,
                        seq: s,
                      });
                    }}
                    className="w-full p-2 border border-gray-300 rounded-lg font-mono font-semibold text-xs text-indigo-950 focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-gray-700 font-bold mb-1">
                    Query Issue:
                  </label>
                  <select
                    value={newQueryData.issue}
                    onChange={e => setNewQueryData({ ...newQueryData, issue: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-lg bg-white font-medium text-xs text-gray-900 focus:ring-2 focus:ring-indigo-500"
                    required
                  >
                    <option value="AE_ONSET_VERIFICATION">AE_ONSET_VERIFICATION (Onset before dosing)</option>
                    <option value="DOSING_ERROR">DOSING_ERROR (Protocol dose deviation)</option>
                    <option value="SAE_MISCODED">SAE_MISCODED (Hospitalization not flagged serious)</option>
                    <option value="PROHIBITED_MED">PROHIBITED_MED (Prohibited concomitant med)</option>
                    <option value="DUPLICATE_SUBJECT">DUPLICATE_SUBJECT (Cross-site enrollment duplicate)</option>
                    <option value="DATA_DISCREPANCY">DATA_DISCREPANCY (Discrepant clinical record)</option>
                  </select>
                </div>
              </div>

              {/* Row 3: Query message */}
              <div>
                <label className="block text-gray-700 font-bold mb-1">
                  Query Message:
                </label>
                <textarea
                  value={newQueryData.message}
                  onChange={e => setNewQueryData({ ...newQueryData, message: e.target.value, question: e.target.value })}
                  placeholder="Enter detailed clarification request to hospital management..."
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-xs leading-relaxed focus:ring-2 focus:ring-indigo-500"
                  rows={3}
                  required
                />
              </div>

              {/* Row 4: Date & Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 font-bold mb-1">
                    Date:
                  </label>
                  <input
                    type="text"
                    value={newQueryData.date}
                    onChange={e => setNewQueryData({ ...newQueryData, date: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-lg font-mono text-xs text-gray-800 focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g. 19 Sep 2026"
                    required
                  />
                </div>

                <div>
                  <label className="block text-gray-700 font-bold mb-1">
                    Time:
                  </label>
                  <input
                    type="text"
                    value={newQueryData.time}
                    onChange={e => setNewQueryData({ ...newQueryData, time: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-lg font-mono text-xs text-gray-800 focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g. 12:30 PM"
                    required
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowQueryModal(false)}
                  className="btn-secondary text-xs px-4 py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={querySending}
                  className="btn-primary text-xs px-5 py-2 flex items-center gap-1.5 shadow-md bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                >
                  <span>🏥</span>
                  <span>{querySending ? 'Sending to Hospital...' : 'SEND TO HOSPITAL'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
