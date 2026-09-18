"""
Stage 2: MONITOR — Persistent Cross-Cycle Memory.
Maintains state across review cycles:
- Query Memory: Prevents duplicate queries; tracks open/unanswered queries.
- Escalation Memory: Prevents duplicate escalations; retains rejected escalations as monitoring-only.
- Site Recurring Memory: Tracks recurring site deviations and accumulates site-level flags.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Set

from .models import EscalationDraft, HumanGateDecision, MonitoringOnlyItem, Query, SiteFlag


class MonitorMemory:
    """
    Persistent memory across review cycles.
    Separates dynamic study data state from permanent action history.
    """

    def __init__(self):
        # Query tracking: key -> Query
        # Key format: f"{domain}|{usubjid}|{seq}|{issue_code}"
        self.queries_by_key: Dict[str, Query] = {}
        self.issued_query_keys: Set[str] = set()

        # Escalation tracking: key -> EscalationDraft
        # Key format: f"{code}|{usubjid}"
        self.escalations_by_key: Dict[str, EscalationDraft] = {}
        self.issued_escalation_keys: Set[str] = set()

        # Rejected escalations: key -> rejection reason
        # Rejected findings are NEVER re-escalated in future cycles; kept as monitoring-only.
        self.rejected_escalations: Dict[str, str] = {}

        # Decisions history: decision_id -> HumanGateDecision
        self.decisions_history: Dict[str, HumanGateDecision] = {}

        # Site recurring tracking: site_id -> stats dict
        self.site_issue_stats: Dict[str, Dict[str, Any]] = {}

        # History of completed cycles
        self.cycle_history: List[Dict[str, Any]] = []

    # ------------------------------------------------------------------------
    # Query Memory
    # ------------------------------------------------------------------------
    def is_query_issued(self, domain: str, usubjid: str, seq: int, issue_code: str = "") -> bool:
        """Checks if a query for this record/issue has already been issued in any cycle."""
        key = f"{domain}|{usubjid}|{seq}|{issue_code}"
        return key in self.issued_query_keys

    def register_query(self, query: Query, issue_code: str = "") -> None:
        """Registers an issued query in persistent memory."""
        key = f"{query.domain}|{query.usubjid}|{query.seq}|{issue_code}"
        self.issued_query_keys.add(key)
        self.queries_by_key[key] = query

    def update_query_status(self, domain: str, usubjid: str, seq: int, status: str, reply_text: str = "", issue_code: str = "") -> None:
        """Updates query status (e.g. from OPEN to ANSWERED or CLOSED)."""
        key = f"{domain}|{usubjid}|{seq}|{issue_code}"
        if key in self.queries_by_key:
            self.queries_by_key[key].reply_status = status
            if reply_text:
                self.queries_by_key[key].reply_text = reply_text

    def get_open_queries(self) -> List[Query]:
        """Returns all currently unanswered/open queries across all sites."""
        return [q for q in self.queries_by_key.values() if q.reply_status.upper() == "OPEN"]

    # ------------------------------------------------------------------------
    # Escalation Memory
    # ------------------------------------------------------------------------
    def is_escalation_issued(self, code: str, usubjid: str) -> bool:
        """Checks if an escalation has already been raised for this subject and finding code."""
        key = f"{code}|{usubjid}"
        return key in self.issued_escalation_keys

    def is_rejected(self, code: str, usubjid: str) -> bool:
        """Checks if this finding was previously rejected by the medical monitor."""
        key = f"{code}|{usubjid}"
        return key in self.rejected_escalations

    def get_rejection_reason(self, code: str, usubjid: str) -> Optional[str]:
        """Gets the recorded rejection reason for a previously rejected escalation."""
        return self.rejected_escalations.get(f"{code}|{usubjid}")

    def register_escalation(self, escalation: EscalationDraft) -> None:
        """Registers a drafted or submitted escalation."""
        key = f"{escalation.code}|{escalation.usubjid}"
        self.issued_escalation_keys.add(key)
        self.escalations_by_key[key] = escalation

    def register_decision(self, decision: HumanGateDecision) -> None:
        """Registers a human gate monitor decision and updates escalation status."""
        self.decisions_history[decision.decision_id] = decision
        key = f"{decision.code}|{decision.target}"
        if decision.outcome.upper() == "REJECTED":
            self.rejected_escalations[key] = decision.reason
            if key in self.escalations_by_key:
                self.escalations_by_key[key].status = "REJECTED"
        elif decision.outcome.upper() in ["APPROVED", "CLARIFY"]:
            if key in self.escalations_by_key:
                self.escalations_by_key[key].status = (
                    "APPROVED" if (decision.resubmission_outcome or decision.outcome) == "APPROVED" else decision.outcome
                )

    # ------------------------------------------------------------------------
    # Site Recurring Problems Memory
    # ------------------------------------------------------------------------
    def record_site_issue(self, site_id: str, usubjid: str, problem_type: str, cut: int) -> None:
        """Tracks recurring subject and site issues over longitudinal review cycles."""
        if not site_id:
            return
        if site_id not in self.site_issue_stats:
            self.site_issue_stats[site_id] = {
                "affected_subjects": set(),
                "cycles_affected": set(),
                "problem_types": set(),
                "escalations_count": 0,
            }

        stats = self.site_issue_stats[site_id]
        stats["affected_subjects"].add(usubjid)
        stats["cycles_affected"].add(cut)
        stats["problem_types"].add(problem_type)

    def record_site_escalation(self, site_id: str) -> None:
        """Increments escalation count for a site."""
        if site_id and site_id in self.site_issue_stats:
            self.site_issue_stats[site_id]["escalations_count"] += 1

    def compute_site_flags(self) -> List[SiteFlag]:
        """
        Computes active site-level flags for sites with recurring issues or patterns
        (e.g. multiple subjects with dosing errors at S01, high query volume, or repeated cycles).
        """
        flags: List[SiteFlag] = []
        open_queries = self.get_open_queries()
        site_open_queries: Dict[str, int] = {}
        for q in open_queries:
            site_open_queries[q.siteid] = site_open_queries.get(q.siteid, 0) + 1

        for site_id, stats in sorted(self.site_issue_stats.items()):
            subj_count = len(stats["affected_subjects"])
            cycle_count = len(stats["cycles_affected"])
            prob_count = len(stats["problem_types"])
            open_q = site_open_queries.get(site_id, 0)
            esc_count = stats.get("escalations_count", 0)

            # Determine severity level
            if subj_count >= 3 or (subj_count >= 2 and cycle_count >= 2) or open_q >= 3:
                level = "CRITICAL" if subj_count >= 3 or open_q >= 3 else "WARNING"
                problems_str = ", ".join(sorted(list(stats["problem_types"])))
                summary = (
                    f"Site {site_id} has recurring issues: {subj_count} affected subjects across "
                    f"{cycle_count} cycle(s) ({problems_str}). Open queries: {open_q}."
                )
                flags.append(SiteFlag(
                    site_id=site_id,
                    affected_subjects_count=subj_count,
                    affected_subjects=sorted(list(stats["affected_subjects"])),
                    cycles_affected=sorted(list(stats["cycles_affected"])),
                    problem_types=sorted(list(stats["problem_types"])),
                    open_queries_count=open_q,
                    escalations_count=esc_count,
                    flag_level=level,
                    summary=summary,
                ))
            elif subj_count >= 1 and (cycle_count >= 2 or esc_count >= 1):
                level = "WATCH"
                problems_str = ", ".join(sorted(list(stats["problem_types"])))
                summary = f"Site {site_id} on monitoring watch list: {subj_count} subject(s) flagged for {problems_str}."
                flags.append(SiteFlag(
                    site_id=site_id,
                    affected_subjects_count=subj_count,
                    affected_subjects=sorted(list(stats["affected_subjects"])),
                    cycles_affected=sorted(list(stats["cycles_affected"])),
                    problem_types=sorted(list(stats["problem_types"])),
                    open_queries_count=open_q,
                    escalations_count=esc_count,
                    flag_level=level,
                    summary=summary,
                ))

        return flags
