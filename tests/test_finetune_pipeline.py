from __future__ import annotations

import json
from pathlib import Path

from finetune.dataset_builder import prepare_lora_dataset
from finetune.lora_setup import launch_lora_training
from finetune.status import fine_tuning_readiness_status


def test_prepare_lora_dataset_from_pd044_golden(tmp_path: Path) -> None:
    summary = prepare_lora_dataset(output=tmp_path)
    assert summary.total_records >= 200
    assert summary.train_records > summary.validation_records
    first = json.loads((tmp_path / "dc_lora_train.jsonl").read_text(encoding="utf-8").splitlines()[0])
    assert first["messages"][0]["role"] == "system"
    assert "attorney" in first["response"]["attorney_review_disclaimer"].lower()
    assert first["metadata"]["source_ids"]
    assert first["metadata"]["jurisdiction"] == "District of Columbia"


def test_lora_training_launch_plan_is_safe_without_optional_dependencies(tmp_path: Path) -> None:
    data_dir = tmp_path / "data"
    run_dir = tmp_path / "runs"
    prepare_lora_dataset(output=data_dir)
    launch = launch_lora_training(base_model="test/legal-model", epochs=1, dataset_dir=data_dir, output_dir=run_dir)
    assert launch.mode in {"plan_only", "hf_trainer_qlora"}
    assert launch.validation["wired"] is True
    assert (run_dir / "latest_lora_plan.json").exists()


def test_fine_tuning_readiness_status_shape() -> None:
    status = fine_tuning_readiness_status()
    assert status["version"] == "dc-lora-readiness-1.0"
    assert "dataset" in status
    assert "training" in status
    assert status["validation"]["post_tune_regression_wired"] is True
