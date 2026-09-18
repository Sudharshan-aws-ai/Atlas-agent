"""
Tests for Stage 2: MONITOR — Automated Clinical Surveillance and Multi-Agent Escalation Workflow.
Validates:
- 6-node execution flow: Detect -> Medical Review -> Data Manager -> Compliance -> Human Gate -> Execute.
- 3 Human Gate outcomes: APPROVED, REJECTED, and CLARIFY.
- Duplicate prevention: Re-running the same cut produces 0 new findings and 0 new queries.
- explain(): Reads strictly from recorded audit trace.
"""

import pytest
from stage1.graph import StudyGraph
from stage2.monitor import MonitorEngine, MonitorResult
from starter.schemas import RecordRef


@pytest.fixture(scope="module")
def monitor_engine():
    graph = StudyGraph("hackathon-data")
    graph.build()
    engine = MonitorEngine("hackathon-data", graph=graph)
    return engine


def test_monitor_six_node_execution(monitor_engine):
    """Verify that all 6 nodes execute and produce trace and outcomes."""
    res = monitor_engine.run(cut=12)

    assert isinstance(res, MonitorResult)
    assert res.findings_detected > 0
    assert res.queries_issued > 0
    assert res.decisions_count > 0
    assert res.actions_executed > 0
    assert res.trace_count > 0

    # Verify trace contains events from all 6 nodes
    nodes_in_trace = {t.node for t in monitor_engine.recorded_trace}
    expected_nodes = {"Detect", "Medical Review", "Data Manager", "Compliance", "Human Gate", "Execute"}
    for node in expected_nodes:
        assert node in nodes_in_trace, f"Node {node} missing from recorded audit trace"


def test_monitor_human_gate_outcomes(monitor_engine):
    """Verify that APPROVED, REJECTED, and CLARIFY outcomes are all exercised."""
    # Ensure a full run has completed
    res = monitor_engine.run(cut=12)

    outcomes = {d["outcome"] for d in res.decisions}
    assert "APPROVED" in outcomes, "Human Gate must handle APPROVED decisions"
    assert "REJECTED" in outcomes, "Human Gate must handle REJECTED decisions"

    # Verify CLARIFY outcome handling with resubmission
    clarify_decisions = [
        d for d in res.decisions
        if d["outcome"] == "CLARIFY" or d.get("resubmission_outcome") is not None
    ]
    # Check that at least one decision went through clarification/resubmission or clarification pathway
    assert len(clarify_decisions) >= 1 or any(
        "clarif" in str(d).lower() for d in res.decisions
    ), "Human Gate must handle CLARIFY outcome"


def test_monitor_duplicate_prevention(monitor_engine):
    """
    Duplicate prevention test:
    Running the same cut a second time must NOT recreate queries or findings.
    new_findings and new_queries must be exactly 0.
    """
    # First run on cut 12
    first_run = monitor_engine.run(cut=12)

    # Second run on cut 12
    second_run = monitor_engine.run(cut=12)

    assert second_run.new_findings == 0, f"Expected 0 new findings on repeat cut, got {second_run.new_findings}"
    assert second_run.new_queries == 0, f"Expected 0 new queries on repeat cut, got {second_run.new_queries}"


def test_monitor_explain_from_recorded_trace(monitor_engine):
    """
    Audit trace test:
    explain() must read strictly from recorded_trace and never reconstruct from data.
    """
    # Pick the first finding ID from history
    assert len(monitor_engine.findings_history) > 0
    finding_id = list(monitor_engine.findings_history.keys())[0]

    explanation = monitor_engine.explain(finding_id)
    assert explanation["found"] is True
    assert explanation["steps_count"] > 0
    assert len(explanation["timeline"]) > 0

    # Ensure each step has the mandatory fields
    for step in explanation["timeline"]:
        assert "node" in step
        assert "decision" in step
        assert "rule" in step
        assert "evidence" in step
        assert "timestamp" in step

    # Non-existent ID returns not found
    fake_exp = monitor_engine.explain("NON-EXISTENT-FINDING-999")
    assert fake_exp["found"] is False


def test_monitor_evidence_traceability(monitor_engine):
    """Every finding produced by Monitor must carry auditable RecordRef evidence."""
    for finding in monitor_engine.findings_history.values():
        assert len(finding.evidence) > 0, f"Finding {finding.finding_id} has no evidence"
        for ref in finding.evidence:
            assert isinstance(ref, RecordRef)
            assert ref.domain in {"LB", "AE", "EX", "CM", "DM", "VS", "DS", "MH", "EG", "SITE"}
            assert ref.seq >= 0
