#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
EXPERIMENT = HERE.parent
REPO = EXPERIMENT.parents[2]
ONTOLOGY_V002 = (
    EXPERIMENT / "fixtures" / "v002" / "definitions.json",
    EXPERIMENT / "fixtures" / "v002" / "scenario.json",
    EXPERIMENT / "tests" / "test_v002_extension.py",
)


def nonblank_lines(path: Path) -> int:
    return sum(1 for line in path.read_text(encoding="utf-8").splitlines() if line.strip())


def git_changed(parent_sha: str) -> list[str]:
    proc = subprocess.run(
        ["git", "diff", "--name-only", parent_sha],
        cwd=REPO,
        check=False,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        return []
    return [line for line in proc.stdout.splitlines() if line]


def measure(parent_sha: str, source_sha: str, structure: dict[str, Any]) -> dict[str, Any]:
    changed = git_changed(parent_sha)
    conventional = [
        path
        for path in changed
        if path.startswith("research/experiments/kernel-v001/conventional/")
        or path == ".github/workflows/kernel-v002-conventional-ci.yml"
    ]
    by_file = {path: nonblank_lines(REPO / path) for path in conventional if (REPO / path).is_file()}
    ontology = {path.relative_to(REPO).as_posix(): nonblank_lines(path) for path in ONTOLOGY_V002}
    return {
        "contract_version": "kernel-v002-delta/1",
        "parent_sha": parent_sha,
        "source_sha": source_sha,
        "conventional_extension": {
            "files": conventional,
            "file_count": len(conventional),
            "nonblank_lines": sum(by_file.values()),
            "nonblank_by_file": by_file,
        },
        "ontology_extension": {
            "files": list(ontology),
            "file_count": len(ontology),
            "nonblank_lines": sum(ontology.values()),
            "nonblank_by_file": ontology,
        },
        "structure_delta": {
            "domain_branches": len((structure.get("domain_branches") or {}).get("findings") or []),
            "duplicated_rule_groups": len((structure.get("duplicated_rule_groups") or {}).get("findings") or []),
            "caller_contract": len((structure.get("caller_contract") or {}).get("findings") or []),
            "trusted_commit_path": len((structure.get("trusted_commit_path") or {}).get("findings") or []),
        },
    }


def write_report(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
