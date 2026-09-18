"""
Unit tests for evidence validation and zero-hallucination guarantees.
"""

from stage1.evidence import EvidenceCollection, EvidenceValidator
from stage1.graph import StudyGraph
from starter.schemas import RecordRef


def test_evidence_validator_finds_existing_record():
    graph = StudyGraph("hackathon-data")
    graph.build(cut=12)

    ref = RecordRef(domain="LB", usubjid="042-S07-001", seq=25)
    assert EvidenceValidator.verify_record_exists(graph, ref) is True


def test_evidence_validator_rejects_non_existent_record():
    graph = StudyGraph("hackathon-data")
    graph.build(cut=12)

    # Sequence 99999 does not exist
    false_ref = RecordRef(domain="LB", usubjid="042-S07-001", seq=99999)
    assert EvidenceValidator.verify_record_exists(graph, false_ref) is False


def test_evidence_collection_deduplication():
    graph = StudyGraph("hackathon-data")
    graph.build(cut=12)

    coll = EvidenceCollection(graph)
    ref = RecordRef(domain="LB", usubjid="042-S07-001", seq=25)

    added1 = coll.add("Test Claim", ref, "Valid record")
    assert added1 is True
    assert len(coll) == 1

    # Adding same reference again should deduplicate
    added2 = coll.add("Another Claim", ref, "Same record")
    assert added2 is True
    assert len(coll) == 1


def test_evidence_collection_rejects_hallucinated_record():
    graph = StudyGraph("hackathon-data")
    graph.build(cut=12)

    coll = EvidenceCollection(graph)
    hallucinated = RecordRef(domain="AE", usubjid="042-S99-999", seq=1)
    added = coll.add("Fake claim", hallucinated, "Does not exist")
    assert added is False
    assert len(coll) == 0
