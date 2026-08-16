#!/usr/bin/env python3
"""Build a lightweight machine-readable graph over OS research artifacts.

Human-readable Markdown remains authoritative evidence. This tool is an indexer:
it discovers artifacts/records, imports explicit research/index shards, attaches the
Wave-A adversarial review state, and emits a deterministic graph that synthesis
agents can query without pretending the graph is the ontology.

Stdlib-only by design.
"""

from __future__ import annotations

import argparse
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

SCHEMA_VERSION = 1
DEFAULT_SNAPSHOT_BRANCH = "research/wave-a-2026-08-16"
DEFAULT_SNAPSHOT_COMMIT = "53235fc5b8fb723e84351435ccfad719e784d5ba"

ISSUE_PATTERNS = [
    re.compile(r"(?mi)^issue:\s*['\"]?(\d+)"),
    re.compile(r"(?mi)^\s*[-*]?\s*\*\*Issue:\*\*\s*(?:\[[^]]+\]\([^)]*/issues/)?#?(\d+)"),
    re.compile(r"https://github\.com/EnzoTironi/OS/issues/(\d+)", re.I),
]
HEADING = re.compile(r"^(#{2,6})\s+([^\n]+)$", re.M)
STATE = re.compile(r"(?i)(?:decision(?:\s+state)?|epistemic_state)\s*[:=]\s*`?(hypothesis|supported|rejected|undetermined)`?")
RECORD_TOKEN = re.compile(r"\b((?:[A-Z]{1,8}(?:-[A-Z0-9]+)*)-\d{1,4})\b")
ISSUE_LINK = re.compile(r"(?:issues/|#)(\d{1,4})\b")

PREFIX_TYPE = {
    "E": "evidence",
    "EV": "evidence",
    "C": "concept",
    "I": "invariant",
    "INV": "invariant",
    "L": "candidate-law",
    "CL": "candidate-law",
    "LAW": "candidate-law",
    "X": "counterexample",
    "CE": "counterexample",
    "D": "disagreement",
    "R": "runtime-pressure",
    "S": "scenario",
    "SC": "scenario",
    "Q": "open-question",
    "FA": "historical-disposition",
}

REVIEW_ROW = re.compile(
    r"^\|\s*#(?P<pr>\d+)\s*\|\s*#(?P<issue>\d+)\s*\|(?P<topic>[^|]*)\|\s*`?(?P<status>raw-evidence-ok|challenged|blocked-factual|blocked-deliverable|review-clean)`?\s*\|(?P<finding>[^|]*)\|\s*$"
)


def slugify(text: str) -> str:
    out = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return out or "research"


def detect_issue(text: str) -> int | None:
    for pattern in ISSUE_PATTERNS:
        match = pattern.search(text)
        if match:
            return int(match.group(1))
    return None


def record_type(token: str) -> str | None:
    prefix = token.rsplit("-", 1)[0].split("-", 1)[0]
    return PREFIX_TYPE.get(prefix)


def section_ranges(text: str) -> Iterable[tuple[str, str, str]]:
    """Yield (heading_text, local_token, section_body) for record-like headings."""
    matches = list(HEADING.finditer(text))
    for index, match in enumerate(matches):
        heading_text = match.group(2).strip()
        token_match = RECORD_TOKEN.search(heading_text)
        if not token_match:
            continue
        token = token_match.group(1)
        if record_type(token) is None:
            continue
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        yield heading_text, token, text[match.end():end]


def merge_node(nodes: dict[str, dict[str, Any]], node: dict[str, Any]) -> None:
    current = nodes.get(node["id"])
    if current is None:
        nodes[node["id"]] = node
        return
    for key, value in node.items():
        if key == "topics":
            current[key] = sorted(set(current.get(key, [])) | set(value or []))
        elif current.get(key) in (None, "", [], "undetermined", "unreviewed") and value not in (None, "", []):
            current[key] = value


def add_edge(edges: set[tuple[str, str, str, str]], source: str, target: str, kind: str, note: str = "") -> None:
    if source and target and source != target:
        edges.add((source, target, kind, note.strip()))


def artifact_topics(path: Path) -> list[str]:
    parts = list(path.parts)
    if "research" in parts:
        parts = parts[parts.index("research") + 1 : -1]
    ignored = {"notes", "cards", "generated", "index"}
    return sorted({slugify(p) for p in parts if p not in ignored})


def ingest_markdown(root: Path, nodes: dict[str, dict[str, Any]], edges: set[tuple[str, str, str, str]]) -> None:
    research = root / "research"
    for path in sorted(research.rglob("*.md")):
        rel = path.relative_to(root).as_posix()
        text = path.read_text(encoding="utf-8", errors="replace")
        issue = detect_issue(text)
        title_match = re.search(r"(?m)^#\s+(.+)$", text)
        label = title_match.group(1).strip() if title_match else path.stem
        aid = f"artifact:{rel}"
        topics = artifact_topics(path.relative_to(root))
        merge_node(nodes, {
            "id": aid,
            "type": "artifact",
            "label": label,
            "issue": issue,
            "artifact": rel,
            "record": None,
            "topics": topics,
            "epistemic_state": None,
            "review_status": "unreviewed",
            "note": None,
        })
        if issue is not None:
            iid = f"issue:{issue}"
            merge_node(nodes, {"id": iid, "type": "issue", "label": f"Issue #{issue}", "issue": issue,
                               "artifact": None, "record": None, "topics": [], "epistemic_state": None,
                               "review_status": "unreviewed", "note": None})
            add_edge(edges, aid, iid, "investigates")

        local_records: dict[str, str] = {}
        sections: list[tuple[str, str, str, str]] = []
        for heading_text, token, body in section_ranges(text):
            rid = f"record:{rel}#{token}"
            rtype = record_type(token)
            state_match = STATE.search(body[:1200])
            state = state_match.group(1).lower() if state_match else None
            merge_node(nodes, {
                "id": rid,
                "type": rtype,
                "label": heading_text,
                "issue": issue,
                "artifact": rel,
                "record": token,
                "topics": topics,
                "epistemic_state": state,
                "review_status": "unreviewed",
                "note": None,
            })
            add_edge(edges, aid, rid, "contains")
            local_records[token] = rid
            sections.append((rid, token, rtype, body))

        # Local explicit record references become typed support/challenge links.
        for rid, token, rtype, body in sections:
            for referenced in sorted(set(RECORD_TOKEN.findall(body))):
                target = local_records.get(referenced)
                if not target or target == rid:
                    continue
                referenced_type = nodes[target]["type"]
                if rtype == "candidate-law" and referenced_type == "evidence":
                    add_edge(edges, target, rid, "supports")
                elif rtype == "candidate-law" and referenced_type == "counterexample":
                    add_edge(edges, target, rid, "challenges")
                elif rtype == "counterexample" and referenced_type == "candidate-law":
                    add_edge(edges, rid, target, "challenges")
                elif rtype == "disagreement":
                    add_edge(edges, rid, target, "disagrees-with")
                else:
                    add_edge(edges, rid, target, "related-to")

        # Cross-issue references are deliberately weak related-to edges.
        for linked_issue in sorted({int(x) for x in ISSUE_LINK.findall(text)}):
            if issue is not None and linked_issue == issue:
                continue
            target = f"issue:{linked_issue}"
            merge_node(nodes, {"id": target, "type": "issue", "label": f"Issue #{linked_issue}", "issue": linked_issue,
                               "artifact": None, "record": None, "topics": [], "epistemic_state": None,
                               "review_status": "unreviewed", "note": None})
            add_edge(edges, aid, target, "related-to")


def ingest_index_shards(root: Path, nodes: dict[str, dict[str, Any]], edges: set[tuple[str, str, str, str]]) -> None:
    index_dir = root / "research" / "index"
    if not index_dir.exists():
        return
    for path in sorted(index_dir.glob("*.json")):
        if path.name.startswith("_"):
            continue
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        version = doc.get("schema_version")
        for entry in doc.get("entries", []):
            artifact = entry.get("artifact")
            if not artifact:
                continue
            aid = f"artifact:{artifact}"
            issue = entry.get("issue")
            merge_node(nodes, {
                "id": aid,
                "type": "artifact",
                "label": entry.get("title") or artifact,
                "issue": issue,
                "artifact": artifact,
                "record": None,
                "topics": entry.get("topics", []),
                "epistemic_state": None,
                "review_status": entry.get("review_status", "unreviewed") if version == 2 else "unreviewed",
                "note": entry.get("question"),
            })
            if version == 2:
                for record in entry.get("records", []):
                    ref = record.get("ref")
                    rtype = record.get("kind")
                    if not ref or not rtype:
                        continue
                    rid = f"explicit:{ref}"
                    if rtype == "observation":
                        rtype = "evidence"
                    elif rtype == "review-finding":
                        rtype = "review"
                    merge_node(nodes, {
                        "id": rid,
                        "type": rtype,
                        "label": ref,
                        "issue": issue,
                        "artifact": artifact,
                        "record": ref.split("#")[-1] if "#" in ref else ref,
                        "topics": entry.get("topics", []),
                        "epistemic_state": record.get("epistemic_state"),
                        "review_status": entry.get("review_status", "unreviewed"),
                        "note": None,
                    })
                    add_edge(edges, aid, rid, "contains")
            elif version == 1:
                # Grandfathered v1 shards are locators only. Preserve their IDs
                # without pretending the artifact-level decision_states apply to
                # every contained record.
                legacy = {
                    "concepts": "concept",
                    "invariants": "invariant",
                    "candidate_laws": "candidate-law",
                    "counterexamples": "counterexample",
                    "runtime_consequences": "runtime-pressure",
                }
                for field, rtype in legacy.items():
                    for token in entry.get(field, []):
                        rid = f"explicit:{entry.get('artifact_id', artifact)}#{token}"
                        merge_node(nodes, {"id": rid, "type": rtype, "label": token, "issue": issue,
                                           "artifact": artifact, "record": token, "topics": entry.get("topics", []),
                                           "epistemic_state": None, "review_status": "unreviewed",
                                           "note": "grandfathered v1 index record"})
                        add_edge(edges, aid, rid, "contains")


def ingest_review_ledger(root: Path, nodes: dict[str, dict[str, Any]], edges: set[tuple[str, str, str, str]]) -> None:
    path = root / "research" / "reviews" / "wave-a-review-ledger.md"
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        match = REVIEW_ROW.match(line)
        if not match:
            continue
        pr = int(match.group("pr"))
        issue = int(match.group("issue"))
        status = match.group("status")
        finding = match.group("finding").strip()
        rid = f"review:wave-a:pr-{pr}"
        iid = f"issue:{issue}"
        merge_node(nodes, {"id": iid, "type": "issue", "label": f"Issue #{issue}", "issue": issue,
                           "artifact": None, "record": None, "topics": [], "epistemic_state": None,
                           "review_status": status, "note": finding})
        merge_node(nodes, {"id": rid, "type": "review", "label": f"Wave A adversarial review PR #{pr}",
                           "issue": issue, "artifact": path.relative_to(root).as_posix(), "record": None,
                           "topics": ["wave-a", "adversarial-review"], "epistemic_state": None,
                           "review_status": status, "note": finding})
        add_edge(edges, rid, iid, "reviews")


def apply_review_overrides(root: Path, nodes: dict[str, dict[str, Any]], edges: set[tuple[str, str, str, str]]) -> None:
    path = root / "research" / "graph" / "review-overrides.json"
    if not path.exists():
        return
    doc = json.loads(path.read_text(encoding="utf-8"))
    for issue_text, override in doc.get("issue_overrides", {}).items():
        issue = int(issue_text)
        iid = f"issue:{issue}"
        status = override["review_status"]
        note = override.get("note")
        merge_node(nodes, {"id": iid, "type": "issue", "label": f"Issue #{issue}", "issue": issue,
                           "artifact": None, "record": None, "topics": [], "epistemic_state": None,
                           "review_status": status, "note": note})
        nodes[iid]["review_status"] = status
        nodes[iid]["note"] = note
        review_id = f"review:override:issue-{issue}"
        merge_node(nodes, {"id": review_id, "type": "review", "label": f"Wave A resolution override issue #{issue}",
                           "issue": issue, "artifact": path.relative_to(root).as_posix(), "record": None,
                           "topics": ["wave-a", "review-resolution"], "epistemic_state": None,
                           "review_status": status, "note": note})
        add_edge(edges, review_id, iid, "supersedes", "supersedes earlier issue-level review status")
        # Issue-level review is inherited by artifacts/records for search/filtering,
        # but it never changes a record's epistemic state.
        for node in nodes.values():
            if node.get("issue") == issue and node["id"] != review_id:
                node["review_status"] = status


def validate_graph(graph: dict[str, Any], root: Path | None = None) -> list[str]:
    errors: list[str] = []
    ids: set[str] = set()
    for node in graph.get("nodes", []):
        nid = node.get("id")
        if not nid:
            errors.append("node without id")
            continue
        if nid in ids:
            errors.append(f"duplicate node id: {nid}")
        ids.add(nid)
        artifact = node.get("artifact")
        if root and artifact and node.get("type") != "issue":
            # Review/index records may point at JSON as well as Markdown.
            if not (root / artifact).exists():
                errors.append(f"missing artifact path for {nid}: {artifact}")
    for edge in graph.get("edges", []):
        if edge.get("source") not in ids:
            errors.append(f"dangling edge source: {edge}")
        if edge.get("target") not in ids:
            errors.append(f"dangling edge target: {edge}")
    return errors


def build(root: Path, snapshot_branch: str, snapshot_commit: str) -> dict[str, Any]:
    nodes: dict[str, dict[str, Any]] = {}
    edges: set[tuple[str, str, str, str]] = set()
    ingest_markdown(root, nodes, edges)
    ingest_index_shards(root, nodes, edges)
    ingest_review_ledger(root, nodes, edges)
    apply_review_overrides(root, nodes, edges)
    return {
        "schema_version": SCHEMA_VERSION,
        "snapshot": {"branch": snapshot_branch, "commit": snapshot_commit},
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "nodes": [nodes[key] for key in sorted(nodes)],
        "edges": [
            {"source": s, "target": t, "type": k, "note": note or None}
            for s, t, k, note in sorted(edges)
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build OS research graph")
    parser.add_argument("--root", default=None, help="repository root; defaults to three parents above this file")
    parser.add_argument("--out", default="research/graph/generated/wave-a-graph.json")
    parser.add_argument("--snapshot-branch", default=DEFAULT_SNAPSHOT_BRANCH)
    parser.add_argument("--snapshot-commit", default=DEFAULT_SNAPSHOT_COMMIT)
    parser.add_argument("--check", action="store_true", help="validate only; do not write output")
    args = parser.parse_args()

    root = Path(args.root).resolve() if args.root else Path(__file__).resolve().parents[2]
    graph = build(root, args.snapshot_branch, args.snapshot_commit)
    errors = validate_graph(graph, root)
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    if args.check:
        print(f"ok: {len(graph['nodes'])} nodes, {len(graph['edges'])} edges")
        return 0
    out = root / args.out
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(graph, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"wrote {out}: {len(graph['nodes'])} nodes, {len(graph['edges'])} edges")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
