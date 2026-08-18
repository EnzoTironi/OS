"""Scenario reference for issue #71.

This is one adapter behind the suite interface, not a kernel and not a
metamodel decision. Domain names come from the scenario. Commit, authority,
and effect knowledge reuse the reviewed #40/#41/#42 research models.
"""

from __future__ import annotations

import importlib.util
from hashlib import sha256
import json
from pathlib import Path
import sys
from typing import Any, Callable, Mapping

RESEARCH = Path(__file__).resolve().parents[3]


def _load(module_name: str, relative: str):
    path = RESEARCH / relative
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


effects = _load("cc71_effects", "runtime/effects/reference_model.py")
auth = _load("cc71_auth", "runtime/authorization/reference_model.py")


def _digest(value: Any) -> str:
    return sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), default=str).encode()).hexdigest()


class ReferenceRuntime:
    def __init__(self) -> None:
        self.revision = 0
        self.clock = 0
        self.entities: dict[str, dict[str, Any]] = {}
        self.claims: dict[str, dict[str, Any]] = {}
        self.admitted: dict[tuple[str, str], str] = {}
        self.quotes: dict[str, dict[str, Any]] = {}
        self.intents: dict[str, dict[str, Any]] = {}
        self.commitments: dict[str, dict[str, Any]] = {}
        self.reservations: dict[str, dict[str, Any]] = {}
        self.consumptions: dict[str, dict[str, Any]] = {}
        self.receipts: dict[str, dict[str, Any]] = {}
        self.shipments: dict[str, dict[str, Any]] = {}
        self.receivables: dict[str, dict[str, Any]] = {}
        self.settlements: dict[str, dict[str, Any]] = {}
        self.returns: dict[str, dict[str, Any]] = {}
        self.proposals: dict[str, dict[str, Any]] = {}
        self.approvals: dict[str, dict[str, Any]] = {}
        self.operations: dict[str, dict[str, Any]] = {}
        self.ontology_revision = "v1"
        self.ontology: dict[str, dict[str, Any]] = {
            "v1": {
                "revision": "v1",
                "types": {
                    "Product": {"fields": ["sku", "name"]},
                    "SalesOrder": {"fields": ["customer"]},
                },
            }
        }
        self.effects = effects.EffectBook()
        self.authority = auth.AuthorityWorld()
        self.authorizer = auth.Authorizer(self.authority)
        self.inventory_version = 0
        self.handlers: dict[str, Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]]] = {
            "AdmitObservation": self._admit,
            "AcceptOrder": self._accept_order,
            "ReserveInventory": self._reserve,
            "ConsumeStock": self._consume,
            "CreateProcurementCommitment": self._procure,
            "AdmitStockReceipt": self._receive,
            "ShipOrder": self._ship,
            "IssueReceivable": self._receivable,
            "AllocateSettlement": self._settle,
            "RecordReturn": self._return,
        }

    def apply(self, command: Mapping[str, Any]) -> Mapping[str, Any]:
        kind = command["type"]
        if kind == "Seed":
            return self._seed(command)
        if kind == "RecordClaim":
            return self._record_claim(command)
        if kind == "RecordIntent":
            return self._record_intent(command)
        if kind == "PublishQuote":
            return self._publish_quote(command)
        if kind == "ProposeAction":
            return self._propose(command)
        if kind == "ApproveProposal":
            return self._approve(command)
        if kind == "CommitAction":
            return self._commit(command)
        if kind == "ObserveEffect":
            return self._observe_effect(command)
        if kind == "ReconcileEffect":
            return self._reconcile_effect(command)
        if kind == "RetryEffect":
            return self._retry_effect(command)
        if kind == "PublishOntologyRevision":
            return self._publish_ontology(command)
        raise ValueError(f"unknown command {kind}")

    def query(self, query: Mapping[str, Any]) -> Mapping[str, Any]:
        kind = query["type"]
        if kind == "rival_claims":
            rows = [
                claim
                for claim in self.claims.values()
                if claim["subject"] == query["subject"] and claim["predicate"] == query["predicate"]
            ]
            return {
                "count": len(rows),
                "values": [claim["value"] for claim in rows],
                "sources": [claim["source"] for claim in rows],
                "admitted_claim": self.admitted.get((query["subject"], query["predicate"])),
            }
        if kind == "available":
            return {
                "value": self._available(query["product"]),
                "on_hand": self._on_hand(query["product"]),
                "reserved": self._reserved(query["product"]),
                "inventory_version": self.inventory_version,
            }
        if kind == "commitment":
            item = self.commitments[query["commitment_id"]]
            return {
                "quantity": item["quantity"],
                "quote_digest": item["quote_digest"],
                "order_id": item["order_id"],
            }
        if kind == "shortage":
            commitment = self.commitments[query["commitment_id"]]
            reserved = sum(
                row["quantity"]
                for row in self.reservations.values()
                if row["order_id"] == commitment["order_id"] and row["active"]
            )
            shipped = sum(
                row["quantity"]
                for row in self.shipments.values()
                if row["order_id"] == commitment["order_id"]
            )
            returned = sum(
                row["quantity"]
                for row in self.returns.values()
                if row.get("shipment_id") in {
                    item["shipment_id"] for item in self.shipments.values() if item["order_id"] == commitment["order_id"]
                }
            )
            net = reserved + shipped - returned
            return {"value": commitment["quantity"] - net, "reserved": reserved, "shipped": shipped, "returned": returned}
        if kind == "effect_knowledge":
            request = self.effects.requests[query["request_id"]]
            return {"knowledge": request.knowledge.value, "attempts": len(request.attempts)}
        if kind == "ontology":
            current = self.ontology[self.ontology_revision]
            return {
                "revision": current["revision"],
                "product_fields": list(current["types"]["Product"]["fields"]),
            }
        if kind == "identity":
            return {
                "same_entity": query["left"] == query["right"],
                "left_exists": query["left"] in self.entities,
                "right_exists": query["right"] in self.entities,
            }
        if kind == "write_paths":
            return {
                "authority_operations": sorted(self.operations),
                "claim_ids": sorted(self.claims),
            }
        if kind == "known_then":
            claim = self.claims[query["claim_id"]]
            return {"value": claim["value"], "known_revision": claim["known_revision"]}
        raise ValueError(f"unknown query {kind}")

    def explain(self, operation_id: str) -> Mapping[str, Any]:
        receipt = self.operations[operation_id]
        return {
            "operation_id": operation_id,
            "action": receipt["action"],
            "actor": receipt["actor"],
            "represented_principal": receipt["represented_principal"],
            "workload": receipt["workload"],
            "ontology_revision": receipt["ontology_revision"],
            "quote_digest": receipt.get("quote_digest"),
            "basis": receipt.get("basis"),
            "effect_ids": list(receipt.get("effect_ids") or ()),
            "produced": list(receipt.get("produced") or ()),
            "corrections": [
                item["return_id"]
                for item in self.returns.values()
                if item.get("corrects_operation") == operation_id
            ],
        }

    def _bump(self) -> str:
        self.revision += 1
        self.clock += 1
        return f"rev:{self.revision}"

    def _seed(self, command: Mapping[str, Any]) -> dict[str, Any]:
        for entity in command["entities"]:
            self.entities[entity["id"]] = dict(entity)
        tenant = command.get("tenant", "tenant:hf")
        for binding in command["workloads"]:
            self.authority.bind_workload(
                auth.WorkloadBinding(
                    workload_id=binding["workload_id"],
                    actor_id=binding["actor_id"],
                    tenant=tenant,
                    environment=binding.get("environment", "production"),
                )
            )
        for grant in command["grants"]:
            self.authority.add_grant(
                auth.grant(
                    grant["grant_id"],
                    grant["grantor_id"],
                    grant["actor_id"],
                    grant["represented_principal_id"],
                    actions=grant["actions"],
                    resources=grant["resources"],
                    purposes=grant["purposes"],
                    tenant=tenant,
                    amount_limit=grant.get("amount_limit"),
                )
            )
        return {"outcome": "seeded", "known_revision": self._bump(), "details": {"entities": len(self.entities)}}

    def _record_claim(self, command: Mapping[str, Any]) -> dict[str, Any]:
        revision = self._bump()
        self.claims[command["claim_id"]] = {
            "claim_id": command["claim_id"],
            "subject": command["subject"],
            "predicate": command["predicate"],
            "value": command["value"],
            "source": command["source"],
            "known_revision": revision,
            "admitted": False,
        }
        return {"outcome": "claimed", "known_revision": revision, "details": {"claim_id": command["claim_id"]}}

    def _record_intent(self, command: Mapping[str, Any]) -> dict[str, Any]:
        self.intents[command["intent_id"]] = {
            "intent_id": command["intent_id"],
            "order_id": command["order_id"],
            "product": command["product"],
            "quantity": command["quantity"],
        }
        return {"outcome": "recorded", "known_revision": self._bump(), "details": {"intent_id": command["intent_id"]}}

    def _publish_quote(self, command: Mapping[str, Any]) -> dict[str, Any]:
        digest = _digest({"quote_id": command["quote_id"], "unit_price": command["unit_price"], "currency": command["currency"]})
        self.quotes[command["quote_id"]] = {
            "quote_id": command["quote_id"],
            "unit_price": command["unit_price"],
            "currency": command["currency"],
            "digest": digest,
        }
        return {"outcome": "recorded", "known_revision": self._bump(), "details": {"quote_digest": digest}}

    def _authorize(self, command: Mapping[str, Any], action: str, resource: str, amount: int | None) -> None:
        request = auth.Request(
            workload_id=command["workload_id"],
            actor_id=command["actor_id"],
            represented_principal_id=command["represented_principal_id"],
            tenant=command.get("tenant", "tenant:hf"),
            environment=command.get("environment", "production"),
            action=action,
            resource=resource,
            purpose=command.get("purpose", "operate"),
            now=self.clock,
            amount=amount,
            relied_grant_ids=tuple(command.get("grant_ids") or ()),
        )
        result = self.authorizer.authorize(request)
        if result.decision is not auth.Decision.ALLOWED:
            raise PermissionError(result.reason)

    def _propose(self, command: Mapping[str, Any]) -> dict[str, Any]:
        action = command["action"]
        inputs = dict(command["inputs"])
        resource = str(inputs.get("resource") or inputs.get("order_id") or inputs.get("product") or "*")
        amount = inputs.get("quantity")
        self._authorize(command, action, resource, amount if isinstance(amount, int) else None)
        basis = {
            "available": self._available(inputs["product"]) if "product" in inputs else None,
            "inventory_version": self.inventory_version,
        }
        intent = _digest(
            {
                "action": action,
                "inputs": inputs,
                "actor": command["actor_id"],
                "represented": command["represented_principal_id"],
                "workload": command["workload_id"],
            }
        )
        proposal = {
            "proposal_id": command["proposal_id"],
            "operation_id": command["operation_id"],
            "action": action,
            "inputs": inputs,
            "actor": command["actor_id"],
            "represented_principal": command["represented_principal_id"],
            "workload": command["workload_id"],
            "grant_ids": list(command.get("grant_ids") or ()),
            "tenant": command.get("tenant", "tenant:hf"),
            "environment": command.get("environment", "production"),
            "intent_digest": intent,
            "basis": basis,
            "stale_behavior": command.get("stale_behavior", "reject"),
        }
        self.proposals[proposal["proposal_id"]] = proposal
        return {
            "outcome": "proposed",
            "known_revision": self._bump(),
            "details": {"proposal_id": proposal["proposal_id"], "intent_digest": intent, "basis": basis},
        }

    def _approve(self, command: Mapping[str, Any]) -> dict[str, Any]:
        proposal = self.proposals[command["proposal_id"]]
        if command.get("intent_digest") not in {None, proposal["intent_digest"]}:
            return {"outcome": "denied", "known_revision": f"rev:{self.revision}", "details": {"reason": "approval_intent_mismatch"}}
        self.approvals[command["approval_id"]] = {
            "approval_id": command["approval_id"],
            "proposal_id": command["proposal_id"],
            "intent_digest": proposal["intent_digest"],
            "max_quantity": command.get("max_quantity"),
            "approver": command["approver"],
        }
        return {"outcome": "approved", "known_revision": self._bump(), "details": {"approval_id": command["approval_id"]}}

    def _commit(self, command: Mapping[str, Any]) -> dict[str, Any]:
        operation_id = command["operation_id"]
        existing = self.operations.get(operation_id)
        proposal = self.proposals[command["proposal_id"]]
        approval = self.approvals[command["approval_id"]]
        if existing is not None:
            if existing["intent_digest"] != proposal["intent_digest"]:
                return {"outcome": "denied", "known_revision": existing["known_revision"], "details": {"reason": "idempotency_mismatch"}}
            return {"outcome": "replayed", "known_revision": existing["known_revision"], "details": {"replayed": True}}
        if approval["proposal_id"] != proposal["proposal_id"]:
            return {"outcome": "denied", "known_revision": f"rev:{self.revision}", "details": {"reason": "approval_mismatch"}}
        if approval["intent_digest"] != proposal["intent_digest"]:
            return {"outcome": "denied", "known_revision": f"rev:{self.revision}", "details": {"reason": "approval_intent_mismatch"}}
        if command.get("actor_id") and command["actor_id"] != proposal["actor"]:
            return {"outcome": "denied", "known_revision": f"rev:{self.revision}", "details": {"reason": "attribution_mismatch"}}
        self._authorize(
            {
                "workload_id": proposal["workload"],
                "actor_id": proposal["actor"],
                "represented_principal_id": proposal["represented_principal"],
                "grant_ids": proposal["grant_ids"],
                "tenant": proposal["tenant"],
                "environment": proposal["environment"],
            },
            proposal["action"],
            str(proposal["inputs"].get("resource") or proposal["inputs"].get("order_id") or proposal["inputs"].get("product") or "*"),
            proposal["inputs"].get("quantity") if isinstance(proposal["inputs"].get("quantity"), int) else None,
        )
        product = proposal["inputs"].get("product")
        current_basis = {
            "available": self._available(product) if product else None,
            "inventory_version": self.inventory_version,
        }
        stale = bool(product) and current_basis != proposal["basis"]
        if stale and proposal["stale_behavior"] == "reject":
            return {"outcome": "stale_rejected", "known_revision": f"rev:{self.revision}", "details": {"basis": current_basis}}
        max_quantity = approval.get("max_quantity")
        quantity = proposal["inputs"].get("quantity")
        if max_quantity is not None and quantity is not None and quantity > max_quantity:
            return {"outcome": "needs_reproposal", "known_revision": f"rev:{self.revision}", "details": {"quantity": quantity, "bound": max_quantity}}
        handler = self.handlers[proposal["action"]]
        produced = handler(proposal, current_basis)
        revision = self._bump()
        receipt = {
            "operation_id": operation_id,
            "action": proposal["action"],
            "actor": proposal["actor"],
            "represented_principal": proposal["represented_principal"],
            "workload": proposal["workload"],
            "intent_digest": proposal["intent_digest"],
            "ontology_revision": self.ontology_revision,
            "basis": current_basis,
            "quote_digest": produced.get("quote_digest"),
            "effect_ids": produced.get("effect_ids") or [],
            "produced": produced.get("produced") or [],
            "known_revision": revision,
            "quantity": produced.get("quantity", quantity),
        }
        self.operations[operation_id] = receipt
        return {
            "outcome": "committed",
            "known_revision": revision,
            "details": {
                "quantity": receipt["quantity"],
                "effect_ids": receipt["effect_ids"],
                "produced": receipt["produced"],
                "ontology_revision": receipt["ontology_revision"],
                "stale": stale,
            },
        }

    def _on_hand(self, product: str) -> int:
        opening = 0
        for key, claim_id in self.admitted.items():
            claim = self.claims[claim_id]
            if claim["subject"] == f"stock:{product}" and claim["predicate"] == "on-hand":
                opening = int(claim["value"])
        received = sum(item["quantity"] for item in self.receipts.values() if item["product"] == product)
        shipped = sum(item["quantity"] for item in self.shipments.values() if item["product"] == product)
        consumed = sum(item["quantity"] for item in self.consumptions.values() if item["product"] == product)
        returned = sum(item["quantity"] for item in self.returns.values() if item["product"] == product)
        return opening + received + returned - shipped - consumed

    def _reserved(self, product: str) -> int:
        return sum(item["quantity"] for item in self.reservations.values() if item["product"] == product and item["active"])

    def _available(self, product: str) -> int:
        return self._on_hand(product) - self._reserved(product)

    def _touch_inventory(self) -> None:
        self.inventory_version += 1

    def _admit(self, proposal: dict[str, Any], basis: dict[str, Any]) -> dict[str, Any]:
        del basis
        claim = self.claims[proposal["inputs"]["claim_id"]]
        self.admitted[(claim["subject"], claim["predicate"])] = claim["claim_id"]
        claim["admitted"] = True
        self._touch_inventory()
        return {"produced": [claim["claim_id"]], "quantity": claim["value"]}

    def _accept_order(self, proposal: dict[str, Any], basis: dict[str, Any]) -> dict[str, Any]:
        del basis
        inputs = proposal["inputs"]
        quote = self.quotes[inputs["quote_id"]]
        commitment_id = inputs["commitment_id"]
        self.commitments[commitment_id] = {
            "commitment_id": commitment_id,
            "order_id": inputs["order_id"],
            "product": inputs["product"],
            "quantity": inputs["quantity"],
            "quote_digest": quote["digest"],
            "intent_id": inputs["intent_id"],
        }
        return {"produced": [commitment_id], "quantity": inputs["quantity"], "quote_digest": quote["digest"]}

    def _reserve(self, proposal: dict[str, Any], basis: dict[str, Any]) -> dict[str, Any]:
        inputs = proposal["inputs"]
        if basis["available"] < inputs["quantity"]:
            raise ValueError("available inventory below reserved quantity")
        reservation_id = inputs["reservation_id"]
        self.reservations[reservation_id] = {
            "reservation_id": reservation_id,
            "order_id": inputs["order_id"],
            "product": inputs["product"],
            "quantity": inputs["quantity"],
            "active": True,
        }
        self._touch_inventory()
        return {"produced": [reservation_id], "quantity": inputs["quantity"]}

    def _consume(self, proposal: dict[str, Any], basis: dict[str, Any]) -> dict[str, Any]:
        del basis
        inputs = proposal["inputs"]
        consume_id = inputs["consume_id"]
        self.consumptions[consume_id] = {
            "consume_id": consume_id,
            "product": inputs["product"],
            "quantity": inputs["quantity"],
        }
        self._touch_inventory()
        return {"produced": [consume_id], "quantity": inputs["quantity"]}

    def _procure(self, proposal: dict[str, Any], basis: dict[str, Any]) -> dict[str, Any]:
        del basis
        inputs = proposal["inputs"]
        commitment_id = inputs["procurement_id"]
        request_id = inputs["effect_request_id"]
        self.commitments[commitment_id] = {
            "commitment_id": commitment_id,
            "order_id": inputs["order_id"],
            "product": inputs["product"],
            "quantity": inputs["quantity"],
            "kind": "procurement",
            "quote_digest": None,
        }
        self.effects.create(
            effects.EffectRequest(
                effect_request_id=request_id,
                local_operation_id=proposal["operation_id"],
                intent_digest=proposal["intent_digest"],
                protocol=effects.ProtocolContract("supplier-edi", idempotent_replay=False),
                remote_dedup_key=inputs.get("remote_dedup_key"),
            )
        )
        return {"produced": [commitment_id, request_id], "quantity": inputs["quantity"], "effect_ids": [request_id]}

    def _receive(self, proposal: dict[str, Any], basis: dict[str, Any]) -> dict[str, Any]:
        del basis
        inputs = proposal["inputs"]
        receipt_id = inputs["receipt_id"]
        self.receipts[receipt_id] = {
            "receipt_id": receipt_id,
            "product": inputs["product"],
            "quantity": inputs["quantity"],
        }
        self._touch_inventory()
        return {"produced": [receipt_id], "quantity": inputs["quantity"]}

    def _ship(self, proposal: dict[str, Any], basis: dict[str, Any]) -> dict[str, Any]:
        del basis
        inputs = proposal["inputs"]
        shipment_id = inputs["shipment_id"]
        request_id = inputs["effect_request_id"]
        self.shipments[shipment_id] = {
            "shipment_id": shipment_id,
            "order_id": inputs["order_id"],
            "product": inputs["product"],
            "quantity": inputs["quantity"],
        }
        for item in self.reservations.values():
            if item["order_id"] == inputs["order_id"]:
                item["active"] = False
        self.effects.create(
            effects.EffectRequest(
                effect_request_id=request_id,
                local_operation_id=proposal["operation_id"],
                intent_digest=proposal["intent_digest"],
                protocol=effects.ProtocolContract("carrier", idempotent_replay=False),
                remote_dedup_key=inputs.get("remote_dedup_key"),
            )
        )
        self._touch_inventory()
        return {"produced": [shipment_id, request_id], "quantity": inputs["quantity"], "effect_ids": [request_id]}

    def _receivable(self, proposal: dict[str, Any], basis: dict[str, Any]) -> dict[str, Any]:
        del basis
        inputs = proposal["inputs"]
        claim_id = inputs["receivable_id"]
        request_id = inputs["effect_request_id"]
        self.receivables[claim_id] = {
            "receivable_id": claim_id,
            "order_id": inputs["order_id"],
            "amount": inputs["amount"],
            "allocated": 0,
        }
        self.effects.create(
            effects.EffectRequest(
                effect_request_id=request_id,
                local_operation_id=proposal["operation_id"],
                intent_digest=proposal["intent_digest"],
                protocol=effects.ProtocolContract("payments", idempotent_replay=False),
                remote_dedup_key=inputs.get("remote_dedup_key"),
            )
        )
        return {"produced": [claim_id, request_id], "quantity": inputs["amount"], "effect_ids": [request_id]}

    def _settle(self, proposal: dict[str, Any], basis: dict[str, Any]) -> dict[str, Any]:
        del basis
        inputs = proposal["inputs"]
        receivable = self.receivables[inputs["receivable_id"]]
        settlement_id = inputs["settlement_id"]
        self.settlements[settlement_id] = {
            "settlement_id": settlement_id,
            "receivable_id": inputs["receivable_id"],
            "amount": inputs["amount"],
        }
        receivable["allocated"] += inputs["amount"]
        return {"produced": [settlement_id], "quantity": inputs["amount"]}

    def _return(self, proposal: dict[str, Any], basis: dict[str, Any]) -> dict[str, Any]:
        del basis
        inputs = proposal["inputs"]
        return_id = inputs["return_id"]
        shipment = self.shipments[inputs["shipment_id"]]
        if shipment["quantity"] == inputs["quantity"] and inputs.get("mutate_shipment"):
            raise ValueError("return must not mutate the original shipment")
        self.returns[return_id] = {
            "return_id": return_id,
            "product": inputs["product"],
            "quantity": inputs["quantity"],
            "shipment_id": inputs["shipment_id"],
            "corrects_operation": inputs.get("corrects_operation"),
            "credit_id": inputs.get("credit_id"),
        }
        self._touch_inventory()
        return {"produced": [return_id], "quantity": inputs["quantity"]}

    def _observe_effect(self, command: Mapping[str, Any]) -> dict[str, Any]:
        request = self.effects.requests[command["request_id"]]
        evidence = {
            "sent_no_response": effects.AttemptEvidence.SENT_NO_RESPONSE,
            "definitely_not_sent": effects.AttemptEvidence.DEFINITELY_NOT_SENT,
            "confirmed_succeeded": effects.AttemptEvidence.CONFIRMED_SUCCEEDED,
        }[command["evidence"]]
        request.record_attempt(
            effects.Attempt(
                attempt_id=command["attempt_id"],
                evidence=evidence,
                remote_receipt_id=command.get("remote_receipt_id"),
            )
        )
        return {
            "outcome": "observed",
            "known_revision": self._bump(),
            "details": {"knowledge": request.knowledge.value},
        }

    def _reconcile_effect(self, command: Mapping[str, Any]) -> dict[str, Any]:
        request = self.effects.requests[command["request_id"]]
        knowledge = {
            "confirmed_succeeded": effects.Knowledge.CONFIRMED_SUCCEEDED,
            "confirmed_rejected": effects.Knowledge.CONFIRMED_REJECTED,
            "indeterminate": effects.Knowledge.INDETERMINATE,
        }[command["knowledge"]]
        changed = request.reconcile(
            effects.Observation(
                observation_id=command["observation_id"],
                knowledge=knowledge,
                authoritative_for_outcome=command.get("authoritative", True),
                remote_dedup_key=command.get("remote_dedup_key"),
                remote_receipt_id=command.get("remote_receipt_id"),
                provider_sequence=command.get("provider_sequence"),
            )
        )
        return {
            "outcome": "reconciled",
            "known_revision": self._bump(),
            "details": {"knowledge": request.knowledge.value, "changed": changed},
        }

    def _retry_effect(self, command: Mapping[str, Any]) -> dict[str, Any]:
        request = self.effects.requests[command["request_id"]]
        allowed, reason = request.can_retry_same_remote_operation()
        if not allowed:
            return {"outcome": "retry_denied", "known_revision": f"rev:{self.revision}", "details": {"reason": reason}}
        return {"outcome": "retry_allowed", "known_revision": f"rev:{self.revision}", "details": {"reason": reason}}

    def _publish_ontology(self, command: Mapping[str, Any]) -> dict[str, Any]:
        revision = command["revision"]
        self.ontology[revision] = {
            "revision": revision,
            "types": command["types"],
        }
        self.ontology_revision = revision
        return {"outcome": "published", "known_revision": self._bump(), "details": {"revision": revision}}
