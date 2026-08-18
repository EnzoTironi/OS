#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

import analyze_structure

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "fixtures" / "v001"


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
    hits = list(analyze_structure.domain_branch_findings())
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
