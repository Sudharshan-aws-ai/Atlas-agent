"""
Unit tests for StudyGraph indexing, topology, and Patient 360 dossiers.
"""

from stage1.graph import StudyGraph


def test_graph_build_and_stats():
    graph = StudyGraph("hackathon-data")
    stats = graph.build(cut=12)

    assert stats["nodes"] > 25000
    assert stats["edges"] > 25000
    assert stats["subjects_covered"] == 241
    assert stats["unique_individuals"] == 240
    assert stats["duplicate_enrollments_detected"] == 1
    assert stats["build_time_seconds"] < 5.0  # Fast build target


def test_patient360_completeness():
    graph = StudyGraph("hackathon-data")
    graph.build(cut=12)

    p360 = graph.patient360("042-S07-001")
    assert p360["usubjid"] == "042-S07-001"
    assert p360["siteid"] == "S07"
    assert len(p360["laboratory"]) > 0
    assert len(p360["adverse_events"]) > 0
    assert len(p360["exposure"]) > 0
    assert len(p360["concomitant_medications"]) > 0
    assert len(p360["vital_signs"]) > 0
    assert len(p360["ecg"]) > 0
    assert len(p360["medical_history"]) > 0
    assert len(p360["disposition"]) > 0


def test_patient360_missing_subject_remains_missing():
    graph = StudyGraph("hackathon-data")
    graph.build(cut=12)

    p360 = graph.patient360("NON_EXISTENT_ID")
    assert "error" in p360


def test_patient360_duplicate_enrollment_flag():
    graph = StudyGraph("hackathon-data")
    graph.build(cut=12)

    p360 = graph.patient360("042-S05-021")
    assert p360["is_duplicate_enrollment"] is True
    assert p360["duplicate_of"] == "042-S02-013"
    # Faithfully missing disposition
    assert len(p360["disposition"]) == 0
