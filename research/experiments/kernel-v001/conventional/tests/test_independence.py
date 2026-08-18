from __future__ import annotations

import ast
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
EXPERIMENT = HERE.parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
if str(EXPERIMENT / "scripts") not in sys.path:
    sys.path.insert(0, str(EXPERIMENT / "scripts"))

from harness import load_scenario, remap_strings, run_document

FORBIDDEN_IMPORTS = {"os_kernel"}
FORBIDDEN_STEMS = (
    "kernel-v001-run-1.json",
    "kernel-v001-scenario-run.json",
    "kernel-v001-comparison.json",
)


def _iter_source() -> list[Path]:
    paths = list((HERE / "services").glob("*.py"))
    paths.extend(HERE.glob("*.py"))
    paths.extend((HERE / "tests").glob("test_*.py"))
    return [path for path in paths if path.name != "__init__.py"]


class IndependenceTests(unittest.TestCase):
    def test_no_kernel_imports(self) -> None:
        for path in _iter_source():
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        self.assertNotIn(alias.name.split(".")[0], FORBIDDEN_IMPORTS, path)
                if isinstance(node, ast.ImportFrom):
                    module = node.module or ""
                    self.assertNotIn(module.split(".")[0], FORBIDDEN_IMPORTS, path)

    def test_no_ontological_artifact_reads(self) -> None:
        for path in _iter_source():
            if path.name == "test_independence.py":
                continue
            raw = path.read_text(encoding="utf-8")
            self.assertNotIn("import os_" + "kernel", raw, path)
            self.assertNotIn("from os_" + "kernel", raw, path)
            for needle in FORBIDDEN_STEMS:
                self.assertNotIn(needle, raw, f"{path}: {needle}")

    def test_domain_remap_still_executes(self) -> None:
        scenario = load_scenario()
        mapping = {
            "party:org-a": "party:org-z",
            "party:org-b": "party:org-y",
            "product:sku-x": "product:sku-z",
            "stock:sku-x": "stock:sku-z",
            "order:b-sku-x": "order:y-sku-z",
            "purchase-raw-1": "buy-lot-9",
        }
        remapped = remap_strings(scenario, mapping)
        run = run_document(remapped)
        self.assertEqual(run["engine"], "conventional")
        self.assertTrue(run["operation_receipts"])
        self.assertEqual(run["operation_receipts"][0]["operation_id"], "buy-lot-9")
        known = next(item for item in run["queries"] if item["type"] == "known-then")
        believed = next(item for item in run["queries"] if item["type"] == "now-believed-for-then")
        self.assertEqual(known["subject"], "stock:sku-z")
        self.assertNotEqual(known["value"], believed["value"])
        self.assertTrue(run["explanations"][0]["complete"])

    def test_quantity_variation_changes_derived_values(self) -> None:
        baseline = run_document(load_scenario())
        scenario = load_scenario()
        for command in scenario["commands"]:
            if command.get("command_id") == "erp-20":
                command["value"] = command["value"] + 15
            if command.get("command_id") == "wms-receipt":
                command["payload"]["signed"] = command["payload"]["signed"] - 100
            if command.get("command_id") == "propose-purchase":
                command["inputs"]["quantity"] = command["inputs"]["quantity"] - 50
        varied = run_document(scenario)
        known_base = next(item for item in baseline["queries"] if item["type"] == "known-then")
        known_var = next(item for item in varied["queries"] if item["type"] == "known-then")
        believed_var = next(item for item in varied["queries"] if item["type"] == "now-believed-for-then")
        self.assertNotEqual(known_base["value"], known_var["value"])
        self.assertNotEqual(known_var["value"], believed_var["value"])
        self.assertEqual(
            known_var["value"],
            sum(item["value"] for item in known_var["contributors"]),
        )
        receipt = varied["operation_receipts"][0]
        self.assertNotEqual(receipt["planned_quantity"], baseline["operation_receipts"][0]["planned_quantity"])
        self.assertNotEqual(receipt["committed_quantity"], receipt["planned_quantity"])
        self.assertNotEqual(receipt["committed_quantity"], baseline["operation_receipts"][0]["committed_quantity"])
