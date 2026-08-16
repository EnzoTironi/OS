#!/usr/bin/env python3
"""Generate/check the cross-ontology verification registry from canonical research.

The registry is deliberately derived from the source Markdown instead of copied
by hand. The source family config supplies expected counts and verification
strategy defaults; headings supply canonical IDs/titles.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
CONFIG_PATH = HERE / "registry-config.json"


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def heading_records(path: Path, prefix: str, kind: str) -> list[dict[str, str]]:
    if not path.exists():
        fail(f"missing canonical {kind} source: {path.relative_to(ROOT)}")
    escaped = re.escape(prefix)
    pattern = re.compile(rf"^## ({escaped}\d{{2}})\s+(?:—|-)\s+(.+?)\s*$", re.MULTILINE)
    text = path.read_text(encoding="utf-8")
    return [{"id": ident, "title": title.strip()} for ident, title in pattern.findall(text)]


def expected_ids(prefix: str, count: int) -> list[str]:
    return [f"{prefix}{i:02d}" for i in range(1, count + 1)]


def enrich_mechanisms(family: str, title: str, defaults: list[str]) -> list[str]:
    """Add targeted mechanisms from scenario wording without replacing defaults."""
    mechanisms = list(defaults)
    lowered = title.lower()

    keyword_map: list[tuple[tuple[str, ...], str]] = [
        (("concurrent", "write skew", "serialization", "phantom", "race"), "backend-concurrency"),
        (("crash", "timeout", "outage", "restore", "partition", "failover", "lost"), "fault-injection"),
        (("retry", "replay", "cancel", "out-of-order", "duplicate", "pending", "indeterminate"), "model-check"),
        (("delegate", "grant", "sod", "separation", "privilege", "authority", "tenant"), "smt"),
        (("copy", "threshold", "arrival", "reprocess", "invariance", "same payload"), "metamorphic"),
        (("projection", "index", "rebuild", "cdc", "derived"), "rebuild"),
    ]
    for words, mechanism in keyword_map:
        if any(word in lowered for word in words) and mechanism not in mechanisms:
            mechanisms.append(mechanism)

    # Family-level safety nets for the two highest-value formal domains.
    if family == "authorization" and "smt" not in mechanisms:
        mechanisms.append("smt")
    if family in {"commit", "effects", "orchestration"} and "model-check" not in mechanisms:
        mechanisms.append("model-check")
    return mechanisms


def build_registry() -> dict[str, Any]:
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    allowed = set(config["allowed_mechanisms"])
    scenarios: list[dict[str, Any]] = []
    laws: list[dict[str, Any]] = []

    for family in config["families"]:
        scenario_source = ROOT / family["scenario_source"]
        law_source = ROOT / family["law_source"]
        found_scenarios = heading_records(scenario_source, family["scenario_prefix"], "scenario")
        found_laws = heading_records(law_source, family["law_prefix"], "law")

        scenario_ids = [record["id"] for record in found_scenarios]
        law_ids = [record["id"] for record in found_laws]
        expected_scenarios = expected_ids(family["scenario_prefix"], family["expected_scenarios"])
        expected_laws = expected_ids(family["law_prefix"], family["expected_laws"])
        if scenario_ids != expected_scenarios:
            fail(
                f"{family['name']} scenario drift: expected {expected_scenarios[0]}..{expected_scenarios[-1]} "
                f"({len(expected_scenarios)}), got {scenario_ids[:1]}..{scenario_ids[-1:]} ({len(scenario_ids)})"
            )
        if law_ids != expected_laws:
            fail(
                f"{family['name']} law drift: expected {expected_laws[0]}..{expected_laws[-1]} "
                f"({len(expected_laws)}), got {law_ids[:1]}..{law_ids[-1:]} ({len(law_ids)})"
            )

        defaults = family["default_verification"]
        unknown = set(defaults) - allowed
        if unknown:
            fail(f"{family['name']} uses unknown verification mechanisms: {sorted(unknown)}")

        for record in found_scenarios:
            mechanisms = enrich_mechanisms(family["name"], record["title"], defaults)
            if set(mechanisms) - allowed:
                fail(f"generated unknown mechanisms for {record['id']}: {mechanisms}")
            scenarios.append(
                {
                    "scenario_id": record["id"],
                    "issue": family["issue"],
                    "family": family["name"],
                    "source": family["scenario_source"],
                    "title": record["title"],
                    "severity": "P0",
                    "verification": mechanisms,
                    "status": "designed",
                }
            )

        for record in found_laws:
            laws.append(
                {
                    "law_id": record["id"],
                    "issue": family["issue"],
                    "family": family["name"],
                    "source": family["law_source"],
                    "title": record["title"],
                }
            )

    scenario_ids_all = [record["scenario_id"] for record in scenarios]
    law_ids_all = [record["law_id"] for record in laws]
    if len(scenario_ids_all) != len(set(scenario_ids_all)):
        fail("duplicate scenario IDs across families")
    if len(law_ids_all) != len(set(law_ids_all)):
        fail("duplicate law IDs across families")
    if len(scenarios) != config["expected_total_scenarios"]:
        fail(f"expected {config['expected_total_scenarios']} scenarios, got {len(scenarios)}")
    if len(laws) != config["expected_total_laws"]:
        fail(f"expected {config['expected_total_laws']} laws, got {len(laws)}")

    return {
        "schema_version": 1,
        "generated_from": "canonical reviewed research Markdown",
        "scenario_count": len(scenarios),
        "law_count": len(laws),
        "scenarios": scenarios,
        "laws": laws,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true", help="emit generated registry JSON")
    parser.add_argument("--check", action="store_true", help="validate source/config consistency")
    args = parser.parse_args()
    registry = build_registry()
    if args.json:
        json.dump(registry, sys.stdout, indent=2, sort_keys=True)
        print()
    else:
        print(
            f"ok: registry covers {registry['scenario_count']} scenarios and {registry['law_count']} laws"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
