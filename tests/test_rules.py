"""
Unit tests for deterministic clinical rule engine (Hy's law, dosing errors, miscoded SAEs).
"""

from stage1.graph import StudyGraph
from stage1.rules import RuleEngine


def test_hys_law_candidate_detection():
    graph = StudyGraph("hackathon-data")
    graph.build(cut=12)

    # 042-S07-001 has ALT 3.995 ukat/L (>3x ULN) and BILI 5.38 mg/dL (>2x ULN) on same date at Week 8
    res = RuleEngine.evaluate_hys_law_for_subject("042-S07-001", graph)
    assert res.is_candidate is True
    assert res.transaminase_multiple > 3.0
    assert res.bilirubin_multiple > 2.0
    assert res.day_difference <= 14
    assert len(res.evidence) == 2


def test_dosing_error_detection():
    graph = StudyGraph("hackathon-data")
    graph.build(cut=12)

    errors = RuleEngine.find_dosing_errors(graph)
    assert len(errors) == 18
    # All dosing errors occur at site S09
    for ex, ref, reason in errors:
        assert graph.get_subject_site(ex.usubjid) == "S09"

    # Site S01 has 0 dosing errors
    s01_errors = RuleEngine.find_dosing_errors(graph, site_filter="S01")
    assert len(s01_errors) == 0


def test_miscoded_sae_detection():
    graph = StudyGraph("hackathon-data")
    graph.build(cut=12)

    miscoded = RuleEngine.find_miscoded_saes(graph)
    assert len(miscoded) == 1
    ae, ref, reason = miscoded[0]
    assert ae.usubjid == "042-S02-004"
    assert ae.hosp == "Y"
    assert ae.ser == "N"


def test_prohibited_medication_rules_by_version():
    graph = StudyGraph("hackathon-data")
    graph.build(cut=12)

    # Version 1 prohibited: Glucocorticoids only
    meds_v1 = RuleEngine.find_prohibited_medications(graph, protocol_version=1)
    subjects_v1 = set(cm.usubjid for cm, ref, reason in meds_v1)
    assert len(subjects_v1) == 8

    # Version 3 prohibited: Glucocorticoids + Sulfonylureas
    meds_v3 = RuleEngine.find_prohibited_medications(graph, protocol_version=3)
    subjects_v3 = set(cm.usubjid for cm, ref, reason in meds_v3)
    assert len(subjects_v3) == 14
    assert subjects_v1.issubset(subjects_v3)
