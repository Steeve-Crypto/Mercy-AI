from __future__ import annotations

import unittest

from ragas_eval import DEFAULT_DATASET_PATH, load_golden_dataset, run_ragas_evaluation


class RagasEvalTests(unittest.TestCase):
    def test_golden_dataset_template_has_dc_examples(self) -> None:
        examples = load_golden_dataset(DEFAULT_DATASET_PATH)

        self.assertGreaterEqual(len(examples), 40)
        self.assertLessEqual(len(examples), 50)
        self.assertTrue(all(example.question for example in examples))
        self.assertTrue(all(example.ground_truth for example in examples))
        self.assertTrue(all(example.expected_source_ids for example in examples))
        self.assertTrue(any("ethics" in example.tags for example in examples))
        self.assertTrue(any("zoning" in example.tags for example in examples))
        self.assertTrue(any("family" in example.tags for example in examples))
        self.assertTrue(any("administrative-appeal" in example.tags for example in examples))

    def test_ragas_evaluation_returns_required_metrics(self) -> None:
        report = run_ragas_evaluation(limit=8, top_k=5, pass_threshold=0.72)

        self.assertEqual(report["eval_version"], "ragas-eval-1.1")
        self.assertEqual(report["dataset_size"], 8)
        self.assertIn("aggregate", report)
        for metric in (
            "faithfulness",
            "answer_relevancy",
            "context_precision",
            "context_recall",
            "answer_correctness",
        ):
            self.assertIn(metric, report["aggregate"])
            self.assertGreaterEqual(report["aggregate"][metric], 0.0)
            self.assertLessEqual(report["aggregate"][metric], 1.0)
        self.assertEqual(len(report["rows"]), 8)
        self.assertIn("retrieved_citations", report["rows"][0])
        self.assertIn("failure_groups", report)
        self.assertIn("langsmith", report)
        self.assertIn("langsmith_run_url", report["rows"][0])
        self.assertGreaterEqual(report["aggregate"]["overall"], 0.72)
        self.assertGreaterEqual(report["aggregate"]["pass_rate"], 0.80)


if __name__ == "__main__":
    unittest.main()
