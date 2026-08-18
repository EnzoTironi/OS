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
CONVENTIONAL_PREFIX = "research/experiments/kernel-v001/conventional/"
WORKFLOW_PATH = ".github/workflows/kernel-v002-conventional-ci.yml"
SHARED_PREFIXES = (
    "research/experiments/kernel-v001/fixtures/",
    "research/experiments/kernel-v001/schemas/",
)


def nonblank_lines(path: Path) -> int:
    return sum(1 for line in path.read_text(encoding="utf-8").splitlines() if line.strip())


def classify(path: str) -> str:
    if any(path.startswith(prefix) for prefix in SHARED_PREFIXES):
        return "shared_fixture_schema"
    if path.startswith(CONVENTIONAL_PREFIX + "tests/"):
        return "test"
    if path == WORKFLOW_PATH:
        return "workflow"
    if path.startswith(CONVENTIONAL_PREFIX):
        return "domain"
    return "other"


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
    by_class: dict[str, list[str]] = {
        "domain": [],
        "test": [],
        "workflow": [],
        "shared_fixture_schema": [],
        "other": [],
    }
    class_nonblank = {key: 0 for key in by_class}
    for path, count in by_file.items():
        bucket = classify(path)
        by_class.setdefault(bucket, []).append(path)
        if bucket == "shared_fixture_schema":
            continue
        class_nonblank[bucket] = class_nonblank.get(bucket, 0) + count
    class_nonblank["shared_fixture_schema"] = 0
    ontology = {path.relative_to(REPO).as_posix(): nonblank_lines(path) for path in ONTOLOGY_V002}
    coupling = (structure.get("domain_coupling") or {}).get("findings") or []
    return {
        "contract_version": "kernel-v002-delta/2",
        "parent_sha": parent_sha,
        "source_sha": source_sha,
        "conventional_extension": {
            "files": conventional,
            "file_count": len(conventional),
            "nonblank_lines": class_nonblank["domain"] + class_nonblank["test"] + class_nonblank["workflow"],
            "domain_nonblank_lines": class_nonblank["domain"],
            "test_nonblank_lines": class_nonblank["test"],
            "workflow_nonblank_lines": class_nonblank["workflow"],
            "shared_fixture_schema_nonblank_lines": 0,
            "nonblank_by_file": by_file,
            "files_by_class": by_class,
        },
        "ontology_extension": {
            "files": list(ontology),
            "file_count": len(ontology),
            "nonblank_lines": sum(ontology.values()),
            "nonblank_by_file": ontology,
        },
        "structure_delta": {
            "domain_branches": len((structure.get("domain_branches") or {}).get("findings") or []),
            "domain_coupling": len(coupling),
            "duplicated_rule_groups": len((structure.get("duplicated_rule_groups") or {}).get("findings") or []),
            "caller_contract": len((structure.get("caller_contract") or {}).get("findings") or []),
            "trusted_commit_path": len((structure.get("trusted_commit_path") or {}).get("findings") or []),
        },
    }


def write_report(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
