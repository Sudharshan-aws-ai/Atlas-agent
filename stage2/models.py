"""
Stage 2: MONITOR — Clinical Surveillance and Review Crew Models.
Data models for findings, review decisions, queries, compliance deviations,
escalations, site flags, audit trace, and cycle review reports.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from starter.schemas import RecordRef


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class Finding:
    finding_id: str
    finding_code: str  # HYS_LAW_CANDIDATE, DOSING_ERROR, SAE_MISCODED, PROHIBITED_MED, DUPLICATE_SUBJECT, IMPLAUSIBLE_SITE_PATTERN, DATA_QUALITY
    usubjid: str
    siteid: str
    cut: int
    severity: str = "MEDIUM"  # INFO, LOW, MEDIUM, HIGH, CRITICAL
    rationale: str = ""
    evidence: List[RecordRef] = field(default_factory=list)
    details: Dict[str, Any] = field(default_factory=dict)
    rule: str = ""
    status: str = "DETECTED"  # DETECTED, REVIEWED, QUERIED, ESCALATED, APPROVED, REJECTED, MONITORING_ONLY

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["evidence"] = [
            e.model_dump() if hasattr(e, "model_dump") else (e.to_dict() if hasattr(e, "to_dict") else e.__dict__)
            for e in self.evidence
        ]
        return d


@dataclass
class EscalationDraft:
    escalation_id: str
    code: str
    usubjid: str
    siteid: str
    severity: str  # CRITICAL, HIGH, MEDIUM
    summary: str
    evidence: List[RecordRef] = field(default_factory=list)
    alternatives: List[str] = field(default_factory=list)
    reason_for_escalation: str = ""
    status: str = "PENDING"  # PENDING, APPROVED, REJECTED, MONITORING_ONLY
    clarification_question: Optional[str] = None
    clarification_response: Optional[str] = None
    resubmission_outcome: Optional[str] = None
    timestamp: str = field(default_factory=_now_iso)

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["evidence"] = [
            e.model_dump() if hasattr(e, "model_dump") else (e.to_dict() if hasattr(e, "to_dict") else e.__dict__)
            for e in self.evidence
        ]
        return d


@dataclass
class MonitoringOnlyItem:
    finding_id: str
    code: str
    usubjid: str
    siteid: str
    reason: str
    evidence: List[RecordRef] = field(default_factory=list)
    timestamp: str = field(default_factory=_now_iso)

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["evidence"] = [
            e.model_dump() if hasattr(e, "model_dump") else (e.to_dict() if hasattr(e, "to_dict") else e.__dict__)
            for e in self.evidence
        ]
        return d


@dataclass
class Query:
    query_id: str
    finding_id: str
    domain: str
    usubjid: str
    siteid: str
    seq: int
    question: str
    reply_status: str  # OPEN, ANSWERED, CLOSED, SENT TO HOSPITAL MANAGEMENT
    reply_text: str
    cut: int = 12
    timestamp: str = field(default_factory=_now_iso)
    issue: Optional[str] = None
    record_ref: Optional[str] = None
    date: Optional[str] = None
    time: Optional[str] = None
    evidence: List[RecordRef] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["evidence"] = [
            e.model_dump() if hasattr(e, "model_dump") else (e.to_dict() if hasattr(e, "to_dict") else e.__dict__)
            for e in self.evidence
        ]
        return d


@dataclass
class ComplianceDeviation:
    deviation_id: str
    usubjid: str
    siteid: str
    protocol_version: int
    rule_section: str
    deviation_type: str
    description: str
    evidence: List[RecordRef] = field(default_factory=list)
    timestamp: str = field(default_factory=_now_iso)

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["evidence"] = [
            e.model_dump() if hasattr(e, "model_dump") else (e.to_dict() if hasattr(e, "to_dict") else e.__dict__)
            for e in self.evidence
        ]
        return d


@dataclass
class HumanGateDecision:
    decision_id: str
    finding_id: str
    code: str
    target: str
    outcome: str  # APPROVED, REJECTED, CLARIFY
    reason: str
    resubmission_outcome: Optional[str] = None
    resubmission_reason: Optional[str] = None
    clarification_provided: Optional[str] = None
    timestamp: str = field(default_factory=_now_iso)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class SiteFlag:
    site_id: str
    affected_subjects_count: int
    affected_subjects: List[str]
    cycles_affected: List[int]
    problem_types: List[str]
    open_queries_count: int
    escalations_count: int
    flag_level: str  # WATCH, WARNING, CRITICAL
    summary: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class TraceEntry:
    timestamp: str
    node: str  # detect, medical_review, data_manager, compliance, human_gate, execute
    finding_id: str
    input_summary: str
    rule: str
    evidence: List[Dict[str, Any]]
    decision: str
    output_action: str
    details: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ExecutionAction:
    action_id: str
    decision_id: str
    finding_id: str
    action_type: str
    detail: str
    timestamp: str = field(default_factory=_now_iso)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ReviewReport:
    cut: int
    protocol_version: int
    findings_detected: int
    new_findings: int
    queries_issued: int
    new_queries: int
    deviations_count: int
    escalations_count: int
    new_escalations: int
    decisions_count: int
    approved_count: int
    rejected_count: int
    clarify_resubmission_count: int
    monitoring_only_count: int
    actions_executed: int
    open_queries_count: int
    findings: List[Dict[str, Any]] = field(default_factory=list)
    medical_review_results: List[Dict[str, Any]] = field(default_factory=list)
    queries: List[Dict[str, Any]] = field(default_factory=list)
    deviations: List[Dict[str, Any]] = field(default_factory=list)
    escalations: List[Dict[str, Any]] = field(default_factory=list)
    human_gate_decisions: List[Dict[str, Any]] = field(default_factory=list)
    monitoring_only_items: List[Dict[str, Any]] = field(default_factory=list)
    site_level_flags: List[Dict[str, Any]] = field(default_factory=list)
    trace: List[Dict[str, Any]] = field(default_factory=list)
    execution_summary: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)
