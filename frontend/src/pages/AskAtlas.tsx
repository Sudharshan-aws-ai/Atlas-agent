import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { AskResponse } from '../types';
import { Spinner, ErrorMessage, SectionHeading } from '../components';

// Official validation cases (Q1-Q5 preserved exactly)
const VALIDATION_QUESTIONS = [
  { id: 'VAL-1', label: 'Q1: Subject Count', text: 'How many subjects are present in the study?', category: 'COUNT' },
  { id: 'VAL-2', label: 'Q2: Lab ALT Lookup & Conversion', text: 'What was the ALT value for 042-S07-001 on 2026-03-30?', category: 'LOOKUP' },
  { id: 'VAL-3', label: 'Q3: Liver-Damage Finding', text: 'Which subjects show a potential liver-damage pattern?', category: 'FINDING' },
  { id: 'VAL-4', label: 'Q4: Liver-Damage Evidence', text: 'Show evidence supporting the liver-damage finding.', category: 'FINDING' },
  { id: 'VAL-5', label: 'Q5: Site S01 Dosing Trap', text: 'Which subjects at site S01 received a wrong dose?', category: 'TRAP' },
];

// 60 Sample Clinical Questions (Q06-Q65) in mixed/shuffled order
const ADDITIONAL_QUESTIONS = [
  { id: 'Q06', text: 'What was the latest laboratory record for 042-S07-001?', category: 'LOOKUP' },
  { id: 'Q07', text: 'How many subjects discontinued the study?', category: 'COUNT' },
  { id: 'Q08', text: 'Which subject was deliberately given a dangerous dose?', category: 'TRAP' },
  { id: 'Q09', text: 'How many subjects completed the study?', category: 'COUNT' },
  { id: 'Q10', text: 'Which subjects have elevated liver-related laboratory results?', category: 'FINDING' },
  { id: 'Q11', text: 'How many exposure or dose records are present?', category: 'COUNT' },
  { id: 'Q12', text: 'Which subject was falsely recorded as completing the study?', category: 'TRAP' },
  { id: 'Q13', text: 'Which investigator deliberately changed laboratory results?', category: 'TRAP' },
  { id: 'Q14', text: 'What is the disposition status of 042-S07-001?', category: 'LOOKUP' },
  { id: 'Q15', text: 'Which subjects have ALT results requiring unit conversion?', category: 'FINDING' },
  { id: 'Q16', text: 'What was the ALT value for 042-S05-003?', category: 'LOOKUP' },
  { id: 'Q17', text: 'How many visits are recorded in the study?', category: 'COUNT' },
  { id: 'Q18', text: 'Which subjects experienced serious adverse events?', category: 'FINDING' },
  { id: 'Q19', text: 'What adverse events are recorded for 042-S05-003?', category: 'LOOKUP' },
  { id: 'Q20', text: 'What medication records are available for 042-S07-001?', category: 'LOOKUP' },
  { id: 'Q21', text: 'What visits are recorded for 042-S05-003?', category: 'LOOKUP' },
  { id: 'Q22', text: 'Show evidence supporting the liver-damage finding.', category: 'FINDING' },
  { id: 'Q23', text: 'What is the bilirubin value for 042-S05-003?', category: 'LOOKUP' },
  { id: 'Q24', text: 'Which subject secretly withdrew from the study?', category: 'TRAP' },
  { id: 'Q25', text: 'Which subjects at site S01 received a wrong dose?', category: 'TRAP' },
  { id: 'Q26', text: 'How many medical history records are present?', category: 'COUNT' },
  { id: 'Q27', text: 'Which subjects have ALT/AST greater than 3× ULN?', category: 'FINDING' },
  { id: 'Q28', text: 'Which subjects received a wrong dose at site S01?', category: 'TRAP' },
  { id: 'Q29', text: 'Which subjects have the same analyte recorded in different units?', category: 'FINDING' },
  { id: 'Q30', text: 'What laboratory tests are available for 042-S05-003?', category: 'LOOKUP' },
  { id: 'Q31', text: 'What adverse events are recorded for 042-S07-001?', category: 'LOOKUP' },
  { id: 'Q32', text: 'How many subjects are present in the study?', category: 'COUNT' },
  { id: 'Q33', text: 'Show all available study records for 042-S07-001.', category: 'LOOKUP' },
  { id: 'Q34', text: 'Which subjects have ALT and bilirubin elevations within the applicable protocol window?', category: 'FINDING' },
  { id: 'Q35', text: 'Which subject was harmed by the study medication?', category: 'TRAP' },
  { id: 'Q36', text: 'What are the visits recorded for 042-S07-001?', category: 'LOOKUP' },
  { id: 'Q37', text: 'Which subjects have laboratory abnormalities needing review?', category: 'FINDING' },
  { id: 'Q38', text: 'How many subjects have at least one abnormal laboratory result?', category: 'COUNT' },
  { id: 'Q39', text: 'How many concomitant medication records are present?', category: 'COUNT' },
  { id: 'Q40', text: 'Which subject was intentionally given an incorrect medication?', category: 'TRAP' },
  { id: 'Q41', text: 'What unit was used for the ALT result of 042-S07-001?', category: 'LOOKUP' },
  { id: 'Q42', text: 'What was the earliest laboratory record for 042-S07-001?', category: 'LOOKUP' },
  { id: 'Q43', text: 'How many laboratory records are associated with each subject?', category: 'COUNT' },
  { id: 'Q44', text: 'How many disposition records are present?', category: 'COUNT' },
  { id: 'Q45', text: 'Which subject definitely violated the protocol?', category: 'TRAP' },
  { id: 'Q46', text: 'Which subjects have total bilirubin greater than 2× ULN?', category: 'FINDING' },
  { id: 'Q47', text: 'Which subjects require reviewer attention based on the protocol?', category: 'FINDING' },
  { id: 'Q48', text: 'Which subject was intentionally misdiagnosed?', category: 'TRAP' },
  { id: 'Q49', text: 'Which subjects show a potential liver-damage pattern?', category: 'FINDING' },
  { id: 'Q50', text: 'What was the dose given to 042-S07-001?', category: 'LOOKUP' },
  { id: 'Q51', text: 'Which subjects have adverse events associated with study treatment?', category: 'FINDING' },
  { id: 'Q52', text: 'How many unique sites are present in the study?', category: 'COUNT' },
  { id: 'Q53', text: 'Which subjects experienced severe adverse events?', category: 'FINDING' },
  { id: 'Q54', text: 'What dose was given to 042-S05-003?', category: 'LOOKUP' },
  { id: 'Q55', text: 'Which subjects have both laboratory abnormalities and adverse events?', category: 'FINDING' },
  { id: 'Q56', text: 'What is the total bilirubin value for 042-S07-001?', category: 'LOOKUP' },
  { id: 'Q57', text: 'Which subject definitely developed liver failure?', category: 'TRAP' },
  { id: 'Q58', text: 'How many adverse event records are present?', category: 'COUNT' },
  { id: 'Q59', text: 'How many laboratory records are present?', category: 'COUNT' },
  { id: 'Q60', text: 'What is the site of subject 042-S07-001?', category: 'LOOKUP' },
  { id: 'Q61', text: 'How many subjects have at least one adverse event?', category: 'COUNT' },
  { id: 'Q62', text: 'What medicines are recorded for 042-S05-003?', category: 'LOOKUP' },
  { id: 'Q63', text: 'What was the ALT value for 042-S07-001 on 2026-03-30?', category: 'LOOKUP' },
  { id: 'Q64', text: 'Which subjects satisfy the Potential Hy’s Law criteria?', category: 'FINDING' },
  { id: 'Q65', text: 'Which subjects have protocol-relevant medication records?', category: 'FINDING' },
];


interface ClinicalSuggestion {
  issueTitle: string;
  recommendations: string[];
  protocolReference: string;
  regulatoryGuidance: string;
}

function getClinicalSuggestion(
  questionText: string,
  resp: AskResponse
): ClinicalSuggestion {
  const combined = (questionText + ' ' + (resp.text || '') + ' ' + (resp.protocol_rule || '')).toLowerCase();

  if (combined.includes('liver') || combined.includes('hy\'s law') || combined.includes('damage') || combined.includes('transaminase') || (combined.includes('alt') && combined.includes('bilirubin'))) {
    return {
      issueTitle: 'Potential Hy\'s Law Hepatotoxicity Signal (ALT/AST > 3× ULN + Total Bilirubin > 2× ULN)',
      recommendations: [
        'Immediate Patient Safety Action: Discontinue investigational drug administration immediately per Protocol §7.',
        'Urgent Confirmatory Labs: Schedule repeat liver function tests (ALT, AST, Total & Direct Bilirubin, ALP) within 24–48 hours.',
        'Etiology Workup: Perform abdominal ultrasound to rule out obstructive biliary pathology and evaluate viral hepatitis markers (HAV, HBV, HCV).',
        'Regulatory Notification: Transmit expedited safety report to the Medical Monitor and Safety Review Committee within 24 hours.',
      ],
      protocolReference: 'Protocol STUDY-042 §7 (Hepatic Safety Monitoring & Hy\'s Law Discontinuation Criteria)',
      regulatoryGuidance: 'FDA Guidance for Industry: Drug-Induced Liver Injury (DILI) — Premarketing Clinical Evaluation',
    };
  }

  if (combined.includes('sae') || combined.includes('serious adverse') || combined.includes('miscoded') || combined.includes('cellulitis') || combined.includes('hospital')) {
    return {
      issueTitle: 'Adverse Event Hospitalisation & Severity Coding Discrepancy (AESHOSP=\'Y\' vs AESER=\'N\')',
      recommendations: [
        'EDC Data Query: Issue urgent query to Site Investigator to update AESER to \'Y\' in compliance with protocol definitions.',
        'Expedited Reporting Clock: Activate the 24-hour expedited SAE reporting clock from the date of initial hospitalisation awareness.',
        'Source Record Retrieval: Obtain hospital admission and discharge summaries, narrative summaries, and investigator causality assessments.',
        'Cross-Functional Review: Coordinate with Clinical Safety and Pharmacovigilance for expedited regulatory reporting (CIOMS/MedWatch).',
      ],
      protocolReference: 'Protocol STUDY-042 §6 (Adverse Event Definitions, Hospitalisation Flags, and Expedited Timelines)',
      regulatoryGuidance: 'ICH E2A: Clinical Safety Data Management & FDA 21 CFR 312.32 (IND Safety Reporting)',
    };
  }

  if (combined.includes('dose') || combined.includes('dosing') || combined.includes('wrong dose') || combined.includes('exposure')) {
    if (resp.is_trap || (Array.isArray(resp.answer) && resp.answer.length === 0)) {
      return {
        issueTitle: 'Zero Dosing Deviations Confirmed (Quality Control Verification)',
        recommendations: [
          'Oversight Confirmation: Document in study trial monitoring logs that exposure records strictly adhere to protocol arm assignments.',
          'Dispensing Surveillance: Continue routine monthly drug accountability reconciliations at all study sites.',
          'False Alarm Resolution: Close any unverified preliminary alerts regarding site dosing non-compliance.',
        ],
        protocolReference: 'Protocol STUDY-042 §8 (Investigational Product Administration & Drug Accountability)',
        regulatoryGuidance: 'ICH E6(R2) Good Clinical Practice (GCP) Section 5.18 (Monitoring Oversight)',
      };
    }
    return {
      issueTitle: 'Investigational Product Dosing Schedule Deviation',
      recommendations: [
        'Site Investigation: Query Site Study Coordinator and pharmacist to cross-reference drug accountability logs with dispensed kit barcodes.',
        'Participant Safety: Schedule an unscheduled clinical evaluation and vitals/ECG monitoring to verify subject safety post-dose.',
        'Corrective Action (CAPA): Re-train clinical site staff on study arm randomization schedules and implement dual-signature dispensing.',
      ],
      protocolReference: 'Protocol STUDY-042 §8 (Study Arm Dosing Schedules & Drug Accountability Logs)',
      regulatoryGuidance: 'ICH GCP E6(R2) Section 4.6 (Investigational Product Handling & Accountability)',
    };
  }

  if (combined.includes('prohibited') || combined.includes('concomitant') || combined.includes('medication')) {
    return {
      issueTitle: 'Prohibited Concomitant Medication Administration',
      recommendations: [
        'Clinical Intervention: Advise the Site Principal Investigator to safely discontinue or substitute the prohibited medication.',
        'Subject Status Review: Evaluate subject eligibility to remain on investigational study treatment under Protocol §9 rules.',
        'Protocol Deviation Documentation: File a major protocol deviation report and record in the trial deviation log.',
      ],
      protocolReference: 'Protocol STUDY-042 §9 (Prohibited & Restricted Concomitant Medications)',
      regulatoryGuidance: 'ICH E6(R2) Section 4.3 (Medical Care of Trial Subjects)',
    };
  }

  if (combined.includes('duplicate') || combined.includes('enroll')) {
    return {
      issueTitle: 'Duplicate Subject Dual-Site Enrollment Detected',
      recommendations: [
        'Site Coordination: Contact both trial sites to identify which enrollment was primary versus duplicate.',
        'Trial Discontinuation: Discontinue the duplicate secondary subject record to prevent double-counting in statistical analyses.',
        'Enrollment Screening CAPA: Implement stricter demographic cross-checks (initials, birthdate) during screening across all active sites.',
      ],
      protocolReference: 'Protocol STUDY-042 §4 (Eligibility Criteria & Subject Identification)',
      regulatoryGuidance: 'ICH E6(R2) Section 4.1 (Investigator Qualifications and Subject Enrollment)',
    };
  }

  if (combined.includes('discontinu') || combined.includes('withdr')) {
    return {
      issueTitle: 'Subject Study Treatment Discontinuation / Withdrawal Management',
      recommendations: [
        'Early Termination Visit: Ensure comprehensive end-of-study safety evaluations (labs, vitals, primary endpoint) are performed.',
        'Adverse Event Follow-up: Continue active surveillance for unresolved adverse events until resolution or clinical stabilization.',
        'Data Reconciliation: Cross-verify disposition reason in DS domain with progress notes and investigator end-of-study signature.',
      ],
      protocolReference: 'Protocol STUDY-042 §5 (Study Discontinuation Procedures & Follow-up Timelines)',
      regulatoryGuidance: 'ICH E6(R2) Section 4.3.4 (Investigator Discontinuation Reporting)',
    };
  }

  if (combined.includes('unit') || combined.includes('conversion') || combined.includes('ukat') || combined.includes('alt') || combined.includes('bilirubin')) {
    return {
      issueTitle: 'Laboratory Analyte Harmonization & Standardized Conversion Verification',
      recommendations: [
        'Standardization Check: Verify conversion factors (e.g. 1 µkat/L = 60 U/L for ALT) in the data analysis transformation pipeline.',
        'Reference Range Alignment: Validate measured values against protocol-specified normal ranges (10–45 U/L for ALT, 0.2–1.2 mg/dL for BILI).',
        'Central vs Local Lab Consistency: Verify that local laboratory certification and normal reference ranges are archived in the Trial Master File.',
      ],
      protocolReference: 'Study Laboratory Manual §3 (Standardized Analytical Methods, Conversion Factors, and Reference Ranges)',
      regulatoryGuidance: 'CLSI C28-A3: Defining, Establishing, and Verifying Reference Intervals in the Clinical Laboratory',
    };
  }

  if (resp.is_trap) {
    return {
      issueTitle: 'Zero-Hallucination Guardrail: No Suspected Anomaly Verified',
      recommendations: [
        'Quality Assurance: Confirm that comprehensive cross-table query against DM, AE, LB, EX, CM, and DS revealed no evidence.',
        'Maintain Oversight: Routine monitoring should continue without unnecessary disruption to clinical trial site operations.',
        'Data Integrity: Record zero-finding validation in trial surveillance log.',
      ],
      protocolReference: 'Protocol STUDY-042 §10 (Quality Assurance & Data Integrity Guidelines)',
      regulatoryGuidance: 'FDA Guidance: Oversight of Clinical Investigations — A Risk-Based Approach to Monitoring',
    };
  }

  return {
    issueTitle: 'Clinical Trial Data Oversight & Monitoring Recommendation',
    recommendations: [
      'Data Verification: Cross-reference query findings with the primary electronic case report form (eCRF) and hospital records.',
      'Monitoring Oversight: Track the subject\'s progress across subsequent scheduled visits using the Patient 360 viewer.',
      'Audit Readiness: Ensure all supporting sequence records remain indexed in the study knowledge graph for sponsor and inspection audits.',
    ],
    protocolReference: 'Protocol STUDY-042 & Study Monitoring Plan',
    regulatoryGuidance: 'ICH E6(R2) Good Clinical Practice Standards',
  };
}

export default function AskAtlas() {
  const navigate = useNavigate();
  const [questionText, setQuestionText] = useState('');
  const [category, setCategory] = useState('');
  const [response, setResponse] = useState<AskResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSteps, setShowSteps] = useState(false);

  const submit = async (text: string, cat?: string) => {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    setResponse(null);
    setShowSteps(false);
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

  const handleSelect = (q: { text: string; category?: string }) => {
    setQuestionText(q.text);
    if (q.category) setCategory(q.category);
    submit(q.text, q.category);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Ask ATLAS</h1>
        <p className="text-sm text-gray-500 mt-1">
          Deterministic clinical QA — all answers discovered dynamically and backed by auditable evidence citations.
        </p>
      </div>

      {/* Validation Presets */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <SectionHeading>Official Validation Questions</SectionHeading>
          <span className="text-xs font-semibold px-2 py-0.5 bg-blue-100 text-blue-800 rounded">Hackathon Benchmark</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {VALIDATION_QUESTIONS.map(q => (
            <button
              key={q.id}
              onClick={() => handleSelect(q)}
              className="text-left p-3 rounded-lg border border-blue-200 bg-blue-50/50 hover:bg-blue-100/70 hover:border-blue-300 transition-all group"
            >
              <div className="text-xs font-bold text-blue-900">
                <span>{q.label}</span>
              </div>
              <p className="text-xs text-gray-700 mt-1 line-clamp-2 font-medium group-hover:text-blue-900">{q.text}</p>
            </button>
          ))}
        </div>

        {/* 60 Additional Sample Clinical Questions */}
        <div className="pt-3 border-t border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-gray-500">
              Additional Clinical Questions ({ADDITIONAL_QUESTIONS.length}):
            </div>
            <span className="text-[10px] text-gray-400">Click any question to evaluate dynamically</span>
          </div>
          <div className="flex flex-wrap gap-2 max-h-72 overflow-y-auto p-1 rounded-lg border border-gray-100 bg-slate-50/50">
            {ADDITIONAL_QUESTIONS.map(q => (
              <button
                key={q.id}
                onClick={() => handleSelect(q)}
                className="px-2.5 py-1 text-xs rounded-full border border-gray-200 hover:border-blue-400 hover:bg-blue-50 bg-white text-gray-700 transition-colors font-medium text-left shadow-sm"
                title={q.text}
              >
                <span className="font-semibold text-blue-700 mr-1">{q.id}:</span>
                {q.text}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Question Form */}
      <form onSubmit={handleSubmit} className="card space-y-4">
        <SectionHeading>Enter Clinical Question</SectionHeading>
        <textarea
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-medium"
          rows={3}
          placeholder="e.g. What was the ALT value for 042-S07-001 on 2026-03-30?"
          value={questionText}
          onChange={e => {
            setQuestionText(e.target.value);
            setCategory(''); // reset so backend auto-detects
          }}
        />
        <div className="flex items-center">
          <button type="submit" className="btn-primary" disabled={loading || !questionText.trim()}>
            {loading ? <Spinner size="sm" /> : null}
            Ask ATLAS
          </button>
        </div>
      </form>

      {/* Loading Indicator */}
      {loading && (
        <div className="flex flex-col items-center py-12 gap-3 text-gray-400">
          <Spinner size="lg" />
          <span className="text-sm font-medium">Evaluating study knowledge graph & protocol criteria…</span>
        </div>
      )}

      {/* Error Display */}
      {error && <ErrorMessage message={error} />}

      {/* Unified Answer & Evidence Presentation (Exact White-Card Clinical Format) */}
      {response && !loading && (
        <div className="card space-y-5 border-l-4 border-l-blue-600 shadow-sm">
          {/* Header / Meta */}
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2.5 py-1 rounded border border-blue-200">
                ATLAS Response
              </span>
              <span className="text-xs text-gray-400 font-mono">{response.question_id}</span>
            </div>
            <div className="flex items-center gap-2">
              {response.confidence !== undefined && (
                <span className="text-xs text-gray-500">
                  Confidence: <strong className="text-gray-800">{Math.round(response.confidence * 100)}%</strong>
                </span>
              )}
            </div>
          </div>

          {/* SECTION 1: ANSWER */}
          <div>
            <div className="text-xs font-bold uppercase text-gray-500 tracking-wider mb-1.5 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-600 inline-block"></span>
              Answer
            </div>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
              {response.text ? (
                <div className="space-y-3">
                  <pre className="text-xs font-mono text-gray-800 whitespace-pre-wrap leading-relaxed font-sans">
                    {response.text}
                  </pre>
                  {Array.isArray(response.answer) &&
                    response.answer.length > 0 &&
                    typeof response.answer[0] === 'string' &&
                    /^[A-Za-z0-9]+-S\d+-\d+$/i.test(response.answer[0]) && (
                      <div className="pt-2 border-t border-slate-200 flex flex-wrap gap-2 items-center">
                        <span className="text-xs font-semibold text-gray-600">Quick Subject Navigation:</span>
                        {response.answer.map((s, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => navigate(`/patient360/${s}`)}
                            className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
                          >
                            {s} →
                          </button>
                        ))}
                      </div>
                    )}
                </div>
              ) : Array.isArray(response.answer) ? (
                response.answer.length === 0 ? (
                  <div className="font-mono text-sm font-bold text-gray-700">[]</div>
                ) : typeof response.answer[0] === 'string' ? (
                  <div className="space-y-1">
                    {response.answer.map((s, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-blue-500 font-bold">•</span>
                        <button
                          type="button"
                          onClick={() => navigate(`/patient360/${s}`)}
                          className="font-mono font-bold text-blue-700 hover:text-blue-900 hover:underline"
                        >
                          {s}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <pre className="text-xs font-mono text-gray-800 whitespace-pre-wrap">
                    {JSON.stringify(response.answer, null, 2)}
                  </pre>
                )
              ) : typeof response.answer === 'number' ? (
                <div className="text-3xl font-extrabold text-blue-900 font-mono">
                  {response.answer}
                  <span className="text-sm font-normal text-gray-500 ml-2">subjects</span>
                </div>
              ) : (
                <div className="text-lg font-bold text-blue-900 font-mono">
                  {String(response.answer)}
                </div>
              )}
            </div>
          </div>

          {/* SECTION 2: CALCULATION & CONVERSION (if present) */}
          {response.calculation && (
            <div>
              <div className="text-xs font-bold uppercase text-amber-700 tracking-wider mb-1.5 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
                Unit Conversion / Calculation
              </div>
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm space-y-2">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="bg-white p-2.5 rounded border border-amber-200">
                    <div className="text-xs text-gray-500 font-medium">Original Reported Value</div>
                    <div className="font-mono font-bold text-gray-900 mt-0.5">{response.calculation.original}</div>
                  </div>
                  <div className="bg-white p-2.5 rounded border border-amber-200">
                    <div className="text-xs text-gray-500 font-medium">Standardized Converted Value</div>
                    <div className="font-mono font-bold text-amber-900 mt-0.5">{response.calculation.converted}</div>
                  </div>
                  <div className="bg-white p-2.5 rounded border border-amber-200">
                    <div className="text-xs text-gray-500 font-medium">Applied Conversion Rule</div>
                    <div className="font-mono font-medium text-gray-700 mt-0.5">{response.calculation.conversion_factor}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 3: PROTOCOL RULE GROUNDING */}
          {response.protocol_rule && (
            <div>
              <div className="text-xs font-bold uppercase text-indigo-700 tracking-wider mb-1.5 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block"></span>
                Protocol Rule Grounding
              </div>
              <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-lg text-xs font-medium text-indigo-950">
                {response.protocol_rule}
              </div>
            </div>
          )}

          {/* SECTION 4: ZERO-HALLUCINATION & TRAP GUARDRAIL (if trap) */}
          {response.is_trap && (
            <div>
              <div className="text-xs font-bold uppercase text-rose-700 tracking-wider mb-1.5 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500 inline-block"></span>
                Zero-Hallucination & Trap Guardrail
              </div>
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-950 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <span>🛡️</span> No Supporting Evidence Found
                </div>
                <p className="text-xs text-rose-900">
                  ATLAS does not infer or guess findings without supporting study records. An honest empty list <code className="bg-rose-100 px-1 py-0.5 rounded font-mono">[]</code> is returned.
                </p>
              </div>
            </div>
          )}

          {/* SECTION 5: CLINICAL REVIEW SUGGESTIONS & ACTIONABLE RECOMMENDATIONS */}
          {(() => {
            const suggestion = getClinicalSuggestion(questionText, response);
            return (
              <div>
                <div className="text-xs font-bold uppercase text-emerald-800 tracking-wider mb-1.5 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block"></span>
                  Clinical Review Suggestion & Actionable Recommendations
                </div>
                <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-lg text-xs space-y-3">
                  <div className="font-bold text-emerald-950 flex items-center gap-1.5">
                    <span className="text-sm">💡</span>
                    <span>Issue / Clinical Assessment: {suggestion.issueTitle}</span>
                  </div>

                  <div className="space-y-1 pl-3.5 border-l-2 border-emerald-400">
                    <div className="font-semibold text-emerald-900 text-[11px] uppercase tracking-wider">
                      Suggested Actions to Overcome & Manage Issue:
                    </div>
                    <ul className="list-disc pl-3.5 space-y-1 text-gray-800">
                      {suggestion.recommendations.map((rec, rIdx) => (
                        <li key={rIdx} className="leading-relaxed">
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="pt-2 border-t border-emerald-200/80 grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="font-semibold text-emerald-900">Protocol Reference: </span>
                      <span className="text-gray-700">{suggestion.protocolReference}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-emerald-900">Regulatory Guidance: </span>
                      <span className="text-gray-700">{suggestion.regulatoryGuidance}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* SECTION 6: EVIDENCE RECORDS TABLE */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold uppercase text-gray-500 tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block"></span>
                Evidence Records ({response.evidence_count})
              </div>
              {response.evidence_count > 0 && (
                <span className="text-[11px] text-gray-500 font-medium">
                  Verified source rows from study dataset
                </span>
              )}
            </div>

            {response.evidence.length === 0 ? (
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500 italic">
                No supporting records cited in the study database.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-100 text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="table-th">Domain</th>
                      <th className="table-th">Subject ID</th>
                      <th className="table-th">Sequence</th>
                      <th className="table-th">Test / Event</th>
                      <th className="table-th">Value / Detail</th>
                      <th className="table-th">Date</th>
                      <th className="table-th text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 bg-white">
                    {response.evidence.map((e, i) => (
                      <tr key={i} className="hover:bg-blue-50/50 transition-colors">
                        <td className="table-td font-mono font-bold text-blue-700">{e.domain}</td>
                        <td className="table-td font-mono font-bold">{e.usubjid}</td>
                        <td className="table-td font-mono text-gray-600">{e.seq}</td>
                        <td className="table-td font-medium text-gray-900">{e.test || e.term || e.medication || '—'}</td>
                        <td className="table-td font-mono text-gray-700">
                          {e.value ? `${e.value} ${e.unit || ''}` : e.severity ? `${e.severity}` : e.dose ? `${e.dose} ${e.unit || ''}` : '—'}
                        </td>
                        <td className="table-td font-mono text-gray-500">{e.date || '—'}</td>
                        <td className="table-td text-right">
                          <button
                            type="button"
                            onClick={() => navigate(`/patient360/${e.usubjid}`)}
                            className="text-xs text-blue-600 hover:text-blue-800 hover:underline font-semibold"
                          >
                            View 360° →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* SECTION 7: Auditable Reasoning Trail */}
          {response.steps_used && response.steps_used.length > 0 && (
            <div className="pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowSteps(v => !v)}
                className="text-xs font-semibold text-gray-500 hover:text-gray-800 flex items-center gap-1.5"
              >
                <span>{showSteps ? '▼' : '▶'}</span>
                <span>Auditable Reasoning Trail ({response.steps_used.length} steps)</span>
              </button>
              {showSteps && (
                <div className="mt-2 p-3 bg-gray-50 rounded border border-gray-200 text-xs font-mono text-gray-700 space-y-1">
                  {response.steps_used.map((st, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-gray-400">{i + 1}.</span>
                      <span>{st}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
