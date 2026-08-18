#!/usr/bin/env python3
from __future__ import annotations

import ast
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KERNEL = ROOT / "os_kernel"
FIXTURE = ROOT / "fixtures" / "v001"

PROTOCOL_KEYS = {
    "InstallDefinitionRevision",
    "CreateEntity",
    "RecordClaim",
    "RecordExternalOccurrence",
    "ProposeOperation",
    "RecordApproval",
    "CommitOperation",
    "RecordEffectAttempt",
    "ReconcileEffect",
    "known-then",
    "now-believed-for-then",
    "scenario-report",
    "v001",
    "ontology",
    "conventional",
    "json",
    "os",
}


def _collect_ids(node, found: set[str]) -> None:
    if isinstance(node, dict):
        for key in (
            "definition_id",
            "action_id",
            "effect_id",
            "predicate_ref",
            "result_predicate",
            "planner_ref",
            "computation_ref",
            "mutation_plan_ref",
            "reconciliation_ref",
        ):
            value = node.get(key)
            if isinstance(value, str) and value:
                found.add(value)
        type_ref = node.get("type_ref") or node.get("occurrence_ref")
        if isinstance(type_ref, dict) and isinstance(type_ref.get("definition_id"), str):
            found.add(type_ref["definition_id"])
        for item in node.get("effect_refs", []):
            if isinstance(item, str):
                found.add(item)
        for item in node.get("rule_refs", []):
            if isinstance(item, str):
                found.add(item)
        for value in node.values():
            _collect_ids(value, found)
    elif isinstance(node, list):
        for item in node:
            _collect_ids(item, found)


def domain_ids() -> set[str]:
    found: set[str] = set()
    for path in FIXTURE.glob("*.json"):
        _collect_ids(json.loads(path.read_text(encoding="utf-8")), found)
    found.discard("v001")
    return found


def _is_dispatch(node: ast.AST) -> bool:
    if isinstance(node, ast.Assign):
        for target in node.targets:
            if isinstance(target, ast.Name) and target.id in {"dispatch", "registry", "handlers", "COMMANDS"}:
                return True
    return False


def scan_file(path: Path, banned: set[str]) -> list[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    hits: list[str] = []

    class Visitor(ast.NodeVisitor):
        def visit_Compare(self, node: ast.Compare) -> None:
            for child in ast.walk(node):
                if isinstance(child, ast.Constant) and isinstance(child.value, str) and child.value in banned:
                    hits.append(f"{path}:{child.lineno}:compare:{child.value}")
            self.generic_visit(node)

        def visit_Match(self, node: ast.Match) -> None:
            for case in node.cases:
                for child in ast.walk(case.pattern):
                    if isinstance(child, ast.Constant) and isinstance(child.value, str) and child.value in banned:
                        hits.append(f"{path}:{child.lineno}:match:{child.value}")
            self.generic_visit(node)

        def visit_Assign(self, node: ast.Assign) -> None:
            if _is_dispatch(node) and isinstance(node.value, ast.Dict):
                for key in node.value.keys:
                    if isinstance(key, ast.Constant) and isinstance(key.value, str) and key.value in banned:
                        hits.append(f"{path}:{node.lineno}:dispatch:{key.value}")
            self.generic_visit(node)

        def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
            module = node.module or ""
            if "mutants" in module.split("."):
                hits.append(f"{path}:{node.lineno}:import-mutants:{module}")
            self.generic_visit(node)

        def visit_Import(self, node: ast.Import) -> None:
            for alias in node.names:
                if "mutants" in alias.name.split("."):
                    hits.append(f"{path}:{node.lineno}:import-mutants:{alias.name}")
            self.generic_visit(node)

    Visitor().visit(tree)
    return hits


def check_definitions() -> list[str]:
    hits: list[str] = []
    forbidden = ("callable", "callback", "lambda", "__import__", "eval(", "exec(")
    for path in FIXTURE.glob("*.json"):
        raw = path.read_text(encoding="utf-8")
        lowered = raw.lower()
        for token in forbidden:
            if token in lowered:
                hits.append(f"{path}:definition-executable:{token}")
        data = json.loads(raw)
        stack = [data]
        while stack:
            node = stack.pop()
            if isinstance(node, dict):
                for key in node:
                    if key.lower() in {"callable", "callback", "import", "module", "module_path", "source_code", "handler"}:
                        hits.append(f"{path}:forbidden-key:{key}")
                stack.extend(node.values())
            elif isinstance(node, list):
                stack.extend(node)
    return hits


def main() -> int:
    banned = {item for item in domain_ids() if item not in PROTOCOL_KEYS}
    hits: list[str] = []
    for path in sorted(KERNEL.glob("*.py")):
        hits.extend(scan_file(path, banned))
    hits.extend(check_definitions())
    if hits:
        sys.stderr.write("domain branch or executable definition hits\n")
        for hit in hits:
            sys.stderr.write(hit + "\n")
        return 1
    print("ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
