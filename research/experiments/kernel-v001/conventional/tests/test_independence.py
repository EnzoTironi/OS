from __future__ import annotations

import ast
import hashlib
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
EXPERIMENT = HERE.parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
if str(EXPERIMENT / "scripts") not in sys.path:
    sys.path.insert(0, str(EXPERIMENT / "scripts"))

import analyze
import verify
from harness import load_scenario, remap_strings, run_document

FORBIDDEN_IMPORTS = {"os_kernel"}
FORBIDDEN_STEMS = (
    "kernel-v001-run-1.json",
    "kernel-v001-scenario-run.json",
    "kernel-v001-comparison.json",
)
PUBLIC_CONTRACT = {"main"}
EFFECT_FIXTURE_ID = "effect:" + "book-carrier-1"


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

    def test_full_domain_remap_includes_effect_request(self) -> None:
        scenario = load_scenario()
        mapping = {
            "party:org-a": "party:org-z",
            "party:org-b": "party:org-y",
            "product:sku-x": "product:sku-z",
            "stock:sku-x": "stock:sku-z",
            "order:b-sku-x": "order:y-sku-z",
            "purchase-raw-1": "buy-lot-9",
            EFFECT_FIXTURE_ID: "effect:haul-7",
        }
        remapped = remap_strings(scenario, mapping)
        run = run_document(remapped)
        self.assertEqual(run["engine"], "conventional")
        self.assertEqual(run["operation_receipts"][0]["operation_id"], "buy-lot-9")
        self.assertEqual(run["records"]["effect_requests"][0]["request_id"], "effect:haul-7")
        self.assertNotIn(EFFECT_FIXTURE_ID, str(run["records"]["effect_requests"]))
        known = next(item for item in run["queries"] if item["type"] == "known-then")
        believed = next(item for item in run["queries"] if item["type"] == "now-believed-for-then")
        self.assertEqual(known["subject"], "stock:sku-z")
        self.assertNotEqual(known["value"], believed["value"])
        self.assertTrue(run["explanations"][0]["complete"])
        comparison = verify.evaluate_run(run, analyze.analyze("0" * 40))
        failed = [item["property_id"] for item in comparison["property_results"] if not item["passed"]]
        self.assertEqual(failed, [])
        self.assertEqual(len(comparison["property_results"]), 12)

    def test_services_do_not_hardcode_effect_request(self) -> None:
        for path in (HERE / "services").glob("*.py"):
            self.assertNotIn(EFFECT_FIXTURE_ID, path.read_text(encoding="utf-8"), path)

    def test_no_byte_identical_kernel_files(self) -> None:
        kernel = EXPERIMENT / "os_kernel"
        for path in (HERE / "services").glob("*.py"):
            other = kernel / path.name
            if not other.is_file():
                continue
            self.assertNotEqual(path.read_bytes(), other.read_bytes(), path.name)

    def test_helpers_are_structurally_independent(self) -> None:
        kernel_bodies = _function_bodies(EXPERIMENT / "os_kernel")
        local_bodies = _function_bodies(HERE / "services")
        shared = set(kernel_bodies) & set(local_bodies)
        collisions = []
        for digest in shared:
            kernel_names = {item.split(":")[-1] for item in kernel_bodies[digest]}
            local_names = {item.split(":")[-1] for item in local_bodies[digest]}
            if kernel_names <= PUBLIC_CONTRACT and local_names <= PUBLIC_CONTRACT:
                continue
            collisions.append((digest, kernel_bodies[digest], local_bodies[digest]))
        self.assertEqual(collisions, [])

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


def _function_bodies(root: Path) -> dict[str, list[str]]:
    bodies: dict[str, list[str]] = {}
    for path in sorted(root.glob("*.py")):
        if path.name == "__init__.py":
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            payload = ast.dump(node, include_attributes=False).encode()
            digest = hashlib.sha256(payload).hexdigest()
            bodies.setdefault(digest, []).append(f"{path.name}:{node.name}")
    return bodies
