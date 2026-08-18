#!/usr/bin/env python3
from __future__ import annotations

import argparse
import ast
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KERNEL = ROOT / "os_kernel"


def locator(path: Path, lineno: int, name: str) -> str:
    rel = path.relative_to(ROOT).as_posix()
    return f"{rel}:{lineno}:{name}"


def functions(path: Path) -> list[tuple[str, ast.AST, int, str]]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    found = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            body = ast.dump(node, include_attributes=False)
            found.append((node.name, node, node.lineno, body))
    return found


def analyze() -> dict:
    domain_branches: list[dict] = []
    escape_hatches: list[dict] = []
    caller_contract: list[dict] = []
    trusted: list[dict] = []
    bodies: dict[str, list[str]] = {}
    for path in sorted(KERNEL.glob("*.py")):
        source = path.read_text(encoding="utf-8")
        tree = ast.parse(source)
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in {"eval", "exec", "compile"}:
                escape_hatches.append({"locator": locator(path, node.lineno, node.func.id), "kind": node.func.id})
        for name, node, lineno, body in functions(path):
            digest = hashlib.sha256(body.encode()).hexdigest()
            bodies.setdefault(digest, []).append(locator(path, lineno, name))
            if path.name == "kernel.py" and name in {"open", "apply", "query", "explain"}:
                caller_contract.append({"locator": locator(path, lineno, f"Kernel.{name}"), "symbol": name})
            if path.name == "kernel.py" and name == "apply":
                trusted.append(
                    {
                        "locator": locator(path, lineno, "Kernel.apply"),
                        "role": "public-write",
                    }
                )
            if path.name == "protocol.py" and name == "commit_operation":
                nonblank = sum(1 for line in ast.unparse(node).splitlines() if line.strip())
                trusted.append(
                    {
                        "locator": locator(path, lineno, "commit_operation"),
                        "role": "commit-protocol",
                        "nonblank_lines": nonblank,
                    }
                )
            if path.name == "expression.py" and name == "evaluate":
                trusted.append({"locator": locator(path, lineno, "evaluate"), "role": "interpreter"})
            if path.name == "store.py" and name == "commit":
                trusted.append({"locator": locator(path, lineno, "Store.commit"), "role": "atomic-swap"})
    duplicated = []
    for digest, locs in bodies.items():
        names = [item.split(":")[-1] for item in locs]
        if len(locs) > 1 and not all(name.startswith("_") or name in {"main"} for name in names):
            if len(set(names)) > 1:
                duplicated.append({"locator": locs, "digest": digest})
    public_writes = [
        {"locator": "os_kernel/kernel.py:Kernel.apply", "commands": [
            "InstallDefinitionRevision",
            "CreateEntity",
            "RecordClaim",
            "RecordExternalOccurrence",
            "ProposeOperation",
            "RecordApproval",
            "CommitOperation",
            "RecordEffectAttempt",
            "ReconcileEffect",
        ]}
    ]
    caller_contract.extend(public_writes)
    return {
        "language": "python",
        "version": "3.12",
        "domain_branches": domain_branches,
        "duplicated_rule_groups": duplicated,
        "escape_hatches": escape_hatches,
        "caller_contract": caller_contract,
        "trusted_commit_path": trusted,
        "unsupported": {},
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    payload = analyze()
    Path(args.output).write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
