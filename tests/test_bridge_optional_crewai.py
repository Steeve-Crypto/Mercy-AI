from __future__ import annotations

import unittest

from bridge import run_discovery


class BridgeOptionalCrewAiTests(unittest.TestCase):
    def test_bridge_falls_back_when_crewai_is_not_installed(self) -> None:
        result = run_discovery("__missing__.txt", document_text="Contract notice dispute under D.C. law.")

        self.assertEqual(result["engine"], "legal_discovery_ai.run_crew")
        self.assertEqual(result["workspace"], "DistrictDraft")
        self.assertIn("Contract notice dispute", result["facts"]["case_summary"])
        self.assertIn("attorney verification", result["citations"][0]["note"])


if __name__ == "__main__":
    unittest.main()
