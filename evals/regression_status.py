from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


LATEST_REGRESSION_REPORT = Path("evals/reports/latest_regression_report.json")


def latest_regression_health(path: str | Path | None = None) -> dict[str, Any]:
    report_path = Path(path or os.getenv("MERCY_RAGAS_REGRESSION_REPORT") or LATEST_REGRESSION_REPORT)
    try:
        report = json.loads(report_path.read_text(encoding="utf-8"))
    except Exception:
        return {
            "available": False,
            "status": "not_run",
            "report_path": str(report_path),
            "message": "No advanced RAGAS regression report is available yet.",
        }
    aggregate = report.get("aggregate") if isinstance(report.get("aggregate"), dict) else {}
    thresholds = report.get("thresholds") if isinstance(report.get("thresholds"), dict) else {}
    return {
        "available": True,
        "status": "pass" if report.get("passed") else "fail",
        "report_path": str(report_path),
        "eval_version": report.get("eval_version"),
        "generated_at": report.get("generated_at"),
        "corpus": report.get("corpus"),
        "dataset_size": report.get("dataset_size"),
        "overall_score": aggregate.get("overall_score"),
        "pass_rate": aggregate.get("pass_rate"),
        "faithfulness": aggregate.get("faithfulness"),
        "context_precision": aggregate.get("context_precision"),
        "answer_relevancy": aggregate.get("answer_relevancy"),
        "citation_accuracy": aggregate.get("citation_accuracy"),
        "dc_grounding_score": aggregate.get("dc_grounding_score"),
        "thresholds": thresholds,
        "practice_area_breakdown": report.get("practice_area_breakdown", {}),
        "regression": report.get("regression", {}),
    }
