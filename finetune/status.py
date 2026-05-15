from __future__ import annotations

import json
import importlib.util
from pathlib import Path
from typing import Any

from evals.regression_status import latest_regression_health


DEFAULT_MANIFEST_PATH = Path("finetune/data/dataset_manifest.json")
DEFAULT_RUN_DIR = Path("finetune/runs")
REQUIRED_TRAINING_PACKAGES = ("torch", "transformers", "datasets", "peft", "bitsandbytes", "accelerate")
DEFAULT_QLORA_CONFIG = {
    "load_in_4bit": True,
    "bnb_4bit_quant_type": "nf4",
    "bnb_4bit_compute_dtype": "bfloat16",
    "bnb_4bit_use_double_quant": True,
    "lora_r": 16,
    "lora_alpha": 32,
    "lora_dropout": 0.05,
    "target_modules": ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
}


def fine_tuning_readiness_status() -> dict[str, Any]:
    manifest = _dataset_manifest(DEFAULT_MANIFEST_PATH)
    deps = _dependency_status()
    latest_plan = _latest_plan()
    regression = latest_regression_health()
    dataset_records = int(manifest.get("total_records") or 0)
    regression_ok = regression.get("available") and regression.get("status") == "pass" and int(regression.get("dataset_size") or 0) >= 200
    ready = dataset_records >= 200 and bool(regression_ok)
    return {
        "version": "dc-lora-readiness-1.0",
        "ready": ready,
        "status": "ready_for_sample_training" if ready else "dataset_or_regression_missing",
        "dataset": {
            "available": bool(manifest),
            "manifest_path": str(DEFAULT_MANIFEST_PATH),
            "total_records": dataset_records,
            "train_records": manifest.get("train_records"),
            "validation_records": manifest.get("validation_records"),
            "sha256": manifest.get("sha256"),
            "generated_at": manifest.get("generated_at"),
            "practice_area_counts": manifest.get("practice_area_counts", {}),
        },
        "training": {
            "default_mode": "qlora_4bit",
            "qlora_config": DEFAULT_QLORA_CONFIG,
            "dependencies": deps,
            "all_dependencies_installed": all(deps.values()),
            "latest_plan": latest_plan,
        },
        "validation": {
            "post_tune_regression_wired": True,
            "latest_regression": regression,
        },
        "data_controls": {
            "official_dc_grounding_required": True,
            "attorney_review_disclaimer_required": True,
            "no_raw_client_pii_expected": True,
            "source_ids_required": True,
        },
    }


def _latest_plan() -> dict[str, Any] | None:
    path = DEFAULT_RUN_DIR / "latest_lora_plan.json"
    try:
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
        return {
            "path": str(path),
            "mode": payload.get("mode"),
            "base_model": payload.get("base_model"),
            "epochs": payload.get("epochs"),
            "launched_at": payload.get("launched_at"),
            "validation": payload.get("validation"),
        }
    except Exception:
        return None


def _dataset_manifest(path: str | Path = DEFAULT_MANIFEST_PATH) -> dict[str, Any]:
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _dependency_status() -> dict[str, bool]:
    return {package: importlib.util.find_spec(package) is not None for package in REQUIRED_TRAINING_PACKAGES}


__all__ = ["fine_tuning_readiness_status"]
