from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ragas_eval import run_ragas_evaluation


def main() -> int:
    report = run_ragas_evaluation(limit=8, top_k=5, pass_threshold=0.72)
    aggregate = report["aggregate"]
    print(
        "Quick RAGAS passed="
        f"{report['passed']} overall={aggregate['overall']} pass_rate={aggregate['pass_rate']} "
        f"dataset_size={report['dataset_size']}"
    )
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
