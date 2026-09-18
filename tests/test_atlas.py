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


def test_liver_damage_natural_language_question():
    atlas = Atlas("hackathon-data")
    q = Question(
        question_id="TEST_LIVER",
        text="Which patients have liver damage?",
    )
    ans = atlas.answer(q)
    assert isinstance(ans.answer, list)
    assert "042-S05-003" in ans.answer
    assert "042-S07-001" in ans.answer
    assert "042-S08-014" in ans.answer
    assert len(ans.evidence) >= 6


def test_patient_specific_lookups():
    atlas = Atlas("hackathon-data")

    # Medicines
    q_meds = Question(question_id="T_MEDS", text="What medicines were given to 042-S05-003?")
    ans_meds = atlas.answer(q_meds)
    assert len(ans_meds.answer) >= 1
    assert len(ans_meds.evidence) >= 1
    assert ans_meds.evidence[0].domain == "CM"

    # Side effects
    q_aes = Question(question_id="T_AES", text="Did 042-S05-003 have any side effects?")
    ans_aes = atlas.answer(q_aes)
    assert len(ans_aes.answer) >= 1
    assert len(ans_aes.evidence) >= 1
    assert ans_aes.evidence[0].domain == "AE"

    # Doses
    q_dose = Question(question_id="T_DOSE", text="What was the dose for 042-S05-003?")
    ans_dose = atlas.answer(q_dose)
    assert len(ans_dose.answer) >= 1
    assert len(ans_dose.evidence) >= 1
    assert ans_dose.evidence[0].domain == "EX"

    # Visits
    q_visits = Question(question_id="T_VISITS", text="Which visits did 042-S05-003 attend?")
    ans_visits = atlas.answer(q_visits)
    assert "BASELINE" in ans_visits.answer
    assert "WEEK8" in ans_visits.answer
    assert len(ans_visits.evidence) >= 5


def test_tight_time_budget_execution():
    """Verify that answering queries executes well within the 120s budget (< 100ms per query)."""
    import time
    atlas = Atlas("hackathon-data")

    queries = [
        Question(question_id="TB_1", text="How many subjects are present in the study?"),
        Question(question_id="TB_2", text="What was the ALT value for 042-S07-001 on 2026-03-30?"),
        Question(question_id="TB_3", text="Which subjects show a potential liver-damage pattern?"),
        Question(question_id="TB_4", text="Which subjects at site S01 received a wrong dose?"),
    ]

    t0 = time.perf_counter()
    for q in queries:
        ans = atlas.answer(q)
        assert ans.answer is not None
    total_time = time.perf_counter() - t0

    # Total time for all 4 queries must be under 1.0 second (average < 250ms each)
    assert total_time < 1.0, f"Query answering exceeded tight time budget: {total_time:.4f}s"

