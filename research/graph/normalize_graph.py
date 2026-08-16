#!/usr/bin/env python3
"""Normalize a generated research graph without changing primary evidence.

This pass exists because Wave A contains grandfathered v1 index shards and an
issue-level adversarial review ledger. It propagates issue review status to the
records/artifacts that synthesis will filter and materializes v1 disagreement
records/edges that the original shards already declared.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def merge_node(nodes: dict[str, dict[str, Any]], node: dict[str, Any]) -> None:
    if node["id"] not in nodes:
        nodes[node["id"]] = node


def add_edge(edges: list[dict[str, Any]], seen: set[tuple[str, str, str]], source: str, target: str, kind: str, note: str | None = None) -> None:
    key = (source, target, kind)
    if source == target or key in seen:
        return
    seen.add(key)
    edges.append({"source": source, "target": target, "type": kind, "note": note})


def explicit_ref_to_node(ref: str, artifact_id: str, artifact_path: str, existing: dict[str, dict[str, Any]]) -> str:
    # Prefer any already-indexed explicit node, then a Markdown record node,
    # otherwise create a conservative concept/evidence locator.
    direct = f"explicit:{ref}"
    if direct in existing:
        return direct
    local = ref.split("#")[-1]
    markdown = f"record:{artifact_path}#{local}"
    if markdown in existing:
        return markdown
    legacy = f"explicit:{artifact_id}#{local}"
    if legacy in existing:
        return legacy
    return legacy


def main() -> int:
    parser = argparse.ArgumentParser(description="Normalize OS research graph")
    parser.add_argument("graph")
    parser.add_argument("--source-root", required=True)
    args = parser.parse_args()

    graph_path = Path(args.graph)
    root = Path(args.source_root)
    graph = json.loads(graph_path.read_text(encoding="utf-8"))
    nodes = {node["id"]: node for node in graph["nodes"]}
    edges = list(graph["edges"])
    seen = {(e["source"], e["target"], e["type"]) for e in edges}

    # Propagate adversarial review status from issue-level review to its
    # artifacts/records. This changes review metadata only, never epistemic state.
    issue_status = {
        node["issue"]: node.get("review_status")
        for node in nodes.values()
        if node.get("type") == "issue" and node.get("issue") is not None and node.get("review_status") not in (None, "unreviewed")
    }
    for node in nodes.values():
        issue = node.get("issue")
        if issue in issue_status and node.get("review_status") in (None, "unreviewed"):
            node["review_status"] = issue_status[issue]

    # Grandfathered v1 index shards already contain disagreement structures.
    # Preserve them rather than forcing authors to rewrite Wave A to schema v2.
    index_dir = root / "research" / "index"
    if index_dir.exists():
        for path in sorted(index_dir.glob("*.json")):
            if path.name.startswith("_"):
                continue
            try:
                doc = json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                continue
            if doc.get("schema_version") != 1:
                continue
            for entry in doc.get("entries", []):
                artifact_id = entry.get("artifact_id") or path.stem
                artifact_path = entry.get("artifact")
                issue = entry.get("issue")
                if not artifact_path:
                    continue
                for disagreement in entry.get("disagreements", []):
                    did = disagreement.get("id")
                    targets = disagreement.get("targets", [])
                    if not did or len(targets) < 2:
                        continue
                    nid = f"explicit:{artifact_id}#{did}"
                    merge_node(nodes, {
                        "id": nid,
                        "type": "disagreement",
                        "label": did,
                        "issue": issue,
                        "artifact": artifact_path,
                        "record": did,
                        "topics": entry.get("topics", []),
                        "epistemic_state": "undetermined" if disagreement.get("status") == "open" else None,
                        "review_status": issue_status.get(issue, "unreviewed"),
                        "note": f"grandfathered v1 disagreement status={disagreement.get('status', 'unknown')}",
                    })
                    for target_ref in targets:
                        target = explicit_ref_to_node(target_ref, artifact_id, artifact_path, nodes)
                        if target not in nodes:
                            local = target_ref.split("#")[-1]
                            merge_node(nodes, {
                                "id": target,
                                "type": "concept" if not local.startswith("E-") else "evidence",
                                "label": target_ref,
                                "issue": issue,
                                "artifact": artifact_path,
                                "record": local,
                                "topics": entry.get("topics", []),
                                "epistemic_state": None,
                                "review_status": issue_status.get(issue, "unreviewed"),
                                "note": "locator synthesized from grandfathered disagreement target",
                            })
                        add_edge(edges, seen, nid, target, "disagrees-with")

    graph["nodes"] = [nodes[key] for key in sorted(nodes)]
    graph["edges"] = sorted(edges, key=lambda e: (e["source"], e["target"], e["type"], e.get("note") or ""))
    graph_path.write_text(json.dumps(graph, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"normalized {graph_path}: {len(graph['nodes'])} nodes, {len(graph['edges'])} edges")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
