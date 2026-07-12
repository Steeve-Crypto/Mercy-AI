from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from evals.ragas_harness import build_full_seeded_corpus, ensure_golden_dataset, run_advanced_regression
from evals.regression_status import LATEST_REGRESSION_REPORT


class AdvancedRagasRegressionTests(unittest.TestCase):
    def test_full_seeded_corpus_has_expected_chunk_count(self) -> None:
        sources, chunks = build_full_seeded_corpus()

        self.assertGreaterEqual(len(sources), 70)
        self.assertGreaterEqual(len(chunks), 1145)
        self.assertTrue(all(chunk.jurisdiction == "District of Columbia" for chunk in chunks))

    def test_golden_dataset_generation_minimum_cases(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "golden.jsonl"
            cases = ensure_golden_dataset(path=path, min_cases=200)

            self.assertEqual(len(cases), 200)
            self.assertTrue(path.exists())
            self.assertTrue(all(case.expected_source_id for case in cases))

    def test_regression_subset_writes_report_and_health(self) -> None:
        latest_before = LATEST_REGRESSION_REPORT.read_bytes() if LATEST_REGRESSION_REPORT.exists() else None
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            report = run_advanced_regression(
                corpus="full",
                golden_path=root / "golden.jsonl",
                report_dir=root / "reports",
                limit=12,
                publish_latest=False,
            )

            self.assertTrue(report["passed"])
            self.assertGreaterEqual(report["corpus"]["chunk_count"], 1145)
            self.assertEqual(report["dataset_size"], 12)
            self.assertGreaterEqual(report["aggregate"]["faithfulness"], 0.90)
            self.assertGreaterEqual(report["aggregate"]["context_precision"], 0.90)
            self.assertTrue(Path(report["report_path"]).exists())
        latest_after = LATEST_REGRESSION_REPORT.read_bytes() if LATEST_REGRESSION_REPORT.exists() else None
        self.assertEqual(latest_after, latest_before)


if __name__ == "__main__":
    unittest.main()
