from __future__ import annotations

import argparse
import json

from finetune.dataset_builder import prepare_lora_dataset


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare Mercy DC LoRA/QLoRA training data from PD044 golden cases.")
    parser.add_argument("--golden", default="dc_regression_golden", help="Golden dataset alias or JSONL path.")
    parser.add_argument("--output", default="finetune/data/", help="Output directory for JSONL dataset files.")
    args = parser.parse_args()
    summary = prepare_lora_dataset(golden=args.golden, output=args.output)
    print(json.dumps(summary.to_dict(), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
