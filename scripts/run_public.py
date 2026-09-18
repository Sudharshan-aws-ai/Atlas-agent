"""
Runs Atlas against the 10 public questions and generates stage1_public.json.
"""

import argparse
import json
import os
import sys

# Ensure repository root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from stage1.atlas import Atlas
from starter.schemas import Question


def main():
    parser = argparse.ArgumentParser(description="Run Atlas on public questions")
    parser.add_argument("--data", default="hackathon-data", help="Path to hackathon-data")
    parser.add_argument("--questions", default="starter/questions.json", help="Path to public questions JSON")
    parser.add_argument("--output", default="stage1_public.json", help="Output JSON path")
    parser.add_argument("--cut", type=int, default=None, help="Data cut number")
    args = parser.parse_args()

    atlas = Atlas(args.data, cut=args.cut)

    with open(args.questions, "r", encoding="utf-8") as f:
        q_dicts = json.load(f)

    results = []
    print(f"Executing Atlas on {len(q_dicts)} public questions...")
    for q_data in q_dicts:
        q = Question(**q_data)
        ans = atlas.answer(q)
        results.append(ans.model_dump())
        print(f"[{q.question_id}] ({q.category.value if q.category else 'N/A'}) Answer: {ans.answer} (Evidence: {len(ans.evidence)} records)")

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    print(f"\nGenerated {args.output} successfully with {len(results)} answers.")


if __name__ == "__main__":
    main()
