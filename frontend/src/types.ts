// Shared TypeScript types for ATLAS Study Sentinel

export interface StudyStats {
  cut_used: number;
  protocol_version: number;
  subjects_covered: number;
  unique_individuals: number;
  duplicate_enrollments_detected: number;
  sites_count: number;
  nodes: number;
  edges: number;
  records_indexed: number;
  corrections_applied: number;
  build_time_seconds: number;
  lab_records: number;
  ae_records: number;
  ex_records: number;
  cm_records: number;
  ds_records: number;
  vs_records: number;
  eg_records: number;
  mh_records: number;
  sites: string[];
}

export interface SubjectSummary {
  usubjid: string;
  siteid: string;
  arm: string;
  age: number | null;
  sex: string;
  initials: string;
  screening_hba1c: number | null;
  is_duplicate: boolean;
}

export interface SubjectDetail extends SubjectSummary {
  birth_date: string | null;
  first_dose_date: string | null;
  is_duplicate_enrollment: boolean;
  duplicate_of: string | null;
}

export interface LabRecord {
  seq: number;
  visit: string;
  date: string | null;
  test: string;
  result: string;
  unit: string;
  normalized: {
    raw: string | null;
    numeric_value: number | null;
    is_numeric: boolean;
    is_less_than: boolean;
    is_not_detected: boolean;
  };
}

export interface AERecord {
  seq: number;
  term: string;
  severity: string;
  serious_site_flag: string;
  hospitalisation: string;
  is_serious: boolean;
  is_miscoded: boolean;
  start_date: string | null;
  end_date: string | null;
  outcome: string;
  narrative: string;
}

export interface ExposureRecord {
  seq: number;
  visit: string;
  date: string | null;
  dose: number | null;
  unit: string;
  treatment: string;
}

export interface ConMedRecord {
  seq: number;
  treatment: string;
  class: string;
  indication: string;
  start_date: string | null;
  dose: number | null;
}

export interface DispositionRecord {
  seq: number;
  status: string;
  date: string | null;
  reason: string;
}

export interface VitalSignRecord {
  seq: number;
  visit: string;
  date: string | null;
  test: string;
  value: string;
  unit: string;
}

export interface ECGRecord {
  seq: number;
  visit: string;
  date: string | null;
  test: string;
  value: string;
  unit: string;
}

export interface MHRecord {
  seq: number;
  term: string;
}

export interface Patient360 {
  usubjid: string;
  siteid: string;
  arm: string;
  age: number | null;
  sex: string;
  initials: string;
  birth_date: string | null;
  first_dose_date: string | null;
  screening_hba1c: number | null;
  is_duplicate_enrollment: boolean;
  duplicate_of: string | null;
  visits: string[];
  laboratory: LabRecord[];
  adverse_events: AERecord[];
  exposure: ExposureRecord[];
  concomitant_medications: ConMedRecord[];
  disposition: DispositionRecord[];
  vital_signs: VitalSignRecord[];
  ecg: ECGRecord[];
  medical_history: MHRecord[];
  findings?: {
    type: string;
    title: string;
    description: string;
    evidence: string[];
    transaminase?: string;
    bilirubin?: string;
  }[];
  applicable_protocol_version: number;
  active_cut: number | null;
  monitor?: {
    findings: Array<{
      finding_id: string;
      finding_code: string;
      severity: string;
      rationale: string;
      rule: string;
      evidence: Array<{ domain: string; usubjid: string; seq: number }>;
    }>;
    queries: Array<{
      query_id: string;
      domain: string;
      seq: number;
      question: string;
      reply_status: string;
      reply_text: string;
    }>;
    escalations: Array<{
      escalation_id: string;
      code: string;
      severity: string;
      summary: string;
      status: string;
      reason_for_escalation: string;
    }>;
    decisions: Array<{
      decision_id: string;
      code: string;
      outcome: string;
      reason: string;
      resubmission_outcome?: string;
    }>;
    actions: Array<{
      action_id: string;
      action_type: string;
      detail: string;
    }>;
  };
}

export interface EvidenceRef {
  domain: string;
  usubjid: string;
  seq: number;
  key: string;
  test?: string;
  value?: string;
  unit?: string;
  date?: string;
  visit?: string;
  term?: string;
  severity?: string;
  dose?: string | number;
  medication?: string;
  class?: string;
  arm?: string;
  siteid?: string;
}

export interface AskResponse {
  question_id: string;
  answer: unknown;
  text?: string;
  confidence?: number;
  evidence: EvidenceRef[];
  evidence_count: number;
  steps_used?: string[];
  calculation?: {
    original: string;
    converted: string;
    conversion_factor: string;
  } | null;
  protocol_rule?: string | null;
  is_trap?: boolean;
}

export interface HysLawCandidate {
  usubjid: string;
  transaminase: string | null;
  transaminase_multiple: number | null;
  bilirubin_multiple: number | null;
  day_difference: number | null;
  rationale: string;
}

export interface DosingError {
  usubjid: string;
  visit: string;
  arm: string | null;
  actual_dose: number;
  dose_unit: string;
  date: string | null;
  ex_seq: number;
  reason: string;
}

export interface MiscodedSAE {
  usubjid: string;
  ae_term: string;
  severity: string;
  aeshosp: string;
  aeser_coded: string;
  ae_seq: number;
  reason: string;
}

export interface ProhibitedMed {
  usubjid: string;
  drug: string;
  drug_class: string;
  date: string | null;
  indication: string;
  cm_seq: number;
  reason: string;
}

export interface DuplicateEnrollment {
  usubjid: string;
  duplicate_of: string;
}

export interface FindingsResponse {
  hys_law_candidates: HysLawCandidate[];
  dosing_errors: DosingError[];
  miscoded_saes: MiscodedSAE[];
  prohibited_medications: ProhibitedMed[];
  duplicate_enrollments: DuplicateEnrollment[];
  summary: {
    hys_law_count: number;
    dosing_error_count: number;
    miscoded_sae_count: number;
    prohibited_med_count: number;
    duplicate_enrollment_count: number;
  };
}
