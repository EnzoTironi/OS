#!/usr/bin/env python3
from __future__ import annotations

import argparse
import ast
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
SERVICES = ROOT / "services"

DOMAIN_MARKERS = {
    "purchase",
    "purchasing",
    "stock",
    "order",
    "carrier",
    "approval",
    "delegation",
    "available",
    "demand",
    "goods",
    "receipt",
    "replan",
    "stale",
}


def locator(path: Path, lineno: int, name: str) -> str:
    rel = path.relative_to(ROOT).as_posix()
    return f"{rel}:{lineno}:{name}"


def service_paths() -> list[Path]:
    return sorted(path for path in SERVICES.glob("*.py") if path.name != "__init__.py")


def _metric(scope: list[str], rule: str, findings: list[Any]) -> dict[str, Any]:
    return {"scan_scope": scope, "rule": rule, "findings": findings}


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


def domain_branch_findings() -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    for path in service_paths():
        source = path.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=str(path))
        rel = path.relative_to(ROOT).as_posix()
        for node in ast.walk(tree):
            if isinstance(node, ast.If):
                text = ast.get_source_segment(source, node.test) or ""
                lowered = text.lower()
                if any(marker in lowered for marker in DOMAIN_MARKERS):
                    hits.append({"path": rel, "line": node.lineno, "kind": "domain-if", "text": text.strip()[:120]})
            if isinstance(node, ast.Compare):
                for child in ast.walk(node):
                    if isinstance(child, ast.Constant) and isinstance(child.value, str):
                        lowered = child.value.lower()
                        if any(marker in lowered for marker in DOMAIN_MARKERS) and len(child.value) > 3:
                            hits.append(
                                {
                                    "path": rel,
                                    "line": child.lineno,
                                    "kind": "domain-compare",
                                    "text": child.value,
                                }
                            )
    return hits


def escape_findings() -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    for path in service_paths():
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        rel = path.relative_to(ROOT).as_posix()
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in {"eval", "exec", "compile"}:
                hits.append({"path": rel, "line": node.lineno, "kind": node.func.id})
            if isinstance(node, ast.Attribute) and node.attr == "write_authoritative_claim":
                hits.append({"path": rel, "line": node.lineno, "kind": "raw-write"})
    return hits


def caller_findings() -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    engine = SERVICES / "engine.py"
    tree = ast.parse(engine.read_text(encoding="utf-8"), filename=str(engine))
    for class_name, node in _functions(tree):
        if class_name == "ConventionalEngine" and not node.name.startswith("_"):
            hits.append(
                {
                    "path": "services/engine.py",
                    "line": node.lineno,
                    "symbol": node.name,
                }
            )
    return hits


def trusted_findings() -> list[dict[str, Any]]:
    trusted = (
        ("purchasing.py", "PurchasingService", "commit"),
        ("purchasing.py", "PurchasingService", "propose"),
        ("effects.py", "EffectService", "attempt"),
        ("effects.py", "EffectService", "reconcile"),
        ("engine.py", "ConventionalEngine", "apply"),
    )
    hits: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()
    for path in service_paths():
        source = path.read_text(encoding="utf-8")
        lines = source.splitlines()
        tree = ast.parse(source, filename=str(path))
        for class_name, node in _functions(tree):
            key = (path.name, class_name or "", node.name)
            if key in trusted:
                seen.add(key)
                hits.append(
                    {
                        "path": f"services/{path.name}",
                        "line": node.lineno,
                        "symbol": f"{class_name}.{node.name}",
                        "nonblank_lines": _nonblank(lines, node),
                    }
                )
    for filename, class_name, name in trusted:
        if (filename, class_name, name) not in seen:
            hits.append({"path": f"services/{filename}", "line": 0, "symbol": name, "missing": True})
    return hits


def duplicated_findings() -> list[dict[str, Any]]:
    bodies: dict[str, list[str]] = {}
    for path in service_paths():
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for class_name, node in _functions(tree):
            payload = hashlib.sha256(ast.dump(node, include_attributes=False).encode()).hexdigest()
            symbol = f"{class_name}.{node.name}" if class_name else node.name
            bodies.setdefault(payload, []).append(locator(path, node.lineno, symbol))
    duplicated = []
    for digest, locs in bodies.items():
        names = [item.split(":")[-1] for item in locs]
        public = [name for name in names if not name.split(".")[-1].startswith("_")]
        if len(locs) > 1 and len(set(public)) > 1:
            duplicated.append({"path": locs[0].split(":")[0], "line": int(locs[0].split(":")[1]), "locator": locs, "digest": digest})
    return duplicated


def analyze(source_sha: str) -> dict[str, Any]:
    scope = [path.relative_to(ROOT).as_posix() for path in service_paths()]
    return {
        "language": "python",
        "version": f"{sys.version_info.major}.{sys.version_info.minor}",
        "source_sha": source_sha,
        "domain_branches": _metric(
            scope,
            "domain-coded if/compare branches in conventional services",
            domain_branch_findings(),
        ),
        "duplicated_rule_groups": _metric(
            scope,
            "duplicate normalized public function bodies in conventional services",
            duplicated_findings(),
        ),
        "escape_hatches": _metric(
            scope,
            "eval/exec/compile and authoritative write surfaces in conventional services",
            escape_findings(),
        ),
        "caller_contract": _metric(
            [item for item in scope if item.endswith("engine.py")],
            "public ConventionalEngine methods visible to the caller",
            caller_findings(),
        ),
        "trusted_commit_path": _metric(
            ["services/purchasing.py", "services/effects.py", "services/engine.py"],
            "nonblank lines of the conventional purchase commit and effect path",
            trusted_findings(),
        ),
        "unsupported": {
            "crash_durability": {
                "scan_scope": ["none"],
                "rule": "in-memory conventional services do not measure crash durability",
                "status": "not_executed",
            },
            "distributed_serializability": {
                "scan_scope": ["none"],
                "rule": "in-memory conventional services do not measure distributed serializability",
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
