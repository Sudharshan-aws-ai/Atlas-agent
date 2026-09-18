"""
Builds the Study Knowledge Graph and outputs graph_stats.json.
"""

import argparse
import json
import os
import sys

# Ensure repository root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from stage1.graph import StudyGraph


def main():
    parser = argparse.ArgumentParser(description="Build StudyGraph and export stats")
    parser.add_argument("--data", default="hackathon-data", help="Path to hackathon-data directory")
    parser.add_argument("--cut", type=int, default=None, help="Optional data cut number")
    parser.add_argument("--output", default="graph_stats.json", help="Output JSON path")
    args = parser.parse_args()

    graph = StudyGraph(args.data)
    stats = graph.build(cut=args.cut)

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(stats, f, indent=2)

    print(f"Graph stats written to {args.output}:")
    print(json.dumps(stats, indent=2))


if __name__ == "__main__":
    main()
