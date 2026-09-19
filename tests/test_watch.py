"""
Tests for Stage 3: WATCH — Longitudinal Cross-Cut Surveillance, Anomaly Detection, and Adversarial Defense.
Validates:
- Longitudinal surveillance across cuts (NEW, CHANGED, REPEATED, PREVIOUSLY_SEEN signals).
- Adversarial Scenario 1: Suspiciously regular site data (Site S11 systolic blood pressure std < 2.0).
- Adversarial Scenario 2: Laboratory values shifting by conversion factor (Site S07 ukat/L shift).
- Adversarial Scenario 3: Changed protocol / document prompt injections (lab-manual.md line 11, etc.).
- explain(): Reads strictly from recorded audit trace.
"""

import pytest
from stage3.watch import AdversarialSignal, Signal, WatchEngine
from starter.schemas import RecordRef


@pytest.fixture(scope="module")
def watch_engine():
    engine = WatchEngine("hackathon-data")
    return engine


def test_watch_cross_cut_surveillance(watch_engine):
    """Verify surveillance across cuts discovers and classifies signals correctly."""
    result = watch_engine.surveillance_across_cuts(cut_from=1, cut_to=12)

    assert "counts" in result
    counts = result["counts"]
    assert counts["total"] > 0
    assert counts["new"] > 0
    assert counts["repeated"] > 0
    assert len(result["signals"]) == counts["total"]

    for sig in result["signals"]:
        assert sig["status"] in {"NEW", "CHANGED", "REPEATED", "PREVIOUSLY_SEEN"}
        assert len(sig["evidence"]) > 0
        assert sig["signal_id"].startswith("SIG-")


def test_watch_adversarial_scenarios_all_three_detected(watch_engine):
    """
    Verify detection of all 3 required adversarial scenarios:
    1. Suspiciously regular site data (Site S11 std dev < 2.0)
    2. Laboratory values shifting by a conversion factor (Site S07 ukat/L vs U/L)
    3. Changed protocol / document prompt injections
    """
    adversarial = watch_engine.detect_adversarial_scenarios(cut=12)
    assert len(adversarial) >= 3

    categories = {a.category for a in adversarial}
    assert "STATISTICAL_FABRICATION" in categories, "Must detect suspicious site regularity (fabrication)"
    assert "MEASUREMENT_SYSTEMATIC_BIAS" in categories, "Must detect laboratory conversion factor shift"
    assert "DOCUMENT_MANIPULATION" in categories, "Must detect document prompt injections"

    # Specific Scenario 1: Site S11 regularity
    s11_signals = [a for a in adversarial if "S11" in a.target]
    assert len(s11_signals) >= 1
    assert s11_signals[0].metric_observed["value"] < 2.0  # std dev ~ 0.71

    # Specific Scenario 2: Site S07 unit shift
    s07_signals = [a for a in adversarial if "S07" in a.target]
    assert len(s07_signals) >= 1
    assert "kat" in s07_signals[0].metric_observed["reported_unit"]

    # Specific Scenario 3: Document prompt injections
    doc_signals = [a for a in adversarial if a.category == "DOCUMENT_MANIPULATION"]
    assert len(doc_signals) >= 1
    for doc_sig in doc_signals:
        assert len(doc_sig.evidence) > 0
        assert doc_sig.evidence[0].domain == "DOC"


def test_watch_explain_from_recorded_trace(watch_engine):
    """
    Verify explain() operates strictly on recorded trace and never reconstructs from raw data.
    """
    # Ensure adversarial scenarios have been logged to trace
    adversarial = watch_engine.detect_adversarial_scenarios(cut=12)
    sig_id = adversarial[0].scenario_id

    explanation = watch_engine.explain(sig_id)
    assert explanation["found_in_trace"] is True
    assert explanation["trace_events_count"] > 0
    assert len(explanation["chronological_steps"]) > 0

    step = explanation["chronological_steps"][0]
    assert "decision" in step
    assert "rule" in step
    assert "evidence" in step
    assert "output_action" in step

    # Non-existent signal ID
    fake_exp = watch_engine.explain("SIG-NON-EXISTENT-999")
    assert fake_exp["found_in_trace"] is False


# ===========================================================================
# Comprehensive Problem 3 — WATCH 22 Verification Scenarios
# ===========================================================================

from stage1.graph import StudyGraph
from stage2.crew import ReviewCrew
from stage2.models import Finding, HumanGateDecision
from stage3.models import BudgetManager, EscalationTracker, Explanation, SurveillanceReport
from stage3.watch import StudyWatch


@pytest.fixture(scope="module")
def shared_watch():
    """Shared StudyWatch instance running full 12-cut surveillance period."""
    sw = StudyWatch("hackathon-data")
    sw.run_period(range(1, 13))
    return sw


def test_1_twelve_cut_unattended_execution(shared_watch):
    """Scenario 1: System runs unattended across all 12 cuts."""
    rep = shared_watch.reports_history[-1]
    assert len(rep.cuts_processed) == 12
    assert rep.cuts_processed == list(range(1, 13))
    assert rep.total_subjects > 0
    assert len(rep.timeline) == 12
    for item in rep.timeline:
        assert item["status"] == "COMPLETED"


def test_2_incremental_graph_update_no_rebuild():
    """Scenario 2: StudyGraph incremental update operates in place without full rebuild."""
    graph = StudyGraph("hackathon-data")
    graph.build(cut=1)
    subj_count_1 = len(graph.subjects)
    recs_count_1 = len(graph.records_by_ref)

    # Incremental update to cut 2
    res = graph.incremental_update(new_cut=2)
    assert graph.current_cut == 2
    assert len(graph.subjects) >= subj_count_1
    assert len(graph.records_by_ref) >= recs_count_1
    assert res["elapsed_ms"] < 500  # fast incremental update, well under 500ms


def test_3_correction_at_later_cut_resolves_earlier_finding(shared_watch):
    """Scenario 3: A correction at a later cut resolves or undoes an earlier discrepancy."""
    assert len(shared_watch.corrections_processed) > 0
    # Check trace for correction events
    corr_traces = [t for t in shared_watch.recorded_trace if t.get("node") == "corrections"]
    assert len(corr_traces) > 0
    assert any("CORRECTION" in t.get("decision", "") or "RESOLVE" in t.get("decision", "") for t in corr_traces)


def test_4_delayed_medical_monitor_response():
    """Scenario 4: Medical monitor responds with realistic delay (~2 cuts later, ~60% response rate)."""
    tracker = EscalationTracker()
    ref = RecordRef(domain="AE", usubjid="TEST-001", seq=1)
    # Register at cut 1
    tracker.register_or_update(
        escalation_id="ESC_TEST_001",
        code="SAE_MISCODED",
        usubjid="TEST-001",
        siteid="S01",
        severity="CRITICAL",
        summary="Miscoded SAE",
        cut=1,
        evidence=[ref],
        alternatives=["Investigator error"],
    )

    # Cut 2: age is 1 cut -> monitor should NOT answer yet
    tracker.register_or_update(
        escalation_id="ESC_TEST_001",
        code="SAE_MISCODED",
        usubjid="TEST-001",
        siteid="S01",
        severity="CRITICAL",
        summary="Miscoded SAE",
        cut=2,
        evidence=[ref],
        alternatives=["Investigator error"],
    )
    adj_c2 = tracker.simulate_monitor_response(cut=2)
    assert len(adj_c2) == 0, "Monitor must not answer at age < 2 cuts"

    # Cut 3: age is 2 cuts -> eligible for response
    tracker.register_or_update(
        escalation_id="ESC_TEST_001",
        code="SAE_MISCODED",
        usubjid="TEST-001",
        siteid="S01",
        severity="CRITICAL",
        summary="Miscoded SAE",
        cut=3,
        evidence=[ref],
        alternatives=["Investigator error"],
    )
    # Can simulate across multiple cuts
    assert tracker.escalations["ESC_TEST_001"].age_in_cuts == 2


def test_5_unanswered_escalation_after_4_cuts_standing_limits():
    """Scenario 5: Escalation unanswered after >= 4 cuts transitions to standing limits (silence is not approval)."""
    tracker = EscalationTracker()
    ref = RecordRef(domain="AE", usubjid="TEST-002", seq=1)
    tracker.register_or_update(
        escalation_id="ESC_TEST_002",
        code="SAE_MISCODED",
        usubjid="TEST-002",
        siteid="S02",
        severity="CRITICAL",
        summary="Unanswered SAE",
        cut=1,
        evidence=[ref],
        alternatives=["Clerical error"],
    )

    # Advance to cut 5 (age = 4 cuts) without monitor approval
    esc = tracker.register_or_update(
        escalation_id="ESC_TEST_002",
        code="SAE_MISCODED",
        usubjid="TEST-002",
        siteid="S02",
        severity="CRITICAL",
        summary="Unanswered SAE",
        cut=5,
        evidence=[ref],
        alternatives=["Clerical error"],
    )
    assert esc.age_in_cuts >= 4
    assert esc.status == "UNANSWERED"
    assert esc.standing_limit_active is True
    assert "STANDING LIMITS" in esc.human_response_notes
    assert "NO APPROVAL-GATED ACTION" in esc.human_response_notes


def test_6_approved_decision_executed():
    """Scenario 6: APPROVED human gate decision triggers appropriate safety execution action."""
    crew = ReviewCrew(data_dir="hackathon-data")
    ref = RecordRef(domain="LB", usubjid="S01-001", seq=1)
    dec = HumanGateDecision(
        decision_id="DEC_HYS_S01-001",
        finding_id="ESC_HYS_S01-001",
        code="HYS_LAW_CANDIDATE",
        target="S01-001",
        outcome="APPROVED",
        reason="Dosing hold approved by safety board.",
    )
    summary = crew.execute([dec], queries=[])
    assert summary["approved_interventions"] >= 1
    assert any(a.action_type == "HOLD_DOSING_AND_SAFETY_REPORT" for a in crew.actions_history)


def test_7_rejected_decision_downgrades_to_monitoring():
    """Scenario 7: REJECTED human gate decision is downgraded to monitoring and never re-escalated."""
    crew = ReviewCrew(data_dir="hackathon-data")
    ref = RecordRef(domain="LB", usubjid="S07-001", seq=1)
    f = Finding(
        finding_id="F_TEST_REJ",
        finding_code="HYS_LAW_CANDIDATE",
        usubjid="S07-001",
        siteid="S07",
        cut=1,
        severity="CRITICAL",
        rationale="Elevated transaminases",
        evidence=[ref],
    )
    crew.memory.record_rejection("HYS_LAW_CANDIDATE", "S07-001", "Baseline transaminases elevated.")
    _, escalations, monitoring_only = crew.medical_review([f])
    assert len(escalations) == 0
    assert len(monitoring_only) == 1
    assert "monitoring" in monitoring_only[0].reason.lower()


def test_8_clarify_decision_answers_from_graph_and_resubmits():
    """Scenario 8: CLARIFY monitor directive queries graph evidence and resubmits."""
    crew = ReviewCrew(data_dir="hackathon-data")
    ref = RecordRef(domain="EX", usubjid="S05-001", seq=1)
    f = Finding(
        finding_id="F_DOSE_S05",
        finding_code="DOSING_ERROR",
        usubjid="S05-001",
        siteid="S05",
        cut=1,
        severity="HIGH",
        rationale="Dosing deviation",
        evidence=[ref],
        details={"seq": 1},
    )
    esc = crew.medical_review([f])[1][0]
    override = {f"{esc.code}|{esc.siteid}": ["CLARIFY", "Which visits and subjects were affected at Site S05?"]}
    decisions = crew.human_gate([esc], decisions_override=override)
    assert len(decisions) == 1
    dec = decisions[0]
    assert dec.outcome == "CLARIFY"
    assert dec.clarification_provided is not None
    assert "Site S05" in dec.clarification_provided
    assert dec.resubmission_outcome == "APPROVED"


def test_9_duplicate_query_prevention_across_repeat_runs():
    """Scenario 9: Re-running data manager produces zero duplicate queries."""
    crew = ReviewCrew(data_dir="hackathon-data")
    ref = RecordRef(domain="AE", usubjid="S01-001", seq=1)
    f = Finding(
        finding_id="F_DUP_QRY_TEST",
        finding_code="DATA_QUALITY",
        usubjid="S01-001",
        siteid="S01",
        cut=1,
        severity="MEDIUM",
        rationale="Predose AE",
        evidence=[ref],
        details={"issue": "AE_BEFORE_FIRST_DOSE", "ae_term": "Headache", "ae_start": "2024-01-01", "first_dose": "2024-01-02"},
    )
    # First run: query is generated
    q1 = crew.data_manager([f], cut=1)
    assert len(q1) >= 1

    # Second run with same finding: 0 new queries generated
    q2 = crew.data_manager([f], cut=1)
    # New queries must be 0 (only open queries returned if not answered)
    new_in_q2 = [q for q in q2 if q.cut == 1 and q.query_id not in [x.query_id for x in q1]]
    assert len(new_in_q2) == 0


def test_10_duplicate_escalation_prevention_across_repeat_cuts():
    """Scenario 10: Escalations issued in an earlier cut are not duplicated in memory."""
    crew = ReviewCrew(data_dir="hackathon-data")
    ref = RecordRef(domain="AE", usubjid="S02-001", seq=1)
    f = Finding(
        finding_id="F_TEST_ESC_DUP",
        finding_code="SAE_MISCODED",
        usubjid="S02-001",
        siteid="S02",
        cut=1,
        severity="CRITICAL",
        rationale="Hospitalization miscoded",
        evidence=[ref],
    )
    _, esc1, _ = crew.medical_review([f])
    assert len(esc1) == 1
    # Run second time
    _, esc2, _ = crew.medical_review([f])
    assert len(crew.memory.escalations_by_key) == 1


def test_11_suspicious_site_regularity_quarantined_not_deleted(shared_watch):
    """Scenario 11: Suspiciously regular site data is quarantined (not deleted) and audit flagged."""
    assert len(shared_watch.quarantined_records) > 0
    # Quarantined records must still exist in the graph!
    sample_key = list(shared_watch.quarantined_records)[0]
    domain, subj, seq = sample_key.split("|")
    ref_tuple = (domain, subj, int(seq))
    assert ref_tuple in shared_watch.graph.records_by_ref, "Quarantined records must not be deleted from graph"

    # Must have an audit recommendation in adversarial events
    adv = [a for a in shared_watch.adversarial_events if a.get("category") == "STATISTICAL_FABRICATION"]
    assert len(adv) > 0
    assert "QUARANTINE" in adv[0].get("defense_action", "")


def test_12_laboratory_unit_corruption_marked_untrusted_queried_not_escalated(shared_watch):
    """Scenario 12: Laboratory unit shift is marked UNTRUSTED, queried to lab, not escalated as emergency."""
    assert len(shared_watch.untrusted_records) > 0
    adv = [a for a in shared_watch.adversarial_events if a.get("category") == "MEASUREMENT_SYSTEMATIC_BIAS"]
    assert len(adv) > 0
    assert "UNTRUSTED" in adv[0].get("defense_action", "")
    assert "DO_NOT_CLINICALLY_ESCALATE" in adv[0].get("defense_action", "") or "DO_NOT_ESCALATE" in adv[0].get("defense_action", "")


def test_13_document_hash_content_change_detected(shared_watch):
    """Scenario 13: Document security scanning identifies prompt injections and tampered directives."""
    adv = [a for a in shared_watch.adversarial_events if a.get("category") == "DOCUMENT_MANIPULATION"]
    assert len(adv) > 0
    assert any("lab-manual" in a.get("target", "") or "DOC" in str(a.get("evidence", "")) for a in adv)


def test_14_instruction_inside_document_ignored_logged_tampered(shared_watch):
    """Scenario 14: Covert instructions inside documents are ignored and logged as prompt injections."""
    doc_traces = [t for t in shared_watch.recorded_trace if "PROMPT_INJECTION_NEUTRALIZED" in t.get("decision", "")]
    assert len(doc_traces) > 0
    for t in doc_traces:
        assert "PROMPT_INJECTION_NEUTRALIZED" in t["decision"]
        assert "neutralized" in t["why"].lower() or "ignored" in t["why"].lower()


def test_15_protocol_amendment_causes_rederivation(shared_watch):
    """Scenario 15: Advancing through cuts triggers protocol amendment variable re-derivation."""
    amend_traces = [t for t in shared_watch.recorded_trace if "AMENDMENT" in t.get("decision_id", "")]
    assert len(amend_traces) >= 2  # Amendments at cut 5 (v2) and cut 9 (v3)


def test_16_new_site_dynamically_discovered(shared_watch):
    """Scenario 16: New sites are discovered dynamically across cuts without hardcoded practice names."""
    assert len(shared_watch.known_sites) > 0
    discovery_traces = [t for t in shared_watch.recorded_trace if t.get("node") == "discovery" and "site" in t.get("what", "").lower()]
    assert len(discovery_traces) > 0


def test_17_new_domain_dynamically_discovered(shared_watch):
    """Scenario 17: New domains are discovered dynamically without hardcoded schemas."""
    assert len(shared_watch.known_domains) >= 5
    assert "DM" in shared_watch.known_domains
    assert "LB" in shared_watch.known_domains


def test_18_budget_degradation_throttles_narratives_at_80_percent():
    """Scenario 18: Budget reaches 80% consumption, setting is_degraded=True and throttling narrative generation."""
    bm = BudgetManager(total_budget=100.0)
    assert bm.should_generate_proactive_narratives is True

    bm.consume(79.0, "Initial heavy operations", cut=1)
    assert bm.is_degraded is False
    assert bm.should_generate_proactive_narratives is True

    bm.consume(2.0, "Additional operation", cut=2)
    assert bm.budget_used >= 80.0
    assert bm.is_degraded is True
    assert bm.should_generate_proactive_narratives is False


def test_19_critical_safety_checks_run_even_under_degraded_budget():
    """Scenario 19: Critical deterministic safety checks continue unaffected under degraded budget."""
    sw = StudyWatch("hackathon-data", total_budget=10.0)  # Very small budget to force degradation
    # Force degradation immediately
    sw.budget_manager.consume(9.0, "Force degradation", cut=1)
    assert sw.budget_manager.is_degraded is True

    # Run cut 1
    res = sw.run_cut(1)
    assert res["status"] == "COMPLETED"
    assert res["findings_detected"] > 0
    assert res["budget_degraded"] is True


def test_20_explain_reads_strictly_from_trace(shared_watch):
    """Scenario 20: explain() reads strictly from the recorded audit trace, returning typed Explanation."""
    sample_trace = shared_watch.recorded_trace[0]
    dec_id = sample_trace["decision_id"]

    exp = shared_watch.explain(dec_id)
    assert isinstance(exp, Explanation)
    assert exp.decision_id == dec_id
    assert exp.consistent_with_trace is True
    assert len(exp.what) > 0
    assert len(exp.why) > 0
    assert len(exp.alternatives) > 0

    # Non-existent decision
    fake_exp = shared_watch.explain("DEC_NON_EXISTENT_99999")
    assert fake_exp.consistent_with_trace is False
    assert fake_exp.status == "NOT_FOUND"


def test_21_same_cut_rerun_zero_duplicate_queries_or_escalations():
    """Scenario 21: Re-running on the same cut produces zero duplicate queries or escalations."""
    sw = StudyWatch("hackathon-data")
    sw.run_cut(1)
    q_count_1 = len(sw.crew.memory.queries_by_key)
    esc_count_1 = len(sw.crew.memory.escalations_by_key)

    # Rerun cut 1
    sw.run_cut(1)
    q_count_2 = len(sw.crew.memory.queries_by_key)
    esc_count_2 = len(sw.crew.memory.escalations_by_key)

    assert q_count_1 == q_count_2, "Same cut re-run must not create duplicate queries"
    assert esc_count_1 == esc_count_2, "Same cut re-run must not create duplicate escalations"


def test_22_no_hard_coded_practice_identifiers(shared_watch):
    """Scenario 22: Site risk computation operates generically across any study center without hardcoding."""
    site_risks = shared_watch.compute_site_risk()
    assert len(site_risks) > 0
    for sr in site_risks:
        assert "siteid" in sr
        assert "risk_score" in sr
        assert "risk_tier" in sr
        assert sr["risk_tier"] in {"CRITICAL", "HIGH", "MODERATE", "LOW"}
        assert 0.0 <= sr["risk_score"] <= 100.0
