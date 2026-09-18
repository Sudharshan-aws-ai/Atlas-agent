import { useState } from 'react';
import { api } from '../api';
import type { AskResponse } from '../types';
import { Spinner, ErrorMessage, SectionHeading } from '../components';

// Sample questions users can click
const SAMPLE_QUESTIONS = [
  { id: 'Q01', text: 'How many subjects were enrolled in the study?', category: 'COUNT' },
  { id: 'Q02', text: 'Which subjects are Hy\'s law candidates?', category: 'FINDING' },
  { id: 'Q03', text: 'List subjects with dosing errors.', category: 'FINDING' },
  { id: 'Q04', text: 'Which subjects at site S03 have elevated liver enzymes?', category: 'TRAP' },
  { id: 'Q05', text: 'How many subjects were in the DRUG arm?', category: 'COUNT' },
  { id: 'Q06', text: 'List subjects with miscoded SAEs.', category: 'FINDING' },
  { id: 'Q07', text: 'Which subjects received prohibited concomitant medications?', category: 'FINDING' },
  { id: 'Q08', text: 'List subjects discontinued due to adverse events.', category: 'FINDING' },
  { id: 'Q09', text: 'What is the screening HbA1c for subject 042-S01-001?', category: 'LOOKUP' },
  { id: 'Q10', text: 'How many subjects are duplicate enrollments at site S07?', category: 'TRAP' },
];

function formatAnswer(answer: unknown): React.ReactNode {
  if (answer === null || answer === undefined) return <span className="text-gray-400">—</span>;
  if (typeof answer === 'number') return <span className="text-3xl font-bold text-blue-700">{answer}</span>;
  if (typeof answer === 'string') return <span className="text-blue-700">{answer}</span>;
  if (Array.isArray(answer)) {
    if (answer.length === 0) {
      return <span className="italic text-gray-400">Empty list (no matches or trap question)</span>;
    }
    if (typeof answer[0] === 'string') {
      return (
        <div className="flex flex-wrap gap-2">
          {answer.map((s, i) => (
            <span key={i} className="px-2 py-1 bg-blue-50 text-blue-700 rounded font-mono text-sm">{s}</span>
          ))}
        </div>
      );
    }
    return (
      <pre className="text-xs bg-gray-50 p-3 rounded overflow-x-auto">{JSON.stringify(answer, null, 2)}</pre>
    );
  }
  return <pre className="text-xs bg-gray-50 p-3 rounded overflow-x-auto">{JSON.stringify(answer, null, 2)}</pre>;
}

export default function AskAtlas() {
  const [questionText, setQuestionText] = useState('');
  const [category, setCategory] = useState('');
  const [response, setResponse] = useState<AskResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedEvidence, setExpandedEvidence] = useState(false);

  const submit = async (text: string, cat?: string) => {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    setResponse(null);
    setExpandedEvidence(false);
    const qid = `Q-${Date.now()}`;
    try {
      const res = await api.ask(qid, text.trim(), cat || undefined);
      setResponse(res);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit(questionText, category || undefined);
  };

  const handleSample = (q: typeof SAMPLE_QUESTIONS[0]) => {
    setQuestionText(q.text);
    setCategory(q.category);
    submit(q.text, q.category);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Ask ATLAS</h1>
        <p className="text-sm text-gray-500 mt-1">
          Deterministic clinical QA — all answers backed by verifiable evidence citations
        </p>
      </div>

      {/* Sample questions */}
      <div className="card">
        <SectionHeading>Sample Questions</SectionHeading>
        <div className="flex flex-wrap gap-2">
          {SAMPLE_QUESTIONS.map(q => (
            <button
              key={q.id}
              onClick={() => handleSample(q)}
              className="px-3 py-1.5 text-xs rounded-full border border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-gray-600 hover:text-blue-700 transition-colors font-medium"
              title={q.text}
            >
              {q.id}: {q.text.slice(0, 40)}…
            </button>
          ))}
        </div>
      </div>

      {/* Question form */}
      <form onSubmit={handleSubmit} className="card space-y-4">
        <SectionHeading>Ask a Question</SectionHeading>
        <textarea
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          rows={3}
          placeholder="Type your clinical question here…"
          value={questionText}
          onChange={e => setQuestionText(e.target.value)}
        />
        <div className="flex gap-3 items-center">
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Category (auto-detect)</option>
            <option value="COUNT">COUNT</option>
            <option value="FINDING">FINDING</option>
            <option value="LOOKUP">LOOKUP</option>
            <option value="TRAP">TRAP</option>
          </select>
          <button type="submit" className="btn-primary" disabled={loading || !questionText.trim()}>
            {loading ? <Spinner size="sm" /> : null}
            Ask ATLAS
          </button>
        </div>
      </form>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center py-12 gap-3 text-gray-400">
          <Spinner size="lg" />
          <span className="text-sm">Querying study knowledge graph…</span>
        </div>
      )}

      {/* Error */}
      {error && <ErrorMessage message={error} />}

      {/* Answer */}
      {response && !loading && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <SectionHeading>Answer</SectionHeading>
            <span className="text-xs text-gray-400 font-mono">{response.question_id}</span>
          </div>

          <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
            {formatAnswer(response.answer)}
          </div>

          {/* Evidence */}
          <div>
            <button
              onClick={() => setExpandedEvidence(v => !v)}
              className="text-sm font-semibold text-gray-600 hover:text-blue-600 transition-colors flex items-center gap-2"
            >
              {expandedEvidence ? '▼' : '▶'} Evidence Citations ({response.evidence_count})
            </button>

            {expandedEvidence && (
              <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200">
                {response.evidence.length === 0 ? (
                  <div className="p-4 text-sm text-gray-400 italic">No evidence records attached (trap question or empty result).</div>
                ) : (
                  <table className="min-w-full divide-y divide-gray-100 text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="table-th">Domain</th>
                        <th className="table-th">Subject ID</th>
                        <th className="table-th">Seq</th>
                        <th className="table-th">Record Key</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {response.evidence.map((e, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="table-td font-mono text-blue-700">{e.domain}</td>
                          <td className="table-td font-mono">{e.usubjid}</td>
                          <td className="table-td">{e.seq}</td>
                          <td className="table-td font-mono text-gray-400">{e.key}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>

          {/* Adversarial defense notice */}
          <p className="text-xs text-gray-400 italic border-t pt-3">
            ⚠ ATLAS answers are strictly data-derived. Trap questions return empty results. Adversarial injections in study documents are never followed.
          </p>
        </div>
      )}
    </div>
  );
}
