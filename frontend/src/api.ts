// API client — all calls to FastAPI backend
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

async function fetchJSON<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

import type {
  StudyStats,
  SubjectSummary,
  SubjectDetail,
  Patient360,
  AskResponse,
  FindingsResponse,
} from './types';

export const api = {
  health: () => fetchJSON<{ status: string; subjects: number; sites: number }>('/api/health'),

  stats: () => fetchJSON<StudyStats>('/api/stats'),

  subjects: (site?: string) =>
    fetchJSON<SubjectSummary[]>(`/api/subjects${site ? `?site=${site}` : ''}`),

  subject: (usubjid: string) =>
    fetchJSON<SubjectDetail>(`/api/subjects/${encodeURIComponent(usubjid)}`),

  patient360: (usubjid: string) =>
    fetchJSON<Patient360>(`/api/subjects/${encodeURIComponent(usubjid)}/patient360`),

  ask: (question_id: string, text: string, category?: string) =>
    fetchJSON<AskResponse>('/api/ask', {
      method: 'POST',
      body: JSON.stringify({ question_id, text, category }),
    }),

  findings: () => fetchJSON<FindingsResponse>('/api/findings'),

  rebuild: (cut?: number) =>
    fetchJSON('/api/rebuild', {
      method: 'POST',
      body: JSON.stringify({ cut: cut ?? null }),
    }),

  evidenceRecord: (domain: string, usubjid: string, seq: number) =>
    fetchJSON(`/api/evidence/${domain}/${encodeURIComponent(usubjid)}/${seq}`),

  // Problem 2: MONITOR methods
  monitorRun: (cut?: number, protocol_version?: number) =>
    fetchJSON<any>('/api/monitor/run', {
      method: 'POST',
      body: JSON.stringify({ cut: cut ?? null, protocol_version: protocol_version ?? null }),
    }),

  monitorTrace: (targetId: string) =>
    fetchJSON<any>(`/api/monitor/trace/${encodeURIComponent(targetId)}`),

  monitorQueries: () => fetchJSON<any[]>('/api/monitor/queries'),

  monitorDecisions: () => fetchJSON<any[]>('/api/monitor/decisions'),

  monitorEscalations: () => fetchJSON<any[]>('/api/monitor/escalations'),

  monitorApprove: (escalationId: string, reason?: string) =>
    fetchJSON<any>(`/api/monitor/escalations/${encodeURIComponent(escalationId)}/approve`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason || null }),
    }),

  monitorReject: (escalationId: string, reason?: string) =>
    fetchJSON<any>(`/api/monitor/escalations/${encodeURIComponent(escalationId)}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason || null }),
    }),

  monitorClarify: (escalationId: string, question?: string) =>
    fetchJSON<any>(`/api/monitor/escalations/${encodeURIComponent(escalationId)}/clarify`, {
      method: 'POST',
      body: JSON.stringify({ reason: question || null }),
    }),

  monitorSiteFlags: () => fetchJSON<any[]>('/api/monitor/site-flags'),

  monitorFindings: (cut?: number, protocol_version?: number) =>
    fetchJSON<any[]>(`/api/monitor/findings${cut ? `?cut=${cut}&protocol_version=${protocol_version || ''}` : ''}`),

  monitorFindingDetail: (findingId: string) =>
    fetchJSON<any>(`/api/monitor/findings/${encodeURIComponent(findingId)}`),

  monitorAllTrace: () => fetchJSON<any[]>('/api/monitor/trace'),

  patientDiseaseGraph: () => fetchJSON<any>('/api/patient-disease-graph'),

  postQuery: (data: {
    hospital?: string;
    siteid?: string;
    usubjid: string;
    record_ref?: string;
    domain?: string;
    seq?: number;
    issue?: string;
    message?: string;
    question?: string;
    date?: string;
    time?: string;
    finding_id?: string;
  }) => fetchJSON<any>('/api/queries', { method: 'POST', body: JSON.stringify(data) }),

  // Problem 3: WATCH methods
  watchSurveillance: (cutFrom = 1, cutTo = 12) =>
    fetchJSON<any>('/api/watch/surveillance', {
      method: 'POST',
      body: JSON.stringify({ cut_from: cutFrom, cut_to: cutTo }),
    }),

  watchAdversarial: (cut?: number) =>
    fetchJSON<any[]>(`/api/watch/adversarial${cut ? `?cut=${cut}` : ''}`),

  watchRunPeriod: (cutFrom = 1, cutTo = 12) =>
    fetchJSON<any>('/api/watch/run-period', {
      method: 'POST',
      body: JSON.stringify({ cut_from: cutFrom, cut_to: cutTo }),
    }),

  watchReport: () =>
    fetchJSON<any>('/api/watch/report'),

  watchTimeline: () =>
    fetchJSON<any[]>('/api/watch/timeline'),

  watchSiteRisk: () =>
    fetchJSON<any[]>('/api/watch/site-risk'),

  watchDecisions: () =>
    fetchJSON<any[]>('/api/watch/decisions'),

  watchEscalations: () =>
    fetchJSON<any[]>('/api/watch/escalations'),

  watchExplain: (signalId: string) =>
    fetchJSON<any>(`/api/watch/explain/${encodeURIComponent(signalId)}`),
};


