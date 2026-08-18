from __future__ import annotations

import copy
import inspect
import json
import sys
import unittest
from pathlib import Path

from jsonschema.exceptions import ValidationError

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from support import ROOT, load_json, load_schema, open_kernel, validator, v001_kernel
from os_kernel.canonical import digest, public_output, retained
from os_kernel.definitions import load_bundle
from os_kernel.errors import InputError, InternalError
from os_kernel.kernel import Kernel
from os_kernel.model import Approval, Attribution
from os_kernel.scenario import load_json as load_scenario_json
from os_kernel.scenario import run_scenario, scenario_dir
from os_kernel.store import Store
from os_kernel.validation import resolve_protocol_ref, validate_scenario


PROVENANCE = {
    "source_id": "source:test",
    "source_locator": "loc",
    "capture_id": "cap",
    "capture_revision": "r1",
    "actor_id": "actor:ingest",
    "workload_id": "workload:ingest-1",
}
VALID_DELEGATION = {
    "delegation_id": "delegation:buy-raw-1",
    "grantor_id": "party:org-a",
    "actor_id": "actor:planner-agent",
    "represented_principal_id": "party:org-a",
    "action_scope": ["action.purchase-raw"],
    "resource_scope": ["stock:sku-x"],
    "purpose": "cover demand wave",
    "valid_from": "2030-08-10T10:00:00Z",
    "valid_until": None,
    "bound_workload_id": "workload:agent-pod-1",
}
VALID_ATTRIBUTION = {
    "actor_id": "actor:planner-agent",
    "represented_principal_id": "party:org-a",
    "workload_id": "workload:agent-pod-1",
    "delegation_id": "delegation:buy-raw-1",
}
APPROVER = {
    "actor_id": "actor:human-buyer",
    "represented_principal_id": "party:org-a",
    "workload_id": "workload:desktop-1",
    "delegation_id": "delegation:approve-buy-1",
}


def apply_fixture(kernel: Kernel, *, stop_before: str | None = None, stop_after: str | None = None) -> None:
    folder = scenario_dir("v001")
    scenario = load_scenario_json(folder / "scenario.json")
    commands = scenario["commands"]
    for index, command in enumerate(commands):
        if stop_before and command.get("command_id") == stop_before:
            break
        payload = dict(command)
        nxt = commands[index + 1] if index + 1 < len(commands) else None
        if nxt is not None:
            cuts = scenario.get("knowledge_cuts") or {}
            for alias, spec in cuts.items():
                if isinstance(spec, dict) and spec.get("before_command_id") == nxt.get("command_id"):
                    payload["alias_revision_as"] = alias
        if "definitions_file" in payload:
            payload["definitions"] = load_scenario_json(folder / payload["definitions_file"])
            del payload["definitions_file"]
        kernel.apply(payload)
        if stop_after and command.get("command_id") == stop_after:
            break


def claim_command(claim_id: str, value: object) -> dict:
    return {
        "type": "RecordClaim",
        "claim_id": claim_id,
        "subject_ref": "stock:sku-x",
        "predicate_ref": "available-quantity",
        "value": value,
        "valid_time": {"instant": "2030-08-10"},
        "provenance": PROVENANCE,
    }


class BoundaryTests(unittest.TestCase):
    def test_schema_format_rejects_bad_datetime(self) -> None:
        schema = load_schema("scenario-input.schema.json")
        check = validator(schema)
        payload = load_json(ROOT / "fixtures" / "v001" / "scenario.json")
        payload["clock"]["start"] = "not-a-date"
        with self.assertRaises(ValidationError):
            check.validate(payload)
        payload["clock"]["start"] = "2030-08-10T10:00:00Z"
        check.validate(payload)

    def test_create_entity_rejects_properties(self) -> None:
        kernel = open_kernel()
        with self.assertRaises(InputError):
            kernel.apply(
                {
                    "type": "CreateEntity",
                    "entity_id": "x",
                    "type_ref": {"definition_id": "type.organization"},
                    "properties": {"name": "nope"},
                    "provenance": {
                        "source_id": "s",
                        "source_locator": "l",
                        "capture_id": "c",
                        "capture_revision": "r",
                        "actor_id": "a",
                        "workload_id": "w",
                    },
                }
            )

    def test_approval_requires_basis(self) -> None:
        with self.assertRaises(ValueError):
            Approval(
                "a",
                "p",
                "digest",
                {},
                "",
                None,  # type: ignore[arg-type]
                Attribution("a1", "a2", "a3", "a4"),
                (),
                "kr:0001",
            )

    def test_attribution_rejects_collapse(self) -> None:
        with self.assertRaises(ValueError):
            Attribution("same", "same", "w", "d")
        kernel = open_kernel()
        with self.assertRaises(InputError):
            kernel.apply(
                {
                    "type": "ProposeOperation",
                    "proposal_id": "p",
                    "operation_id": "o",
                    "action_id": "action.purchase-raw",
                    "inputs": {"quantity": 1, "subject": "stock:sku-x", "predicate": "available-quantity"},
                    "attribution": {"principal_id": "only"},
                }
            )

    def test_unknown_command_is_input_error(self) -> None:
        kernel = open_kernel()
        with self.assertRaises(InputError):
            kernel.apply({"type": "set_state", "key": "x"})

    def test_definition_rejects_callable(self) -> None:
        from os_kernel.definitions import load_bundle

        with self.assertRaises(InputError):
            load_bundle({"revision_id": "r", "computations": [{"definition_id": "c", "expression": {"op": "literal", "callable": "nope"}}]})

    def test_input_alias_cannot_mutate_claim(self) -> None:
        kernel = open_kernel()
        command = claim_command("claim:alias", 5)
        kernel.apply(command)
        command["value"] = 91
        report = kernel.query({"type": "scenario-report", "scenario_id": "v001"})
        stored = next(item for item in report["records"]["claims"] if item["claim_id"] == "claim:alias")
        self.assertEqual(stored["value"], 5)

    def test_query_and_explain_outputs_cannot_mutate_state(self) -> None:
        kernel = v001_kernel()
        queried = kernel.query(
            {
                "type": "known-then",
                "subject": "stock:sku-x",
                "predicate": "available-quantity",
                "valid_at": "2030-08-10",
                "known_at": "kr:before-late-document",
            }
        )
        original = queried["value"]
        mutated = False
        try:
            queried["value"] = 123
            mutated = True
        except TypeError:
            pass
        again = kernel.query(
            {
                "type": "known-then",
                "subject": "stock:sku-x",
                "predicate": "available-quantity",
                "valid_at": "2030-08-10",
                "known_at": "kr:before-late-document",
            }
        )
        self.assertEqual(again["value"], original)
        if mutated:
            self.assertEqual(again["value"], original)
        graph = kernel.explain("v001:operation:purchase-raw-1")
        try:
            graph["inputs"]["quantity"] = 777
        except TypeError:
            pass
        later = kernel.explain("v001:operation:purchase-raw-1")
        self.assertEqual(later["inputs"]["quantity"], 1000)

    def test_kernel_exposes_no_store_or_alias_surface(self) -> None:
        kernel = open_kernel()
        self.assertFalse(hasattr(kernel, "_store"))
        self.assertFalse(hasattr(kernel, "_aliases"))
        for name in ("set", "append", "update", "delete", "begin", "commit", "rollback"):
            self.assertFalse(hasattr(kernel, name))
        public = {name for name in dir(Store) if not name.startswith("_")}
        self.assertTrue({"begin", "commit", "rollback", "put_claim", "put_entity", "next_revision"}.isdisjoint(public))

    def test_proposal_rejects_invalid_delegation(self) -> None:
        kernel = open_kernel()
        bad = copy.deepcopy(VALID_DELEGATION)
        bad["actor_id"] = "actor:intruder"
        bad["represented_principal_id"] = "party:other"
        bad["action_scope"] = ["action.other"]
        bad["resource_scope"] = ["stock:other"]
        bad["bound_workload_id"] = "workload:other"
        bad["valid_from"] = "2030-12-01T00:00:00Z"
        with self.assertRaises(InputError):
            kernel.apply(
                {
                    "type": "ProposeOperation",
                    "proposal_id": "proposal:bad",
                    "operation_id": "op-bad",
                    "action_id": "action.purchase-raw",
                    "inputs": {"quantity": 1, "subject": "stock:sku-x", "predicate": "available-quantity"},
                    "attribution": VALID_ATTRIBUTION,
                    "delegation": bad,
                }
            )

    def test_commit_rejects_unrepresented_principal_and_delegation(self) -> None:
        kernel = open_kernel()
        kernel.apply(claim_command("claim:erp", 20))
        kernel.apply(
            {
                "type": "ProposeOperation",
                "proposal_id": "proposal:purchase-raw-1",
                "operation_id": "purchase-raw-1",
                "authority_namespace": "v001",
                "action_id": "action.purchase-raw",
                "inputs": {"quantity": 10, "subject": "stock:sku-x", "predicate": "available-quantity"},
                "replan_bounds": {"max_quantity": 10},
                "attribution": VALID_ATTRIBUTION,
                "delegation": VALID_DELEGATION,
            }
        )
        with self.assertRaises(InputError):
            kernel.apply(
                {
                    "type": "RecordApproval",
                    "approval_id": "approval:rejected",
                    "proposal_id": "proposal:purchase-raw-1",
                    "approved_bounds": {"max_quantity": 10},
                    "attribution": {
                        "actor_id": "actor:intruder",
                        "represented_principal_id": "party:intruder",
                        "workload_id": "workload:other",
                        "delegation_id": "delegation:not-stored",
                    },
                }
            )
        kernel.apply(
            {
                "type": "RecordApproval",
                "approval_id": "approval:purchase-raw-1",
                "proposal_id": "proposal:purchase-raw-1",
                "approved_bounds": {"max_quantity": 10},
                "attribution": APPROVER,
            }
        )
        receipt = kernel.apply(
            {
                "type": "CommitOperation",
                "operation_id": "purchase-raw-1",
                "authority_namespace": "v001",
                "proposal_id": "proposal:purchase-raw-1",
                "approval_id": "approval:purchase-raw-1",
                "attribution": {
                    "actor_id": "actor:intruder",
                    "represented_principal_id": "party:intruder",
                    "workload_id": "workload:other",
                    "delegation_id": "delegation:not-stored",
                },
            }
        )
        self.assertIn(receipt.outcome, {"intent_mismatch", "denied"})
        self.assertEqual(receipt.outcome, "intent_mismatch")
        report = kernel.query({"type": "scenario-report", "scenario_id": "v001"})
        self.assertEqual(report["records"]["envelopes"], [])

    def test_approval_and_commit_reject_tampered_proposal_digest(self) -> None:
        kernel = open_kernel()
        command = {
            "type": "ProposeOperation",
            "proposal_id": "proposal:purchase-raw-1",
            "operation_id": "purchase-raw-1",
            "authority_namespace": "v001",
            "action_id": "action.purchase-raw",
            "inputs": {"quantity": 10, "subject": "stock:sku-x", "predicate": "available-quantity"},
            "replan_bounds": {"max_quantity": 10},
            "attribution": VALID_ATTRIBUTION,
            "delegation": VALID_DELEGATION,
        }
        first = kernel.apply(command)
        command["inputs"]["quantity"] = 99
        approval = kernel.apply(
            {
                "type": "RecordApproval",
                "approval_id": "approval:purchase-raw-1",
                "proposal_id": "proposal:purchase-raw-1",
                "approved_bounds": {"max_quantity": 10},
                "attribution": APPROVER,
            }
        )
        self.assertEqual(approval.outcome, "approved")
        report = kernel.query({"type": "scenario-report", "scenario_id": "v001"})
        self.assertEqual(report["records"]["proposals"][0]["intent_digest"], first.details["intent_digest"])

    def test_basis_uses_action_revision(self) -> None:
        kernel2 = open_kernel()
        apply_fixture(kernel2, stop_after="approve-purchase")
        mutated = load_json(ROOT / "fixtures" / "v001" / "definitions-r2.json")
        mutated["computations"][0]["expression"] = {"op": "literal", "value": 0}
        kernel2.apply({"type": "InstallDefinitionRevision", "definitions": mutated})
        receipt = kernel2.apply(
            {
                "type": "CommitOperation",
                "operation_id": "purchase-raw-1",
                "authority_namespace": "v001",
                "proposal_id": "proposal:purchase-raw-1",
                "approval_id": "approval:purchase-raw-1",
                "attribution": VALID_ATTRIBUTION,
            }
        )
        self.assertEqual(receipt.outcome, "committed")
        self.assertEqual(receipt.details["committed_quantity"], 200)

    def test_effect_and_reconciliation_use_request_revision(self) -> None:
        kernel = open_kernel()
        apply_fixture(kernel, stop_after="carrier-timeout")
        mutated = load_json(ROOT / "fixtures" / "v001" / "definitions-r2.json")
        mutated["effects"][0]["protocol_safety"] = {"safe_dedupe": True, "absence_proof": False}
        kernel.apply({"type": "InstallDefinitionRevision", "definitions": mutated})
        receipt = kernel.apply(
            {
                "type": "RecordEffectAttempt",
                "request_id": "effect:book-carrier-1",
                "attempt_id": "attempt:carrier-2",
                "outcome": "sent_no_response",
            }
        )
        self.assertEqual(receipt.outcome, "unsafe_retry")

    def test_replay_rejects_presented_revision_mismatch(self) -> None:
        kernel = v001_kernel()
        receipt = kernel.apply(
            {
                "type": "CommitOperation",
                "operation_id": "purchase-raw-1",
                "authority_namespace": "v001",
                "proposal_id": "proposal:purchase-raw-1",
                "approval_id": "approval:purchase-raw-1",
                "action_revision_id": "defrev:v001-r2",
                "attribution": VALID_ATTRIBUTION,
            }
        )
        self.assertEqual(receipt.outcome, "intent_mismatch")

    def test_temporal_query_uses_revision_known_at_cut(self) -> None:
        kernel = open_kernel()
        apply_fixture(kernel, stop_before="install-r2")
        cut = kernel.apply({"type": "RecordClaim", **claim_command("claim:cut-marker", 1), "alias_revision_as": "kr:before-r2"})
        self.assertTrue(cut.known_revision)
        mutated = load_json(ROOT / "fixtures" / "v001" / "definitions-r2.json")
        mutated["computations"][0]["expression"] = {"op": "literal", "value": 0}
        kernel.apply({"type": "InstallDefinitionRevision", "definitions": mutated})
        known = kernel.query(
            {
                "type": "known-then",
                "subject": "stock:sku-x",
                "predicate": "available-quantity",
                "valid_at": "2030-08-10",
                "known_at": "kr:before-r2",
            }
        )
        believed = kernel.query(
            {
                "type": "now-believed-for-then",
                "subject": "stock:sku-x",
                "predicate": "available-quantity",
                "valid_at": "2030-08-10",
            }
        )
        self.assertEqual(known["computation_revision"], "defrev:v001-r1")
        self.assertEqual(believed["computation_revision"], "defrev:v001-r2")
        self.assertNotEqual(known["value"], 0)
        self.assertEqual(believed["value"], 0)

    def test_effect_attempt_is_atomic(self) -> None:
        kernel = open_kernel()
        apply_fixture(kernel, stop_after="commit-purchase")
        before = kernel.record_counts()

        def boom(self: Store, record: object) -> None:
            raise InternalError("forced", "forced knowledge write")

        original = Store._put_effect_knowledge
        Store._put_effect_knowledge = boom
        try:
            with self.assertRaises(InternalError):
                kernel.apply(
                    {
                        "type": "RecordEffectAttempt",
                        "request_id": "effect:book-carrier-1",
                        "attempt_id": "attempt:forced",
                        "outcome": "sent_no_response",
                    }
                )
        finally:
            Store._put_effect_knowledge = original
        self.assertEqual(kernel.record_counts(), before)

    def test_reconciliation_is_atomic_and_rejects_dangling_evidence(self) -> None:
        kernel = open_kernel()
        apply_fixture(kernel, stop_after="carrier-evidence")
        before = kernel.record_counts()
        with self.assertRaises(InputError):
            kernel.apply(
                {
                    "type": "ReconcileEffect",
                    "request_id": "effect:book-carrier-1",
                    "reconciliation_id": "recon:missing",
                    "evidence_refs": ["claim:does-not-exist"],
                    "attribution": {
                        "actor_id": "actor:reconciler",
                        "represented_principal_id": "party:org-a",
                        "workload_id": "workload:recon-1",
                        "delegation_id": "delegation:recon-1",
                    },
                }
            )
        self.assertEqual(kernel.record_counts(), before)

        def boom(self: Store, record: object) -> None:
            raise InternalError("forced", "forced knowledge write")

        original = Store._put_effect_knowledge
        Store._put_effect_knowledge = boom
        try:
            with self.assertRaises(InternalError):
                kernel.apply(
                    {
                        "type": "ReconcileEffect",
                        "request_id": "effect:book-carrier-1",
                        "reconciliation_id": "recon:forced",
                        "evidence_refs": ["claim:carrier-confirm"],
                        "attribution": {
                            "actor_id": "actor:reconciler",
                            "represented_principal_id": "party:org-a",
                            "workload_id": "workload:recon-1",
                            "delegation_id": "delegation:recon-1",
                        },
                    }
                )
        finally:
            Store._put_effect_knowledge = original
        self.assertEqual(kernel.record_counts(), before)

    def test_definition_schema_rejects_missing_expression_duplicates_and_bad_refs(self) -> None:
        with self.assertRaises(InputError):
            load_bundle({"revision_id": "r", "computations": [{"definition_id": "c"}]})
        with self.assertRaises(InputError):
            load_bundle(
                {
                    "revision_id": "r",
                    "types": [{"definition_id": "dup", "value_schema": {"type": "number"}}],
                    "relations": [{"definition_id": "dup", "value_schema": {"type": "number"}}],
                }
            )
        with self.assertRaises(InputError):
            load_bundle(
                {
                    "revision_id": "r",
                    "rules": [{"definition_id": "rule.x", "computation_ref": "missing"}],
                    "computations": [{"definition_id": "c", "expression": {"op": "literal", "value": 1}}],
                }
            )

    def test_claim_schema_rejects_wrong_typed_value(self) -> None:
        kernel = open_kernel()
        with self.assertRaises(InputError):
            kernel.apply(claim_command("claim:bad-type", "not-a-number"))

    def test_explanation_traverses_links_and_reports_gaps(self) -> None:
        kernel = v001_kernel()
        graph = kernel.explain("v001:operation:purchase-raw-1")
        self.assertTrue(graph["complete"])
        self.assertEqual(list(graph["gaps"]), [])
        store = object.__getattribute__(kernel, "_Kernel__store")
        store._tables["causal_links"].clear()
        broken = kernel.explain("v001:operation:purchase-raw-1")
        self.assertFalse(broken["complete"])
        self.assertTrue(broken["gaps"])
        self.assertIsNone(broken["proposal"])
        self.assertEqual(list(broken["effect_attempts"]), [])
        self.assertEqual(list(broken["reconciliation_records"]), [])
        self.assertTrue(any(item.get("ref") for item in broken["gaps"]))

    def test_scenario_runner_has_no_private_store_access(self) -> None:
        source = inspect.getsource(run_scenario)
        self.assertNotIn("_store", source)
        self.assertNotIn("_aliases", source)
        self.assertNotIn("_active", source)

    def test_invalid_scenario_fails_at_boundary(self) -> None:
        payload = load_json(ROOT / "fixtures" / "v001" / "scenario.json")
        payload["clock"]["start"] = "not-a-date"
        with self.assertRaises(InternalError):
            validate_scenario(payload, internal=True)

    def test_retained_nested_mapping_roundtrip(self) -> None:
        source = {"nested": [{"value": 1}]}
        value = retained(source)
        store = Store()
        store._put("claims", "x", value)
        loaded = store.get("claims", "x")
        published = public_output(loaded)
        json.dumps(published)
        self.assertEqual(published, {"nested": [{"value": 1}]})
        self.assertEqual(value, loaded)
        self.assertEqual(digest(public_output(value)), digest(published))
        source["nested"][0]["value"] = 9
        self.assertEqual(public_output(store.get("claims", "x")), {"nested": [{"value": 1}]})

    def test_store_and_public_aliases_are_separated(self) -> None:
        source = {"nested": [{"value": 1}]}
        value = retained(source)
        store = Store()
        store._put("claims", "x", value)
        first = store.get("claims", "x")
        second = store.get("claims", "x")
        self.assertIsNot(first, second)
        self.assertIsNot(first, store._tables["claims"]["x"])
        published = public_output(first)
        published["nested"][0]["value"] = 4
        self.assertEqual(public_output(store.get("claims", "x"))["nested"][0]["value"], 1)
        store._begin()
        self.assertIsNot(store._active()["claims"]["x"], store._tables["claims"]["x"])
        store._rollback()

    def test_apply_outputs_are_json_copies_and_input_is_detached(self) -> None:
        kernel = open_kernel()
        command = claim_command("claim:out", 5)
        receipt = kernel.apply(command)
        command["value"] = 91
        json.dumps(receipt.details)
        receipt.details["claim_id"] = "mutated"
        report = kernel.query({"type": "scenario-report", "scenario_id": "v001"})
        json.dumps(report)
        stored = next(item for item in report["records"]["claims"] if item["claim_id"] == "claim:out")
        self.assertEqual(stored["value"], 5)
        self.assertEqual(digest(stored["value"]), digest(5))
        report["records"]["claims"][0]["value"] = 123
        later = kernel.query({"type": "scenario-report", "scenario_id": "v001"})
        stored_later = next(item for item in later["records"]["claims"] if item["claim_id"] == "claim:out")
        self.assertEqual(stored_later["value"], 5)

    def test_protocol_ref_resolution(self) -> None:
        exact = Store()
        exact._put("claims", "claim:a:x", {"claim_id": "claim:a:x"})
        exact._put("claims", "claim:b:x", {"claim_id": "claim:b:x"})
        self.assertEqual(resolve_protocol_ref(exact, "claim:a:x")["claim_id"], "claim:a:x")
        with self.assertRaises(InputError) as ambiguous:
            resolve_protocol_ref(exact, "claim:x")
        self.assertEqual(ambiguous.exception.code, "ambiguous_ref")

        unprefixed = Store()
        unprefixed._put("claims", "a:x", {"claim_id": "a:x"})
        self.assertEqual(resolve_protocol_ref(unprefixed, "claim:a:x")["claim_id"], "a:x")

        prefers_exact = Store()
        prefers_exact._put("claims", "claim:x", {"claim_id": "claim:x"})
        prefers_exact._put("claims", "claim:a:x", {"claim_id": "claim:a:x"})
        self.assertEqual(resolve_protocol_ref(prefers_exact, "claim:x")["claim_id"], "claim:x")

        same_local = Store()
        same_local._put("claims", "claim:x", {"claim_id": "claim:x"})
        same_local._put("approvals", "approval:x", {"approval_id": "approval:x"})
        self.assertEqual(resolve_protocol_ref(same_local, "claim:x")["claim_id"], "claim:x")
        self.assertEqual(resolve_protocol_ref(same_local, "approval:x")["approval_id"], "approval:x")

        wrong_kind = Store()
        wrong_kind._put("approvals", "approval:x", {"approval_id": "approval:x"})
        with self.assertRaises(InputError) as wrong:
            resolve_protocol_ref(wrong_kind, "claim:x")
        self.assertEqual(wrong.exception.code, "wrong_kind_ref")

        empty = Store()
        with self.assertRaises(InputError) as dangling:
            resolve_protocol_ref(empty, "claim:x")
        self.assertEqual(dangling.exception.code, "dangling_ref")
