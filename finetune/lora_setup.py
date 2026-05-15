from __future__ import annotations

import importlib.util
import json
import os
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from evals.regression_status import latest_regression_health
from observability import trace_event, trace_span
from finetune.dataset_builder import DEFAULT_OUTPUT_DIR, dataset_manifest, prepare_lora_dataset


DEFAULT_BASE_MODEL = "meta-llama/Meta-Llama-3.1-8B-Instruct"
DEFAULT_RUN_DIR = Path("finetune/runs")
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
REQUIRED_TRAINING_PACKAGES = ("torch", "transformers", "datasets", "peft", "bitsandbytes", "accelerate")


@dataclass(frozen=True)
class LoraTrainingLaunch:
    version: str
    mode: str
    base_model: str
    epochs: int
    dataset_manifest_path: str
    output_dir: str
    plan_path: str
    dependencies: dict[str, bool]
    qlora_config: dict[str, Any]
    validation: dict[str, Any]
    launched_at: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def dependency_status() -> dict[str, bool]:
    return {package: importlib.util.find_spec(package) is not None for package in REQUIRED_TRAINING_PACKAGES}


def launch_lora_training(
    *,
    base_model: str = DEFAULT_BASE_MODEL,
    epochs: int = 3,
    dataset_dir: str | Path = DEFAULT_OUTPUT_DIR,
    output_dir: str | Path = DEFAULT_RUN_DIR,
    run_validation: bool = False,
    real_training: bool | None = None,
) -> LoraTrainingLaunch:
    data_dir = Path(dataset_dir)
    manifest = dataset_manifest(data_dir / "dataset_manifest.json")
    if not manifest:
        prepare_lora_dataset(output=data_dir)
        manifest = dataset_manifest(data_dir / "dataset_manifest.json")
    run_dir = Path(output_dir)
    run_dir.mkdir(parents=True, exist_ok=True)
    deps = dependency_status()
    real_enabled = real_training if real_training is not None else os.getenv("MERCY_ENABLE_REAL_LORA_TRAINING", "").lower() in {"1", "true", "yes"}
    can_train = real_enabled and all(deps.values())
    mode = "hf_trainer_qlora" if can_train else "plan_only"
    validation = _validation_plan(run_validation=run_validation, base_model=base_model)
    with trace_span(
        "lora_training_launch",
        "fine_tune_lora_setup",
        "fine_tuning",
        metadata={"base_model": base_model, "epochs": epochs, "mode": mode, "real_training_enabled": real_enabled},
    ) as span:
        if can_train:
            _run_hf_trainer(base_model=base_model, epochs=epochs, dataset_dir=data_dir, output_dir=run_dir)
            if run_validation:
                validation = _run_post_tune_validation()
        elif run_validation:
            validation = _run_post_tune_validation()
        launch = LoraTrainingLaunch(
            version="dc-lora-qlora-training-1.0",
            mode=mode,
            base_model=base_model,
            epochs=max(1, int(epochs)),
            dataset_manifest_path=str(data_dir / "dataset_manifest.json"),
            output_dir=str(run_dir),
            plan_path=str(run_dir / "latest_lora_plan.json"),
            dependencies=deps,
            qlora_config=DEFAULT_QLORA_CONFIG,
            validation=validation,
            launched_at=datetime.now(UTC).isoformat(),
        )
        plan = {
            **launch.to_dict(),
            "dataset": manifest,
            "trainer": {
                "class": "transformers.Trainer",
                "peft": True,
                "bitsandbytes_4bit": True,
                "safe_default": "plan_only unless MERCY_ENABLE_REAL_LORA_TRAINING=true and dependencies are installed",
            },
        }
        timestamped = run_dir / f"lora_plan_{datetime.now(UTC).strftime('%Y%m%d_%H%M%S')}.json"
        timestamped.write_text(json.dumps({**plan, "plan_path": str(timestamped)}, indent=2, sort_keys=True), encoding="utf-8")
        Path(launch.plan_path).write_text(json.dumps({**plan, "plan_path": str(timestamped)}, indent=2, sort_keys=True), encoding="utf-8")
        span["metadata"] = {**span.get("metadata", {}), **launch.to_dict()}
    trace_event(name="lora_training_launch_recorded", surface_context="fine_tuning", category="fine_tuning", metadata=launch.to_dict())
    return launch


def _validation_plan(*, run_validation: bool, base_model: str) -> dict[str, Any]:
    current = latest_regression_health()
    return {
        "wired": True,
        "ran": False,
        "command": "python -m evals.run_regression --corpus=full",
        "compares_against_latest_report": True,
        "base_model": base_model,
        "baseline": current,
        "note": "Use --run-validation after a real adapter is available to compare RAGAS scores.",
    }


def _run_post_tune_validation() -> dict[str, Any]:
    from evals.ragas_harness import run_advanced_regression

    baseline = latest_regression_health()
    report = run_advanced_regression(corpus="full")
    aggregate = report.get("aggregate") if isinstance(report.get("aggregate"), dict) else {}
    return {
        "wired": True,
        "ran": True,
        "baseline": baseline,
        "candidate": {
            "report_path": report.get("report_path"),
            "overall_score": aggregate.get("overall_score"),
            "pass_rate": aggregate.get("pass_rate"),
            "generated_at": report.get("generated_at"),
        },
        "delta": {
            "overall_score": round(float(aggregate.get("overall_score") or 0.0) - float(baseline.get("overall_score") or 0.0), 4),
            "pass_rate": round(float(aggregate.get("pass_rate") or 0.0) - float(baseline.get("pass_rate") or 0.0), 4),
        },
    }


def _run_hf_trainer(*, base_model: str, epochs: int, dataset_dir: Path, output_dir: Path) -> None:
    import importlib

    torch = importlib.import_module("torch")
    datasets = importlib.import_module("datasets")
    peft = importlib.import_module("peft")
    transformers = importlib.import_module("transformers")

    tokenizer = transformers.AutoTokenizer.from_pretrained(base_model, use_fast=True)
    tokenizer.pad_token = tokenizer.eos_token
    quantization_config = transformers.BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_use_double_quant=True,
    )
    model = transformers.AutoModelForCausalLM.from_pretrained(base_model, quantization_config=quantization_config, device_map="auto")
    model = peft.prepare_model_for_kbit_training(model)
    model = peft.get_peft_model(
        model,
        peft.LoraConfig(
            r=DEFAULT_QLORA_CONFIG["lora_r"],
            lora_alpha=DEFAULT_QLORA_CONFIG["lora_alpha"],
            lora_dropout=DEFAULT_QLORA_CONFIG["lora_dropout"],
            target_modules=DEFAULT_QLORA_CONFIG["target_modules"],
            task_type="CAUSAL_LM",
        ),
    )
    dataset = datasets.load_dataset("json", data_files={"train": str(dataset_dir / "dc_lora_train.jsonl"), "validation": str(dataset_dir / "dc_lora_validation.jsonl")})

    def tokenize(row: dict[str, Any]) -> dict[str, Any]:
        text = "\n".join(f"{message['role']}: {message['content']}" for message in row["messages"])
        return tokenizer(text, truncation=True, max_length=4096, padding="max_length")

    tokenized = dataset.map(tokenize, remove_columns=dataset["train"].column_names)
    args = transformers.TrainingArguments(
        output_dir=str(output_dir / "adapter"),
        num_train_epochs=max(1, int(epochs)),
        per_device_train_batch_size=1,
        gradient_accumulation_steps=8,
        learning_rate=2e-4,
        logging_steps=10,
        save_strategy="epoch",
        evaluation_strategy="epoch",
        bf16=True,
        report_to=[],
    )
    trainer = transformers.Trainer(model=model, args=args, train_dataset=tokenized["train"], eval_dataset=tokenized["validation"])
    trainer.train()
    model.save_pretrained(output_dir / "adapter")
    tokenizer.save_pretrained(output_dir / "adapter")


__all__ = ["DEFAULT_BASE_MODEL", "DEFAULT_QLORA_CONFIG", "dependency_status", "launch_lora_training"]
