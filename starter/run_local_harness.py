"""
Local evaluation harness for Study Sentinel Hackathon — Problem 1 (ATLAS).

Usage:
    python starter/run_local_harness.py --module stage1.atlas --data hackathon-data
"""

import argparse
import importlib
import json
import os
import sys
from time import perf_counter

# Ensure project root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from starter.schemas import Answer, Question, QuestionCategory, RecordRef


def run_harness(module_name: str, data_dir: str, questions_path: str):
    print("=" * 60)
    print("STUDY SENTINEL LOCAL EVALUATION HARNESS — PROBLEM 1 (ATLAS)")
    print("=" * 60)
    print(f"Target Module:   {module_name}")
    print(f"Data Directory:  {data_dir}")
    print(f"Questions File:  {questions_path}\n")

    # 1. Dynamic Import
    t_start = perf_counter()
    try:
        mod = importlib.import_module(module_name)
        atlas_cls = getattr(mod, "Atlas")
    except Exception as e:
        print(f"[FAIL] Error importing Atlas from {module_name}: {e}")
        sys.exit(1)

    print("[PASS] Module import succeeded.")

    # 2. Build Agent & Graph
    t_build_start = perf_counter()
    atlas = atlas_cls(data_dir=data_dir)
    t_build_end = perf_counter()
    build_time = round(t_build_end - t_build_start, 3)
    print(f"[PASS] Atlas agent and StudyGraph built in {build_time}s.")
    stats = atlas.graph.stats
    print(f"       Nodes: {stats.get('nodes')}, Edges: {stats.get('edges')}, Subjects: {stats.get('subjects_covered')}\n")

    # 3. Load Questions
    with open(questions_path, "r", encoding="utf-8") as f:
        q_data = json.load(f)
    print(f"Loaded {len(q_data)} benchmark questions.\n")

    passed_count = 0
    total_count = len(q_data)

    print("-" * 60)
    print(f"{'ID':<6} {'CATEGORY':<10} {'TIME(s)':<8} {'EVIDENCE':<10} {'STATUS':<8}")
    print("-" * 60)

    for item in q_data:
        q = Question(**item)
        t0 = perf_counter()
        ans = atlas.answer(q)
        t_elapsed = round(perf_counter() - t0, 4)

        # Validation Checks
        is_valid = True
        failure_reasons = []

        # Check Schema
        if not isinstance(ans, Answer):
            is_valid = False
            failure_reasons.append("Return value is not an Answer instance")

        # Check Timing Limit (≤ 120s)
        if t_elapsed > 120.0:
            is_valid = False
            failure_reasons.append(f"Exceeded 120s limit ({t_elapsed}s)")

        # Validate Evidence
        for ref in ans.evidence:
            if not isinstance(ref, RecordRef):
                is_valid = False
                failure_reasons.append(f"Invalid evidence ref type: {type(ref)}")
            triple = ref.to_triple()
            if triple not in atlas.graph.records_by_ref:
                is_valid = False
                failure_reasons.append(f"Cited record {triple} does not exist in StudyGraph")

        # Trap verification
        if q.category == QuestionCategory.TRAP:
            if ans.answer != [] and ans.answer != 0:
                is_valid = False
                failure_reasons.append(f"Trap question returned non-empty answer: {ans.answer}")

        status = "PASS" if is_valid else "FAIL"
        if is_valid:
            passed_count += 1

        cat_str = q.category.value if q.category else "N/A"
        print(f"{q.question_id:<6} {cat_str:<10} {t_elapsed:<8.4f} {len(ans.evidence):<10} {status:<8}")
        if failure_reasons:
            for r in failure_reasons:
                print(f"       -> [REASON] {r}")

    print("-" * 60)
    print(f"\nPublic Questions Summary: {passed_count}/{total_count} Passed.")

    # 4. Mid-Stage Resilience Test (Rebuild with cut=4)
    print("\nTesting mid-stage rebuild with cut=4 (prior to Week 8 Hy's law in cut 5)...")
    atlas.rebuild(cut=4)
    q_hys = Question(question_id="Q_CUT_TEST", text="Which subjects meet the Hy's law criteria?", category=QuestionCategory.FINDING)
    ans_cut4 = atlas.answer(q_hys)
    print(f"Hy's law candidates at Cut 4: {ans_cut4.answer} (Expected: [], as S07 event occurs at Cut 5)")
    rebuild_pass = (ans_cut4.answer == [])

    # Restore to final cut
    atlas.rebuild(cut=12)
    ans_cut12 = atlas.answer(q_hys)
    print(f"Hy's law candidates at Cut 12: {ans_cut12.answer}")
    restore_pass = ("042-S07-001" in ans_cut12.answer and "042-S05-003" in ans_cut12.answer)

    if rebuild_pass and restore_pass:
        print("[PASS] Mid-stage cut rebuild test passed successfully.")
    else:
        print("[FAIL] Mid-stage cut rebuild test failed.")

    print("\n" + "=" * 60)
    if passed_count == total_count and rebuild_pass and restore_pass:
        print("ALL HARNESS TESTS PASSED CLEANLY.")
        print("=" * 60)
        return 0
    else:
        print("SOME TESTS FAILED.")
        print("=" * 60)
        return 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--module", default="stage1.atlas", help="Module to import Atlas from")
    parser.add_argument("--data", default="hackathon-data", help="Data directory")
    parser.add_argument("--questions", default="starter/questions.json", help="Questions JSON")
    args = parser.parse_args()

    sys.exit(run_harness(args.module, args.data, args.questions))
