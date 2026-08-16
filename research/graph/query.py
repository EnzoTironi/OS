#!/usr/bin/env python3
"""Small query CLI for the generated OS research graph."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def node_index(graph: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {node["id"]: node for node in graph["nodes"]}


def print_node(node: dict[str, Any]) -> None:
    compact = {k: v for k, v in node.items() if v not in (None, [], "")}
    print(json.dumps(compact, ensure_ascii=False, sort_keys=True))


def main() -> int:
    parser = argparse.ArgumentParser(description="Query OS research graph")
    parser.add_argument("--graph", default="research/graph/generated/wave-a-graph.json")
    sub = parser.add_subparsers(dest="command", required=True)

    p_nodes = sub.add_parser("nodes", help="filter graph nodes")
    p_nodes.add_argument("--type")
    p_nodes.add_argument("--topic")
    p_nodes.add_argument("--review-status")
    p_nodes.add_argument("--epistemic-state")
    p_nodes.add_argument("--issue", type=int)

    p_search = sub.add_parser("search", help="substring search label/note/topics")
    p_search.add_argument("text")

    p_why = sub.add_parser("why", help="show a node and its incoming/outgoing evidence graph")
    p_why.add_argument("id")

    p_pressure = sub.add_parser("pressure", help="find candidate laws/concepts/runtime pressure matching text plus support/challenge edges")
    p_pressure.add_argument("text")

    p_review = sub.add_parser("reviews", help="list issue/artifact nodes by adversarial review status")
    p_review.add_argument("status", choices=["unreviewed", "raw-evidence-ok", "challenged", "blocked-factual", "blocked-deliverable", "review-clean"])

    args = parser.parse_args()
    graph_path = Path(args.graph)
    graph = load(graph_path)
    nodes = node_index(graph)

    if args.command == "nodes":
        for node in graph["nodes"]:
            if args.type and node["type"] != args.type:
                continue
            if args.topic and args.topic not in node.get("topics", []):
                continue
            if args.review_status and node.get("review_status") != args.review_status:
                continue
            if args.epistemic_state and node.get("epistemic_state") != args.epistemic_state:
                continue
            if args.issue is not None and node.get("issue") != args.issue:
                continue
            print_node(node)
        return 0

    if args.command == "search":
        needle = args.text.lower()
        for node in graph["nodes"]:
            haystack = " ".join([
                node.get("label") or "",
                node.get("note") or "",
                " ".join(node.get("topics", [])),
                node.get("record") or "",
            ]).lower()
            if needle in haystack:
                print_node(node)
        return 0

    if args.command == "reviews":
        for node in graph["nodes"]:
            if node.get("review_status") == args.status and node["type"] in {"issue", "artifact", "review"}:
                print_node(node)
        return 0

    if args.command == "why":
        if args.id not in nodes:
            raise SystemExit(f"unknown node: {args.id}")
        print("NODE")
        print_node(nodes[args.id])
        print("EDGES")
        for edge in graph["edges"]:
            if edge["source"] == args.id or edge["target"] == args.id:
                other = edge["target"] if edge["source"] == args.id else edge["source"]
                print(json.dumps({"edge": edge, "other": nodes.get(other)}, ensure_ascii=False, sort_keys=True))
        return 0

    if args.command == "pressure":
        needle = args.text.lower()
        matches = {
            node["id"] for node in graph["nodes"]
            if node["type"] in {"candidate-law", "concept", "invariant", "runtime-pressure", "disagreement"}
            and needle in " ".join([node.get("label") or "", node.get("note") or "", " ".join(node.get("topics", []))]).lower()
        }
        for nid in sorted(matches):
            print("NODE")
            print_node(nodes[nid])
            for edge in graph["edges"]:
                if edge["source"] == nid or edge["target"] == nid:
                    if edge["type"] in {"supports", "challenges", "falsifies", "disagrees-with", "reviews", "requires", "observed-in"}:
                        other = edge["target"] if edge["source"] == nid else edge["source"]
                        print(json.dumps({"edge": edge, "other": nodes.get(other)}, ensure_ascii=False, sort_keys=True))
        return 0

    return 2


if __name__ == "__main__":
    raise SystemExit(main())
