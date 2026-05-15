from __future__ import annotations

import argparse
import json

from finetune.lora_setup import DEFAULT_BASE_MODEL, launch_lora_training


def main() -> None:
    parser = argparse.ArgumentParser(description="Launch or plan a Mercy DC LoRA/QLoRA fine-tune run.")
    parser.add_argument("--base-model", default=DEFAULT_BASE_MODEL, help="Hugging Face base model id.")
    parser.add_argument("--epochs", type=int, default=3, help="Training epochs for a real QLoRA run.")
    parser.add_argument("--dataset-dir", default="finetune/data/", help="Prepared dataset directory.")
    parser.add_argument("--output-dir", default="finetune/runs/", help="Training run output directory.")
    parser.add_argument("--run-validation", action="store_true", help="Run the full PD044 RAGAS regression after launch.")
    args = parser.parse_args()
    launch = launch_lora_training(
        base_model=args.base_model,
        epochs=args.epochs,
        dataset_dir=args.dataset_dir,
        output_dir=args.output_dir,
        run_validation=args.run_validation,
    )
    print(json.dumps(launch.to_dict(), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
