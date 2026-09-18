"""
Unit tests for Atlas Question-Answering Agent across Question Categories.
"""

from stage1.atlas import Atlas
from starter.schemas import Question, QuestionCategory


def test_count_question():
    atlas = Atlas("hackathon-data")
    q = Question(
        question_id="TEST_Q01",
        text="How many subjects at site S07 discontinued due to an adverse event?",
        category=QuestionCategory.COUNT,
    )
    ans = atlas.answer(q)
    assert ans.answer == 0
    assert ans.confidence == 1.0


def test_lookup_question():
    atlas = Atlas("hackathon-data")
    q = Question(
        question_id="TEST_Q02",
        text="List the laboratory and adverse-event records for 042-S05-003 within 7 days of the WEEK8 visit.",
        category=QuestionCategory.LOOKUP,
    )
    ans = atlas.answer(q)
    assert isinstance(ans.answer, list)
    assert len(ans.answer) == 6
    assert len(ans.evidence) == 6


def test_finding_question():
    atlas = Atlas("hackathon-data")
    q = Question(
        question_id="TEST_Q03",
        text="Which subjects meet the Hy's law criteria?",
        category=QuestionCategory.FINDING,
    )
    ans = atlas.answer(q)
    assert isinstance(ans.answer, list)
    assert "042-S07-001" in ans.answer
    assert "042-S05-003" in ans.answer
    assert len(ans.evidence) >= 4


def test_trap_question():
    atlas = Atlas("hackathon-data")
    q = Question(
        question_id="TEST_Q04",
        text="Which subjects at site S01 received a wrong dose?",
        category=QuestionCategory.TRAP,
    )
    ans = atlas.answer(q)
    # Honest empty return, no hallucination
    assert ans.answer == []
    assert ans.confidence == 1.0
    assert len(ans.evidence) == 0
    assert "no dosing errors were found" in ans.text.lower()
