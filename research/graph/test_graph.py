#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


builder = load_module("build_graph", HERE / "build_graph.py")
normalizer = load_module("normalize_graph", HERE / "normalize_graph.py")
validator = load_module("validate_graph", HERE / "validate_graph.py")


class GraphTests(unittest.TestCase):
    def fixture(self) -> Path:
        tmp = Path(tempfile.mkdtemp(prefix="os-graph-test-"))
        (tmp / "research" / "foundation" / "demo").mkdir(parents=True)
        (tmp / "research" / "reviews").mkdir(parents=True)
        (tmp / "research" / "graph").mkdir(parents=True)
        (tmp / "research" / "index").mkdir(parents=True)

        (tmp / "research" / "foundation" / "demo" / "README.md").write_text(
            """# Demo research\n\n**Issue:** #7\n\n## E-001 source observation\n\n- Decision state: `supported`\n\nObserved source behavior.\n\n## L-001 candidate law\n\n- Decision state: `hypothesis`\n\nEvidence: E-001.\n\n## X-001 counterexample\n\n- Decision state: `hypothesis`\n\nTargets L-001.\n\n## D-001 disagreement\n\n- Decision state: `undetermined`\n\nL-001 and X-001 remain in tension.\n""",
            encoding="utf-8",
        )
        (tmp / "research" / "reviews" / "wave-a-review-ledger.md").write_text(
            "| #90 | #7 | action/event | `challenged` | Candidate law is too broad. |\n",
            encoding="utf-8",
        )
        (tmp / "research" / "graph" / "review-overrides.json").write_text(
            json.dumps({
                "schema_version": 1,
                "snapshot_commit": "a" * 40,
                "issue_overrides": {
                    "7": {"review_status": "review-clean", "note": "scope was corrected"}
                },
            }),
            encoding="utf-8",
        )
        # v1 shard exercises grandfathered disagreement ingestion.
        (tmp / "research" / "index" / "issue-0007-demo.json").write_text(
            json.dumps({
                "$schema": "../schema/research-index.schema.json",
                "schema_version": 1,
                "entries": [{
                    "artifact_id": "issue-0007-demo",
                    "artifact": "research/foundation/demo/README.md",
                    "issue": 7,
                    "title": "Demo research",
                    "question": "Can a candidate law survive?",
                    "topics": ["demo"],
                    "source_keys": ["demo-source"],
                    "evidence_grades": ["official-doc"],
                    "decision_states": ["hypothesis", "supported", "undetermined"],
                    "concepts": [],
                    "invariants": [],
                    "candidate_laws": ["L-001"],
                    "counterexamples": ["X-001"],
                    "runtime_consequences": [],
                    "disagreements": [{
                        "id": "D-001",
                        "targets": ["issue-0007-demo#L-001", "issue-0007-demo#X-001"],
                        "status": "open",
                    }],
                    "depends_on": [],
                    "related_issues": [7],
                }],
            }),
            encoding="utf-8",
        )
        return tmp

    def normalized(self, root: Path) -> dict:
        graph = builder.build(root, "test-wave", "a" * 40)
        graph_path = root / "graph.json"
        graph_path.write_text(json.dumps(graph), encoding="utf-8")

        # Reuse the normalizer's main logic through a temporary argv rather than
        # duplicating production code.
        import sys
        old = sys.argv
        try:
            sys.argv = ["normalize_graph.py", str(graph_path), "--source-root", str(root)]
            self.assertEqual(normalizer.main(), 0)
        finally:
            sys.argv = old
        return json.loads(graph_path.read_text(encoding="utf-8"))

    def test_support_and_challenge_edges_are_extracted(self):
        root = self.fixture()
        graph = self.normalized(root)
        edges = {(e["source"], e["target"], e["type"]) for e in graph["edges"]}
        self.assertIn((
            "record:research/foundation/demo/README.md#E-001",
            "record:research/foundation/demo/README.md#L-001",
            "supports",
        ), edges)
        self.assertIn((
            "record:research/foundation/demo/README.md#X-001",
            "record:research/foundation/demo/README.md#L-001",
            "challenges",
        ), edges)

    def test_v1_disagreement_has_two_targets(self):
        root = self.fixture()
        graph = self.normalized(root)
        disagreement = "explicit:issue-0007-demo#D-001"
        targets = [e for e in graph["edges"] if e["source"] == disagreement and e["type"] == "disagrees-with"]
        self.assertEqual(len(targets), 2)

    def test_review_override_does_not_change_law_truth_state(self):
        root = self.fixture()
        graph = self.normalized(root)
        nodes = {n["id"]: n for n in graph["nodes"]}
        law = nodes["record:research/foundation/demo/README.md#L-001"]
        self.assertEqual(law["review_status"], "review-clean")
        self.assertEqual(law["epistemic_state"], "hypothesis")
        self.assertEqual(nodes["issue:7"]["review_status"], "review-clean")

    def test_validator_accepts_normalized_fixture(self):
        root = self.fixture()
        graph = self.normalized(root)
        errors = validator.validate(graph, root, "a" * 40)
        self.assertEqual(errors, [])


if __name__ == "__main__":
    unittest.main()
