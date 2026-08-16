#!/usr/bin/env python3
"""Validate the derived OS research graph.

Validation is intentionally structural/epistemic, not ontological. It verifies
that the index is internally consistent and does not silently erase Wave-A
review state. It does not decide whether a candidate law is true.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

NODE_TYPES = {
    "issue", "artifact", "evidence", "concept", "invariant", "candidate-law",
    "counterexample", "disagreement", "runtime-pressure", "experiment", "review",
    "open-question", "scenario", "source", "historical-disposition",
}
EDGE_TYPES = {
    "contains", "investigates", "supports", "challenges", "falsifies",
    "disagrees-with", "depends-on", "related-to", "observed-in", "requires",
    "reviews", "supersedes", "derived-from", "tests",
}
REVIEW_STATUSES = {
    "unreviewed", "raw-evidence-ok", "challenged", "blocked-factual",
    "blocked-deliverable", "review-clean",
}
EPISTEMIC_STATES = {None, "hypothesis", "supported", "rejected", "undetermined"}


def validate(graph: dict[str, Any], source_root: Path | None, expected_snapshot: str | None) -> list[str]:
    errors: list[str] = []

    if graph.get("schema_version") != 1:
        errors.append(f"unexpected graph schema_version: {graph.get('schema_version')!r}")

    snapshot = graph.get("snapshot") or {}
    commit = snapshot.get("commit")
    if not isinstance(commit, str) or len(commit) != 40:
        errors.append("snapshot.commit must be a 40-character SHA")
    if expected_snapshot and commit != expected_snapshot:
        errors.append(f"snapshot mismatch: expected {expected_snapshot}, got {commit}")

    nodes = graph.get("nodes")
    edges = graph.get("edges")
    if not isinstance(nodes, list):
        return errors + ["nodes must be a list"]
    if not isinstance(edges, list):
        return errors + ["edges must be a list"]

    by_id: dict[str, dict[str, Any]] = {}
    for index, node in enumerate(nodes):
        if not isinstance(node, dict):
            errors.append(f"nodes[{index}] is not an object")
            continue
        nid = node.get("id")
        if not isinstance(nid, str) or not nid:
            errors.append(f"nodes[{index}] missing id")
            continue
        if nid in by_id:
            errors.append(f"duplicate node id: {nid}")
        by_id[nid] = node
        if node.get("type") not in NODE_TYPES:
            errors.append(f"invalid node type for {nid}: {node.get('type')}")
        if node.get("review_status") not in REVIEW_STATUSES:
            errors.append(f"invalid review_status for {nid}: {node.get('review_status')}")
        if node.get("epistemic_state") not in EPISTEMIC_STATES:
            errors.append(f"invalid epistemic_state for {nid}: {node.get('epistemic_state')}")
        if node.get("type") in {"artifact", "review", "evidence", "concept", "invariant", "candidate-law", "counterexample", "disagreement", "runtime-pressure", "experiment", "open-question", "scenario", "historical-disposition"}:
            artifact = node.get("artifact")
            if artifact and source_root is not None and not (source_root / artifact).exists():
                # Post-snapshot review override files are intentionally not part
                # of the frozen source tree. They are allowed only for review
                # nodes generated from `research/graph/review-overrides.json`.
                if not (node.get("type") == "review" and str(artifact).endswith("research/graph/review-overrides.json")):
                    errors.append(f"artifact path missing for {nid}: {artifact}")

    seen_edges: set[tuple[str, str, str]] = set()
    disagreement_targets: dict[str, int] = {}
    for index, edge in enumerate(edges):
        if not isinstance(edge, dict):
            errors.append(f"edges[{index}] is not an object")
            continue
        source = edge.get("source")
        target = edge.get("target")
        kind = edge.get("type")
        if source not in by_id:
            errors.append(f"dangling edge source: {source}")
        if target not in by_id:
            errors.append(f"dangling edge target: {target}")
        if kind not in EDGE_TYPES:
            errors.append(f"invalid edge type {kind!r}: {source} -> {target}")
        key = (str(source), str(target), str(kind))
        if key in seen_edges:
            errors.append(f"duplicate edge: {key}")
        seen_edges.add(key)
        if source in by_id and by_id[source].get("type") == "disagreement" and kind == "disagrees-with":
            disagreement_targets[source] = disagreement_targets.get(source, 0) + 1

    # Only disagreements that were explicitly normalized from a structured index
    # are required to expose both graph targets. A Markdown heading named `D-*`
    # can be a narrative disagreement card whose two sides are prose, source
    # systems, external concepts, or records that do not have local IDs. Inventing
    # those targets by lexical NLP would be worse than leaving the locator
    # unresolved. #70 can later add explicit cross-artifact identity/edges.
    for nid, node in by_id.items():
        if node.get("type") == "disagreement" and nid.startswith("explicit:") and disagreement_targets.get(nid, 0) < 2:
            errors.append(f"structured disagreement node has fewer than two targets: {nid}")

    # Adversarial review must remain visible at issue level. A reviewed issue
    # cannot silently revert to unreviewed just because its child artifacts are
    # grandfathered Wave-A notes.
    reviewed_issues = {
        n.get("issue") for n in by_id.values()
        if n.get("type") == "review" and n.get("issue") is not None and n.get("review_status") != "unreviewed"
    }
    for issue in reviewed_issues:
        issue_node = by_id.get(f"issue:{issue}")
        if not issue_node:
            errors.append(f"review exists for issue {issue} but issue node is missing")
        elif issue_node.get("review_status") == "unreviewed":
            errors.append(f"reviewed issue {issue} lost review status")

    # Do not allow a review-clean override to mutate a law's truth state. The
    # graph may carry both fields, but acceptance remains outside this index.
    for node in by_id.values():
        if node.get("review_status") == "review-clean" and node.get("type") == "candidate-law":
            if node.get("epistemic_state") not in EPISTEMIC_STATES:
                errors.append(f"review state leaked into epistemic state for {node['id']}")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate OS research graph")
    parser.add_argument("graph")
    parser.add_argument("--source-root")
    parser.add_argument("--expected-snapshot")
    args = parser.parse_args()

    graph_path = Path(args.graph)
    graph = json.loads(graph_path.read_text(encoding="utf-8"))
    source_root = Path(args.source_root).resolve() if args.source_root else None
    errors = validate(graph, source_root, args.expected_snapshot)
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print(f"ok: {len(graph['nodes'])} nodes, {len(graph['edges'])} edges; snapshot={graph['snapshot']['commit']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
