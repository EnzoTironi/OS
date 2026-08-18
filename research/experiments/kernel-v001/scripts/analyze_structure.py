#!/usr/bin/env python3
from __future__ import annotations

import argparse
import ast
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

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

TRUSTED_PATH = (
    ("kernel.py", "Kernel", "apply"),
    ("kernel.py", "Kernel", "_commit"),
    ("protocol.py", None, "commit_operation"),
    ("protocol.py", None, "_commit_body"),
    ("store.py", "Store", "_begin"),
    ("store.py", "Store", "_commit"),
    ("store.py", "Store", "_rollback"),
    ("expression.py", None, "evaluate"),
)

STORE_OWNERS = {"store.py", "kernel.py", "protocol.py"}
HATCH_NAMES = {"append", "set_state", "update", "delete", "write", "execute_handler"}
PRIVATE_STORE_MARKERS = {"_Kernel__store", "_Kernel__aliases", "_active", "_tables"}


def locator(path: Path, lineno: int, name: str) -> str:
    rel = path.relative_to(ROOT).as_posix()
    return f"{rel}:{lineno}:{name}"


def kernel_paths() -> list[Path]:
    return sorted(KERNEL.glob("*.py"))


def _collect_ids(node: Any, found: set[str]) -> None:
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


def banned_domain_ids() -> set[str]:
    return {item for item in domain_ids() if item not in PROTOCOL_KEYS}


def _is_dispatch(node: ast.AST) -> bool:
    if isinstance(node, ast.Assign):
        for target in node.targets:
            if isinstance(target, ast.Name) and target.id in {"dispatch", "registry", "handlers", "COMMANDS"}:
                return True
    return False


def scan_domain_file(path: Path, banned: set[str]) -> list[str]:
    rel = path.relative_to(ROOT).as_posix()
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    hits: list[str] = []

    class Visitor(ast.NodeVisitor):
        def visit_Compare(self, node: ast.Compare) -> None:
            for child in ast.walk(node):
                if isinstance(child, ast.Constant) and isinstance(child.value, str) and child.value in banned:
                    hits.append(f"{rel}:{child.lineno}:compare:{child.value}")
            self.generic_visit(node)

        def visit_Match(self, node: ast.Match) -> None:
            for case in node.cases:
                for child in ast.walk(case.pattern):
                    if isinstance(child, ast.Constant) and isinstance(child.value, str) and child.value in banned:
                        hits.append(f"{rel}:{child.lineno}:match:{child.value}")
            self.generic_visit(node)

        def visit_Assign(self, node: ast.Assign) -> None:
            if _is_dispatch(node) and isinstance(node.value, ast.Dict):
                for key in node.value.keys:
                    if isinstance(key, ast.Constant) and isinstance(key.value, str) and key.value in banned:
                        hits.append(f"{rel}:{node.lineno}:dispatch:{key.value}")
            self.generic_visit(node)

        def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
            module = node.module or ""
            if "mutants" in module.split("."):
                hits.append(f"{rel}:{node.lineno}:import-mutants:{module}")
            self.generic_visit(node)

        def visit_Import(self, node: ast.Import) -> None:
            for alias in node.names:
                if "mutants" in alias.name.split("."):
                    hits.append(f"{rel}:{node.lineno}:import-mutants:{alias.name}")
            self.generic_visit(node)

    Visitor().visit(tree)
    return hits


def domain_branch_findings() -> list[str]:
    banned = banned_domain_ids()
    hits: list[str] = []
    for path in kernel_paths():
        hits.extend(scan_domain_file(path, banned))
    return hits


def _metric(scope: list[str], rule: str, findings: list[Any], extra: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = {
        "scan_scope": scope,
        "rule": rule,
        "findings": findings,
    }
    if extra:
        payload.update(extra)
    return payload


def _functions(tree: ast.AST) -> list[tuple[str | None, ast.FunctionDef | ast.AsyncFunctionDef]]:
    found: list[tuple[str | None, ast.FunctionDef | ast.AsyncFunctionDef]] = []

    class Visitor(ast.NodeVisitor):
        def __init__(self) -> None:
            self.class_name: str | None = None

        def visit_ClassDef(self, node: ast.ClassDef) -> None:
            previous = self.class_name
            self.class_name = node.name
            self.generic_visit(node)
            self.class_name = previous

        def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
            found.append((self.class_name, node))
            self.generic_visit(node)

        def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
            found.append((self.class_name, node))
            self.generic_visit(node)

    Visitor().visit(tree)
    return found


def _nonblank(source_lines: list[str], node: ast.AST) -> int:
    start = getattr(node, "lineno", 1) - 1
    end = getattr(node, "end_lineno", start + 1)
    return sum(1 for line in source_lines[start:end] if line.strip())


def _escape_findings(path: Path, tree: ast.AST, source: str) -> list[dict[str, str]]:
    rel = path.relative_to(ROOT).as_posix()
    findings: list[dict[str, str]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in {"eval", "exec", "compile"}:
            findings.append({"locator": locator(path, node.lineno, node.func.id), "kind": node.func.id})
        if isinstance(node, ast.Attribute) and node.attr in PRIVATE_STORE_MARKERS and path.name not in STORE_OWNERS:
            findings.append({"locator": locator(path, node.lineno, node.attr), "kind": "private-store"})
        if isinstance(node, ast.Name) and node.id in PRIVATE_STORE_MARKERS and path.name not in STORE_OWNERS:
            findings.append({"locator": locator(path, node.lineno, node.id), "kind": "private-store"})
    if path.name == "kernel.py":
        for class_name, node in _functions(tree):
            if class_name == "Kernel" and not node.name.startswith("_") and node.name in HATCH_NAMES:
                findings.append({"locator": locator(path, node.lineno, f"Kernel.{node.name}"), "kind": "public-write"})
    if path.name == "store.py":
        for class_name, node in _functions(tree):
            if class_name == "Store" and node.name in {"begin", "commit", "rollback"}:
                findings.append({"locator": locator(path, node.lineno, f"Store.{node.name}"), "kind": "public-transaction"})
    if "mutants" in source and path.parent.name == "os_kernel":
        findings.append({"locator": f"{rel}:1:import-mutants", "kind": "mutant-import"})
    return findings


def analyze(source_sha: str) -> dict[str, Any]:
    scope = [path.relative_to(ROOT).as_posix() for path in kernel_paths()]
    domain_findings = domain_branch_findings()
    escape_findings: list[dict[str, str]] = []
    caller_findings: list[dict[str, Any]] = []
    trusted_findings: list[dict[str, Any]] = []
    bodies: dict[str, list[str]] = {}
    seen_trusted: set[tuple[str, str | None, str]] = set()
    for path in kernel_paths():
        source = path.read_text(encoding="utf-8")
        source_lines = source.splitlines()
        tree = ast.parse(source, filename=str(path))
        escape_findings.extend(_escape_findings(path, tree, source))
        for class_name, node in _functions(tree):
            digest = hashlib.sha256(ast.dump(node, include_attributes=False).encode()).hexdigest()
            symbol = f"{class_name}.{node.name}" if class_name else node.name
            bodies.setdefault(digest, []).append(locator(path, node.lineno, symbol))
            if path.name == "kernel.py" and class_name == "Kernel" and not node.name.startswith("_"):
                caller_findings.append(
                    {
                        "locator": locator(path, node.lineno, f"Kernel.{node.name}"),
                        "symbol": node.name,
                    }
                )
            key = (path.name, class_name, node.name)
            if key in TRUSTED_PATH:
                seen_trusted.add(key)
                trusted_findings.append(
                    {
                        "locator": locator(path, node.lineno, symbol),
                        "symbol": symbol,
                        "nonblank_lines": _nonblank(source_lines, node),
                    }
                )
    missing = [
        {"locator": f"os_kernel/{filename}:{class_name or 'module'}:{name}", "symbol": name, "missing": True}
        for filename, class_name, name in TRUSTED_PATH
        if (filename, class_name, name) not in seen_trusted
    ]
    trusted_findings.extend(missing)
    duplicated = []
    for digest, locs in bodies.items():
        names = [item.split(":")[-1] for item in locs]
        if len(locs) > 1 and not all(name.split(".")[-1].startswith("_") or name.split(".")[-1] in {"main"} for name in names):
            if len(set(names)) > 1:
                duplicated.append({"locator": locs, "digest": digest})
    return {
        "language": "python",
        "version": f"{sys.version_info.major}.{sys.version_info.minor}",
        "source_sha": source_sha,
        "domain_branches": _metric(
            scope,
            "compare, match, dispatch, and mutant imports against fixture domain ids",
            domain_findings,
        ),
        "duplicated_rule_groups": _metric(
            scope,
            "duplicate normalized public function bodies",
            duplicated,
        ),
        "escape_hatches": _metric(
            scope,
            "public writes, transaction controls, store injection, aliases, eval/exec/compile, private store, table mutation",
            escape_findings,
        ),
        "caller_contract": _metric(
            [item for item in scope if item.endswith("kernel.py")],
            "public Kernel methods visible to the caller",
            caller_findings,
        ),
        "trusted_commit_path": _metric(
            [f"os_kernel/{item[0]}" for item in TRUSTED_PATH],
            "nonblank lines of the trusted commit path",
            trusted_findings,
        ),
        "unsupported": {
            "crash_durability": {
                "scan_scope": ["none"],
                "rule": "in-memory prototype does not measure crash durability",
                "status": "not_executed",
            },
            "distributed_serializability": {
                "scan_scope": ["none"],
                "rule": "in-memory prototype does not measure distributed serializability",
                "status": "not_executed",
            },
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-sha", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    payload = analyze(args.source_sha)
    Path(args.output).write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
