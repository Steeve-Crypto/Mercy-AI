from __future__ import annotations

import argparse
import json

from evals.ragas_harness import run_advanced_regression


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Mercy advanced D.C. RAGAS regression suite.")
    parser.add_argument("--corpus", default="full", choices=["full"])
    parser.add_argument("--top-k", type=int, default=8)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    report = run_advanced_regression(corpus=args.corpus, top_k=args.top_k, limit=args.limit)
    summary = {
        "passed": report["passed"],
        "dataset_size": report["dataset_size"],
        "corpus": report["corpus"],
        "aggregate": report["aggregate"],
        "report_path": report["report_path"],
        "langsmith": report["langsmith"],
    }
    if args.json:
        print(json.dumps(summary, indent=2, sort_keys=True))
    else:
        print("Mercy advanced RAGAS regression")
        print(f"Corpus chunks: {summary['corpus']['chunk_count']}")
        print(f"Dataset size: {summary['dataset_size']}")
        print(f"Overall: {summary['aggregate']['overall_score']}")
        print(f"Pass rate: {summary['aggregate']['pass_rate']}")
        print(f"Report: {summary['report_path']}")
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
