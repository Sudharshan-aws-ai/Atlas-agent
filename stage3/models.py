"""
Stage 3: WATCH Models, Data Structures, and Budget / Escalation Trackers.
Enforces typed structures for:
- Explanation (strictly trace-grounded)
- SurveillanceReport (executive trial surveillance summary)
- BudgetManager (80% degradation safeguard)
- EscalationTracker (slow human response + 4-cut standing limits rule)
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set
from starter.schemas import RecordRef


@dataclass
class Explanation:
    """
    Structured decision explanation retrieved strictly from recorded audit trace.
    Never reconstructs reasoning post-hoc; references live trace records.
    """
    decision_id: str
    what: str
    evidence: List[RecordRef] = field(default_factory=list)
    evidence_lines: List[str] = field(default_factory=list)
    alternatives: List[str] = field(default_factory=list)
    why: str = ""
    consistent_with_trace: bool = True
    node: str = "watch"
    cut: int = 12
    status: str = "CONFIRMED"

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["evidence"] = [e.model_dump() if hasattr(e, "model_dump") else e.__dict__ for e in self.evidence]
        return d


@dataclass
class TrackedEscalation:
    """Tracks an escalation's lifecycle across longitudinal study cuts."""
    escalation_id: str
    code: str
    usubjid: str
    siteid: str
    severity: str
    summary: str
    first_seen_cut: int
    last_seen_cut: int
    status: str = "PENDING"  # PENDING, APPROVED, REJECTED, CLARIFY, UNANSWERED
    age_in_cuts: int = 0
    standing_limit_active: bool = False
    evidence: List[RecordRef] = field(default_factory=list)
    alternatives: List[str] = field(default_factory=list)
    human_response_notes: str = ""
    resubmission_count: int = 0

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["evidence"] = [e.model_dump() if hasattr(e, "model_dump") else e.__dict__ for e in self.evidence]
        return d


class EscalationTracker:
    """
    Manages slow/unreliable human monitor simulation across cuts.
    - Monitor answers ~2 cuts later and only ~60% of the time.
    - If 4 cuts pass without response (age_in_cuts >= 4):
      Transitions to UNANSWERED / STANDING_LIMITS.
      Silence is NEVER treated as approval.
      No approval-gated actions are executed.
    """

    def __init__(self):
        self.escalations: Dict[str, TrackedEscalation] = {}
        self.history: List[Dict[str, Any]] = []

    def register_or_update(
        self,
        escalation_id: str,
        code: str,
        usubjid: str,
        siteid: str,
        severity: str,
        summary: str,
        cut: int,
        evidence: List[RecordRef],
        alternatives: List[str],
    ) -> TrackedEscalation:
        if escalation_id not in self.escalations:
            esc = TrackedEscalation(
                escalation_id=escalation_id,
                code=code,
                usubjid=usubjid,
                siteid=siteid,
                severity=severity,
                summary=summary,
                first_seen_cut=cut,
                last_seen_cut=cut,
                status="PENDING",
                age_in_cuts=0,
                evidence=evidence,
                alternatives=alternatives,
            )
            self.escalations[escalation_id] = esc
            return esc

        esc = self.escalations[escalation_id]
        esc.last_seen_cut = cut
        esc.age_in_cuts = cut - esc.first_seen_cut

        # Enforce 4-cut standing limit rule if unanswered
        if esc.status == "PENDING":
            if esc.age_in_cuts >= 4:
                esc.status = "UNANSWERED"
                esc.standing_limit_active = True
                esc.human_response_notes = (
                    f"Unanswered after {esc.age_in_cuts} cuts. "
                    "Safety policy: CONTINUE UNDER STANDING LIMITS. "
                    "NO APPROVAL-GATED ACTION EXECUTED (silence is not approval)."
                )

        return esc

    def simulate_monitor_response(self, cut: int, rng_seed: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        Simulates realistic delayed monitor response (~2 cuts later, ~60% rate).
        Deterministic based on escalation_id to ensure reproducibility.
        """
        adjudicated = []
        for esc in self.escalations.values():
            if esc.status == "PENDING" and esc.age_in_cuts >= 2:
                # Deterministic hash score between 0.0 and 1.0
                score = (hash(esc.escalation_id + str(cut)) % 100) / 100.0
                if score < 0.60:
                    # 60% of respondents take action
                    if score < 0.40:
                        esc.status = "APPROVED"
                        esc.human_response_notes = "Approved by Medical Monitor at Human Gate."
                    elif score < 0.52:
                        esc.status = "REJECTED"
                        esc.human_response_notes = "Rejected by Medical Monitor; downgraded to monitoring with clinical rationale."
                    else:
                        esc.status = "CLARIFY"
                        esc.human_response_notes = "Clarification requested: search Patient 360 for baseline labs and conmeds."
                    adjudicated.append(esc.to_dict())
        return adjudicated


class BudgetManager:
    """
    Manages execution compute/model budget across the 12-cut period.
    Tracks budget consumption.
    When >= 80% budget is consumed:
    - Sets is_degraded = True
    - Throttles expensive narrative generation
    - STRICTLY PRESERVES deterministic safety checks, critical finding detection,
      escalation logic, corrections, and live trace logging.
    """

    def __init__(self, total_budget: float = 100.0):
        self.total_budget = total_budget
        self.budget_used = 0.0
        self.is_degraded = False
        self.audit_log: List[Dict[str, Any]] = []

    def consume(self, amount: float, task_name: str, cut: int) -> float:
        self.budget_used = min(self.total_budget, self.budget_used + amount)
        pct = (self.budget_used / self.total_budget) * 100.0
        if pct >= 80.0 and not self.is_degraded:
            self.is_degraded = True

        self.audit_log.append({
            "cut": cut,
            "task": task_name,
            "consumed": amount,
            "total_used": round(self.budget_used, 2),
            "percent_used": round(pct, 1),
            "degraded": self.is_degraded,
        })
        return self.budget_used

    @property
    def budget_remaining(self) -> float:
        return max(0.0, round(self.total_budget - self.budget_used, 2))

    @property
    def should_generate_proactive_narratives(self) -> bool:
        """Throttles non-essential narrative generation when budget >= 80%."""
        return not self.is_degraded


@dataclass
class SurveillanceReport:
    """
    Executive 12-cut surveillance report summarizing clinical safety,
    adversarial defenses, site risk, and operational integrity.
    Readable by non-technical clinical reviewers.
    """
    period: str
    cuts_processed: List[int]
    total_subjects: int
    signals_detected: List[Dict[str, Any]]
    site_risk: List[Dict[str, Any]]
    protocol_deviations: List[Dict[str, Any]]
    adversarial_events: List[Dict[str, Any]]
    open_items: List[Dict[str, Any]]
    escalations: List[Dict[str, Any]]
    queries: List[Dict[str, Any]]
    human_responses: List[Dict[str, Any]]
    unanswered_escalations: List[Dict[str, Any]]
    budget_used: float
    budget_remaining: float
    budget_degraded: bool
    corrections_processed: List[Dict[str, Any]]
    new_sites: List[str]
    new_domains: List[str]
    key_decisions: List[Dict[str, Any]]
    timeline: List[Dict[str, Any]]
    generated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    def summary_markdown(self) -> str:
        lines = [
            f"# STUDY SENTINEL — 12-CUT SURVEILLANCE REPORT",
            f"**Period**: {self.period} | **Generated**: {self.generated_at}",
            f"**Cuts Monitored**: {len(self.cuts_processed)} ({', '.join(map(str, self.cuts_processed))})",
            "",
            "## 1. Executive Summary",
            f"- **Total Subjects Monitored**: {self.total_subjects}",
            f"- **Safety Signals Identified**: {len(self.signals_detected)}",
            f"- **Adversarial / Integrity Events Defended**: {len(self.adversarial_events)}",
            f"- **EDC Discrepancy Queries Raised**: {len(self.queries)}",
            f"- **Medical Escalations Drafted**: {len(self.escalations)}",
            f"- **Unanswered Escalations (Standing Limits)**: {len(self.unanswered_escalations)}",
            f"- **Budget Consumed**: {self.budget_used:.1f}% (Degradation active: {self.budget_degraded})",
            "",
            "## 2. Adversarial Scenarios Handled",
        ]
        for adv in self.adversarial_events:
            lines.append(f"- **{adv.get('category')}** ({adv.get('target')}): {adv.get('description')}")
            lines.append(f"  *Defense Action*: `{adv.get('defense_action')}`")

        lines.extend([
            "",
            "## 3. Site Risk Stratification",
        ])
        for sr in self.site_risk[:5]:
            lines.append(f"- **Site {sr.get('siteid')}**: Risk Tier `{sr.get('risk_tier')}` (Score: {sr.get('risk_score', 0):.1f}) — {sr.get('summary')}")

        return "\n".join(lines)
