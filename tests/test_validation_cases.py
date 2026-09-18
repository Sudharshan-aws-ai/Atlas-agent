"""
Tests for the five core validation questions against the study dataset.
Verifies dynamic graph calculation, unit conversion, Hy's law evidence citations, and trap handling.
"""

from stage1.atlas import Atlas
from starter.schemas import Question, QuestionCategory


def test_val_q1_subject_count():
    atlas = Atlas("hackathon-data")
    q = Question(question_id="VAL_Q1", text="How many subjects are present in the study?")
    ans = atlas.answer(q)
    
    # Must be integer calculated from dataset
    assert isinstance(ans.answer, int)
    assert ans.answer == 240
    assert len(ans.evidence) > 0
    assert ans.evidence[0].domain == "DM"
    assert "240 unique enrolled subjects" in ans.text


def test_val_q2_alt_lookup_and_conversion():
    atlas = Atlas("hackathon-data")
    q = Question(question_id="VAL_Q2", text="What was the ALT value for 042-S07-001 on 2026-03-30?")
    ans = atlas.answer(q)
    
    assert ans.answer == "3.995 ukat/L"
    assert "3.995 ukat/L" in ans.text
    assert "239.7 U/L" in ans.text
    assert "1 ukat/L = 60 U/L" in ans.text
    assert len(ans.evidence) == 1
    assert ans.evidence[0].domain == "LB"
    assert ans.evidence[0].usubjid == "042-S07-001"
    assert ans.evidence[0].seq == 25


def test_val_q3_liver_damage_finding():
    atlas = Atlas("hackathon-data")
    q = Question(question_id="VAL_Q3", text="Which subjects show a potential liver-damage pattern?")
    ans = atlas.answer(q)
    
    assert isinstance(ans.answer, list)
    assert sorted(ans.answer) == ["042-S05-003", "042-S07-001", "042-S08-014"]
    assert len(ans.evidence) == 6
    assert all(e.domain == "LB" for e in ans.evidence)


def test_val_q4_liver_damage_evidence():
    atlas = Atlas("hackathon-data")
    q = Question(question_id="VAL_Q4", text="Show evidence supporting the liver-damage finding.")
    ans = atlas.answer(q)
    
    assert len(ans.evidence) == 6
    evidence_tuples = [(e.domain, e.usubjid, e.seq) for e in ans.evidence]
    
    # LB seq 25 (ALT) + LB seq 27 (BILI) for 042-S07-001
    assert ("LB", "042-S07-001", 25) in evidence_tuples
    assert ("LB", "042-S07-001", 27) in evidence_tuples
    
    # LB seq 31 (ALT) + LB seq 33 (BILI) for 042-S05-003
    assert ("LB", "042-S05-003", 31) in evidence_tuples
    assert ("LB", "042-S05-003", 33) in evidence_tuples
    
    # LB seq 31 (ALT) + LB seq 33 (BILI) for 042-S08-014
    assert ("LB", "042-S08-014", 31) in evidence_tuples
    assert ("LB", "042-S08-014", 33) in evidence_tuples


def test_val_q5_site_s01_dosing_trap():
    atlas = Atlas("hackathon-data")
    q = Question(question_id="VAL_Q5", text="Which subjects at site S01 received a wrong dose?")
    ans = atlas.answer(q)
    
    # Strict anti-hallucination / zero guess
    assert ans.answer == []
    assert len(ans.evidence) == 0
    assert "no dosing errors were found" in ans.text.lower()
    assert ans.confidence == 1.0
