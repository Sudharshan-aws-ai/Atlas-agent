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
};
