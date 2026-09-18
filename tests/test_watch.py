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
