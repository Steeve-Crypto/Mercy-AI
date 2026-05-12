from __future__ import annotations

import unittest

from ragas_eval import DEFAULT_DATASET_PATH, load_golden_dataset, run_ragas_evaluation


class RagasEvalTests(unittest.TestCase):
    def test_golden_dataset_template_has_dc_examples(self) -> None:
        examples = load_golden_dataset(DEFAULT_DATASET_PATH)

        self.assertGreaterEqual(len(examples), 20)
        self.assertLessEqual(len(examples), 30)
        self.assertTrue(all(example.question for example in examples))
        self.assertTrue(all(example.ground_truth for example in examples))
        self.assertTrue(all(example.expected_source_ids for example in examples))
        self.assertTrue(any("ethics" in example.tags for example in examples))

    def test_ragas_evaluation_returns_required_metrics(self) -> None:
        report = run_ragas_evaluation(limit=5, top_k=5, pass_threshold=0.2)

        self.assertEqual(report["eval_version"], "ragas-eval-1.0")
        self.assertEqual(report["dataset_size"], 5)
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
        self.assertEqual(len(report["rows"]), 5)
        self.assertIn("retrieved_citations", report["rows"][0])


if __name__ == "__main__":
    unittest.main()
