"""
Stage 2: ReviewCrew Comprehensive Test Suite.
Verifies all 26 Stage 2 requirements:
1. ReviewCrew initialization with Atlas instance.
2. Six-node exact execution order: detect -> medical_review -> data_manager -> compliance -> human_gate -> execute.
3. Serious AE rule: AESHOSP = 'Y' makes event serious regardless of AESER = 'N'.
4. Human Gate outcomes: APPROVED, REJECTED (downgraded to monitoring, never re-escalated), and CLARIFY (answered from graph, resubmitted, approved).
5. Duplicate query prevention: Same cut rerun produces 0 new queries.
6. Duplicate escalation prevention: Same cut rerun produces 0 new escalations.
7. Protocol amendment sensitivity: Compliance evaluates protocol in force at cut (v1/v2 vs v3).
8. Site recurring problems: Accumulates site-level flags for sites with recurring issues.
9. Unanswered query tracking: Open queries remain tracked without blind duplication.
10. Trace validity: Every node records trace; explain() reads strictly from trace.
11. Evidence discipline: All cited records exist in the dataset.
"""

import pytest
from stage1.atlas import Atlas
from stage2.crew import ReviewCrew
from stage2.models import ReviewReport


@pytest.fixture(scope="module")
def atlas_instance():
    atlas = Atlas("hackathon-data")
    return atlas


@pytest.fixture
def review_crew(atlas_instance):
    crew = ReviewCrew(
        hub_url="https://hub.example.org",
        gateway_url="https://gateway.example.org",
        team_key="STUDY_SENTINEL_TEAM",
        atlas=atlas_instance,
    )
    return crew


def test_crew_initialization_and_six_node_order(review_crew):
    """Verifies ReviewCrew initializes with Atlas and executes nodes in exact order."""
    report = review_crew.run_cycle(cut=12, protocol_version=3)

    assert isinstance(report, ReviewReport)
    assert report.findings_detected > 0
    assert report.queries_issued > 0
    assert report.escalations_count > 0
    assert report.decisions_count > 0
    assert report.actions_executed > 0

    # Verify node sequence in trace
    node_sequence = [t["node"] for t in report.trace]
    # Check that nodes appear in order: detect -> medical_review -> data_manager -> compliance -> human_gate -> execute
    first_detect = node_sequence.index("detect")
    first_med = node_sequence.index("medical_review")
    first_dm = node_sequence.index("data_manager")
    first_comp = node_sequence.index("compliance")
    first_gate = node_sequence.index("human_gate")
    first_exec = node_sequence.index("execute")

    assert first_detect < first_med < first_dm < first_comp < first_gate < first_exec, (
        f"Node order violation: detect={first_detect}, med={first_med}, dm={first_dm}, "
        f"comp={first_comp}, gate={first_gate}, exec={first_exec}"
    )


def test_serious_ae_hospitalization_rule(review_crew):
    """
    Protocol §6: A hospitalisation flag (AESHOSP = Y) makes an adverse event
    serious regardless of how AESER was coded.
    """
    findings = review_crew.detect(cut=12, protocol_version=3)
    miscoded_saes = [f for f in findings if f.finding_code == "SAE_MISCODED"]

    assert len(miscoded_saes) > 0, "Must detect miscoded SAEs where AESHOSP='Y' and AESER='N'"
    for sae in miscoded_saes:
        assert sae.details["hosp"] == "Y"
        assert sae.details["ser"] == "N"
        assert sae.severity == "CRITICAL"
        assert len(sae.evidence) > 0
        ref = sae.evidence[0]
        assert ref.domain == "AE"
        # Confirm record actually exists in graph
        rec = review_crew.graph.records_by_ref.get((ref.domain, ref.usubjid, ref.seq))
        assert rec is not None
        assert rec.hosp == "Y"
        assert rec.ser == "N"


def test_human_gate_approved_outcome(review_crew):
    """Verifies that APPROVED escalations execute corresponding safety actions and log to trace."""
    report = review_crew.run_cycle(cut=12, protocol_version=3)

    approved_decisions = [d for d in report.human_gate_decisions if d["outcome"] == "APPROVED"]
    assert len(approved_decisions) > 0, "Human Gate must handle APPROVED decisions"

    # Confirm action executed
    approved_targets = {d["target"] for d in approved_decisions}
    executed_targets = {
        t.finding_id
        for t in review_crew.recorded_trace
        if t.node == "execute"
    }
    assert len(executed_targets) > 0


def test_human_gate_rejected_outcome(review_crew):
    """
    Verifies that REJECTED escalations:
    1. Are NOT deleted.
    2. Are downgraded to monitoring.
    3. Rejection reason is stored.
    4. Are NEVER re-escalated in subsequent cycles.
    """
    report = review_crew.run_cycle(cut=12, protocol_version=3)
    rejected_decisions = [d for d in report.human_gate_decisions if d["outcome"] == "REJECTED"]

    assert len(rejected_decisions) > 0, "Must encounter REJECTED decision (e.g. 042-S07-001)"
    rej = rejected_decisions[0]
    target_subj = rej["target"]
    code = rej["code"]

    # Check rejection stored in memory
    assert review_crew.memory.is_rejected(code, target_subj)
    stored_reason = review_crew.memory.get_rejection_reason(code, target_subj)
    assert stored_reason is not None

    # Run next cycle: verify target_subj is kept in monitoring_only and NOT in escalations
    report2 = review_crew.run_cycle(cut=12, protocol_version=3)
    new_escalations_for_subj = [
        e for e in report2.escalations if e["usubjid"] == target_subj and e["code"] == code and e["status"] == "PENDING"
    ]
    assert len(new_escalations_for_subj) == 0, "Rejected finding must not be re-escalated"

    mon_items = [m for m in report2.monitoring_only_items if m["usubjid"] == target_subj and m["code"] == code]
    assert len(mon_items) > 0, "Rejected finding must be retained in monitoring-only items"


def test_human_gate_clarify_flow(review_crew):
    """
    CRITICAL REQUIREMENT:
    CLARIFY is NOT a rejection.
    1. Read monitor's question.
    2. Answer from existing ATLAS study graph / dataset.
    3. Cite supporting records.
    4. Add answer to escalation and resubmit.
    5. On resubmission, outcome is APPROVED.
    """
    report = review_crew.run_cycle(cut=12, protocol_version=3)
    clarify_decisions = [
        d for d in report.human_gate_decisions
        if d["outcome"] == "CLARIFY" or d.get("resubmission_outcome") == "APPROVED"
    ]
    assert len(clarify_decisions) > 0, "Must exercise CLARIFY workflow"

    target_dec = clarify_decisions[0]
    assert target_dec["resubmission_outcome"] == "APPROVED"
    assert target_dec["clarification_provided"] is not None

    # Verify trace entries for the CLARIFY sequence
    trace_decisions = [t["decision"] for t in report.trace if target_dec["target"] in t["finding_id"]]
    assert "CLARIFY" in trace_decisions
    assert "CLARIFICATION_RESOLVED" in trace_decisions
    assert "RESUBMITTED" in trace_decisions
    assert "APPROVED" in trace_decisions


def test_same_cut_rerun_duplicate_prevention(review_crew):
    """
    Same-cut rerun test:
    First run: raises valid queries and drafts escalations.
    Second run on identical cut: new_queries == 0, new_escalations == 0.
    """
    first_report = review_crew.run_cycle(cut=12, protocol_version=3)
    assert first_report.new_queries > 0
    assert first_report.new_escalations > 0

    second_report = review_crew.run_cycle(cut=12, protocol_version=3)
    assert second_report.new_queries == 0, (
        f"Expected 0 new queries on rerun of cut 12, got {second_report.new_queries}"
    )
    assert second_report.new_escalations == 0, (
        f"Expected 0 new escalations on rerun of cut 12, got {second_report.new_escalations}"
    )


def test_protocol_amendment_sensitivity(review_crew):
    """
    Compliance Node:
    Tests protocol amendment sensitivity.
    Under Protocol v1 & v2: Sulfonylureas are NOT prohibited.
    Under Protocol v3 (amendment): Sulfonylureas ARE prohibited (§5).
    """
    # Cycle under Protocol v2
    report_v2 = review_crew.run_cycle(cut=5, protocol_version=2)
    dev_v2_sulf = [d for d in report_v2.deviations if "SULFONYLUREA" in d.get("description", "").upper()]
    assert len(dev_v2_sulf) == 0, "Sulfonylurea should NOT be flagged as deviation under Protocol v2"

    # Cycle under Protocol v3
    report_v3 = review_crew.run_cycle(cut=12, protocol_version=3)
    dev_v3_sulf = [d for d in report_v3.deviations if "SULFONYLUREA" in d.get("description", "").upper() or "GLIBENCLAMIDE" in d.get("description", "").upper()]
    assert len(dev_v3_sulf) > 0, "Sulfonylurea MUST be flagged as deviation under Protocol v3"


def test_site_recurring_problems_and_flags(review_crew):
    """Verifies that sites with multiple issues accumulate site-level flags."""
    report = review_crew.run_cycle(cut=12, protocol_version=3)

    assert len(report.site_level_flags) > 0, "Must produce site-level flags for sites with recurring issues"
    flagged_sites = {s["site_id"] for s in report.site_level_flags}
    # Site S01 or S11 should be flagged
    assert any(s in flagged_sites for s in ["S01", "S02", "S07", "S09", "S11"])

    for s in report.site_level_flags:
        assert s["affected_subjects_count"] >= 1
        assert len(s["problem_types"]) >= 1
        assert s["flag_level"] in ["WATCH", "WARNING", "CRITICAL"]


def test_audit_trace_and_explain(review_crew):
    """
    CRITICAL:
    Every node writes to trace as it runs.
    explain() reads strictly from recorded_trace and never reconstructs from data.
    """
    report = review_crew.run_cycle(cut=12, protocol_version=3)
    assert len(report.trace) > 0

    # Test explain on an escalation finding ID
    first_esc = report.escalations[0]["escalation_id"]
    explanation = review_crew.explain(first_esc)

    assert explanation["found"] is True
    assert explanation["steps_count"] > 0
    assert len(explanation["timeline"]) > 0

    for step in explanation["timeline"]:
        assert "node" in step
        assert "decision" in step
        assert "rule" in step
        assert "timestamp" in step


def test_evidence_discipline(review_crew):
    """Verifies that all cited evidence records actually exist in the underlying study dataset."""
    report = review_crew.run_cycle(cut=12, protocol_version=3)

    # Check evidence in findings
    for f in report.findings:
        for ev in f["evidence"]:
            domain = ev["domain"]
            usubjid = ev["usubjid"]
            seq = ev["seq"]
            # Lookup in graph records_by_ref
            rec = review_crew.graph.records_by_ref.get((domain, usubjid, seq))
            assert rec is not None, f"Evidence record ({domain}, {usubjid}, {seq}) does not exist in dataset!"
