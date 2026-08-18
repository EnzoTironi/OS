from __future__ import annotations

import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import analyze


class AnalyzerTests(unittest.TestCase):
    def test_report_shape(self) -> None:
        report = analyze.analyze("0" * 40)
        for key in (
            "domain_branches",
            "domain_coupling",
            "duplicated_rule_groups",
            "escape_hatches",
            "caller_contract",
            "trusted_commit_path",
            "source_sha",
            "unsupported",
        ):
            self.assertIn(key, report)
        for key in (
            "domain_branches",
            "domain_coupling",
            "duplicated_rule_groups",
            "escape_hatches",
            "caller_contract",
            "trusted_commit_path",
        ):
            metric = report[key]
            self.assertTrue(metric["scan_scope"])
            self.assertTrue(metric["rule"])
            self.assertIsInstance(metric["findings"], list)
            if metric["findings"]:
                first = metric["findings"][0]
                self.assertTrue(first.get("path") or first.get("locator"))
                self.assertTrue("line" in first or "locator" in first)
        self.assertIn("crash_durability", report["unsupported"])
        self.assertIn("distributed_serializability", report["unsupported"])
