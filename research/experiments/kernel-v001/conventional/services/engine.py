from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from services.authority import AuthorityService
from services.canonical import digest
from services.catalog import CatalogService
from services.effects import EffectService
from services.errors import InputError, InternalError
from services.explain import ExplainService
from services.history import HistoryService
from services.ledger import Ledger
from services.orders import OrderService
from services.purchasing import PurchasingService
from services.stock import StockService

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "fixtures"
RUN_EXAMPLE = "os scenario run v001 --output json"


def load_json(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise InputError("invalid_json", f"JSON inválido em {path.name}: {exc}", RUN_EXAMPLE) from exc
    if not isinstance(data, dict):
        raise InputError("invalid_json", f"{path.name} deve ser um objeto", RUN_EXAMPLE)
    return data


def scenario_dir(scenario_id: str) -> Path:
    path = FIXTURES / scenario_id
    if not path.is_dir():
        raise InputError("unknown_scenario", f"cenário {scenario_id} não encontrado", RUN_EXAMPLE)
    return path


def _claim_slice(records: dict[str, Any], subject: str | None, predicate: str | None, ids: set[str] | None = None) -> list[dict[str, Any]]:
    claims = list((records.get("claims") or []))
    if subject is not None and predicate is not None:
        claims = [item for item in claims if item.get("subject_ref") == subject and item.get("predicate_ref") == predicate]
    if ids is not None:
        claims = [item for item in claims if item.get("claim_id") in ids]
    claims.sort(key=lambda item: item.get("claim_id") or "")
    return claims


def _observation(evidence_id: str, operation: str, before_digest: str, after_digest: str, observed_refs: list[str]) -> dict[str, Any]:
    return {
        "evidence_id": evidence_id,
        "operation": operation,
        "before_digest": before_digest,
        "after_digest": after_digest,
        "observed_refs": list(observed_refs),
    }


class ConventionalEngine:
    def __init__(self, scenario: dict[str, Any]) -> None:
        self.scenario = scenario
        self.scenario_id = scenario.get("scenario_id") or "v001"
        self.clock = (scenario.get("clock") or {}).get("start") or "2030-08-10T10:00:00Z"
        self.ledger = Ledger()
        self.history = HistoryService(self.ledger)
        self.catalog = CatalogService(self.ledger)
        self.stock = StockService(self.ledger, self.history)
        self.orders = OrderService(self.history)
        self.authority = AuthorityService(self.ledger)
        self.effects = EffectService(self.ledger, self.history)
        self.purchasing = PurchasingService(self.ledger, self.stock, self.authority, self.effects)
        self.explainer = ExplainService(self.ledger)
        self.command_receipts: list[dict[str, Any]] = []
        self.proof_observations: list[dict[str, Any]] = []
        self._seen_reconcile = False
        self._commit_count = 0

    def apply(self, command: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(command, dict):
            raise InputError("invalid_command", "cada comando deve ser um objeto", RUN_EXAMPLE)
        payload = dict(command)
        clock_time = payload.get("clock_time")
        if clock_time:
            self.clock = clock_time
        command_type = payload.get("type")
        if command_type == "CreateEntity":
            receipt = self.catalog.create_entity(payload, self.clock)
        elif command_type == "RecordClaim":
            receipt = self._record_claim(payload)
        elif command_type == "RecordExternalOccurrence":
            receipt = self.stock.record_receipt(payload)
        elif command_type == "ProposeOperation":
            receipt = self.purchasing.propose(payload, self.clock)
        elif command_type == "RecordApproval":
            receipt = self.authority.approve(payload)
        elif command_type == "CommitOperation":
            receipt = self.purchasing.commit(payload, self.clock, self.scenario_id)
        elif command_type == "RecordEffectAttempt":
            receipt = self.effects.attempt(payload)
        elif command_type == "ReconcileEffect":
            receipt = self.effects.reconcile(payload)
            self._seen_reconcile = True
        elif command_type == "InstallDefinitionRevision":
            receipt = self._install_policy(payload)
        else:
            raise InputError("unknown_command", f"comando {command_type!r} não é suportado", RUN_EXAMPLE)
        return receipt

    def _record_claim(self, command: dict[str, Any]) -> dict[str, Any]:
        if self.stock.owns_claim(command):
            return self.stock.record_claim(command)
        if self.orders.owns(command):
            return self.orders.record_claim(command)
        if self.effects.owns_claim(command):
            return self.effects.record_claim(command)
        return self.history.record_claim(command)

    def _install_policy(self, command: dict[str, Any]) -> dict[str, Any]:
        revision = self.ledger.next_revision()
        pack_id = command.get("definitions_file") or self.ledger.next_id("policy")
        self.ledger.put("policy_packs", str(pack_id), {"pack_id": pack_id, "known_revision": revision})
        return {
            "command_type": "InstallDefinitionRevision",
            "outcome": "installed",
            "known_revision": revision,
            "record_refs": [],
            "details": {"pack_id": pack_id},
        }

    def query(self, query: dict[str, Any]) -> dict[str, Any]:
        kind = query.get("type")
        if kind in {"known-then", "now-believed-for-then"}:
            return self.history.query_quantity(query)
        if kind == "scenario-report":
            return self.scenario_report(query.get("scenario_id") or self.scenario_id)
        raise InputError("unknown_query", f"consulta {kind!r} não é suportada", RUN_EXAMPLE)

    def explain(self, reference: str) -> dict[str, Any]:
        return self.explainer.explain(reference)

    def records(self) -> dict[str, Any]:
        history = self.history.public_records()
        return {
            "claims": history["claims"],
            "occurrences": sorted(
                [
                    {
                        "occurrence_id": item["occurrence_id"],
                        "occurrence_ref": item.get("occurrence_ref"),
                        "known_revision": item["known_revision"],
                        "causal_operation_ref": item.get("causal_operation_ref"),
                    }
                    for item in self.ledger.all("occurrences")
                ],
                key=lambda item: item["occurrence_id"],
            ),
            "proposals": sorted(
                [
                    {
                        "proposal_id": item["proposal_id"],
                        "action_revision": item["action_revision"],
                        "intent_digest": item["intent_digest"],
                        "state_basis": {
                            "basis_id": item["state_basis"]["basis_id"],
                            "digest": item["state_basis"]["digest"],
                        },
                        "attribution": item["attribution"],
                    }
                    for item in self.ledger.all("proposals")
                ],
                key=lambda item: item["proposal_id"],
            ),
            "approvals": sorted(
                [
                    {
                        "approval_id": item["approval_id"],
                        "proposal_ref": item["proposal_ref"],
                        "proposal_digest": item["proposal_digest"],
                        "state_basis_ref": item["state_basis_ref"],
                        "approved_bounds": item["approved_bounds"],
                        "attribution": item["attribution"],
                    }
                    for item in self.ledger.all("approvals")
                ],
                key=lambda item: item["approval_id"],
            ),
            "causal_links": sorted(
                [
                    {
                        "link_id": item["link_id"],
                        "cause_ref": item["cause_ref"],
                        "relation": item["relation"],
                        "consequence_ref": item["consequence_ref"],
                    }
                    for item in self.ledger.all("causal_links")
                ],
                key=lambda item: item["link_id"],
            ),
            "effect_requests": sorted(
                [
                    {
                        "request_id": item["request_id"],
                        "parent_operation_id": item["parent_operation_id"],
                        "effect_ref": item.get("effect_ref"),
                    }
                    for item in self.ledger.all("effect_requests")
                ],
                key=lambda item: item["request_id"],
            ),
            "effect_attempts": sorted(
                [
                    {
                        "attempt_id": item["attempt_id"],
                        "request_id": item["request_id"],
                        "outcome": item["outcome"],
                    }
                    for item in self.ledger.all("effect_attempts")
                ],
                key=lambda item: item["attempt_id"],
            ),
            "reconciliations": sorted(
                [
                    {
                        "reconciliation_id": item["reconciliation_id"],
                        "request_id": item["request_id"],
                        "prior_knowledge": item["prior_knowledge"],
                        "resulting_knowledge": item["resulting_knowledge"],
                        "evidence_refs": list(item["evidence_refs"]),
                    }
                    for item in self.ledger.all("reconciliations")
                ],
                key=lambda item: item["reconciliation_id"],
            ),
            "envelopes": sorted(
                [
                    {
                        "operation_id": item["operation_id"],
                        "attribution": item["attribution"],
                        "action_revision": item["action_revision"],
                    }
                    for item in self.ledger.all("envelopes")
                ],
                key=lambda item: item["operation_id"],
            ),
        }

    def operation_receipts(self) -> list[dict[str, Any]]:
        receipts = [
            {
                "operation_id": item["operation_id"],
                "intent_digest": item["intent_digest"],
                "action_revision": item["action_revision"],
                "outcome": item["outcome"],
                "stale": item["stale"],
                "proposal_basis_digest": item["proposal_basis_digest"],
                "commit_basis_digest": item["commit_basis_digest"],
                "planned_quantity": item["planned_quantity"],
                "committed_quantity": item["committed_quantity"],
                "commit_revision": item["commit_revision"],
                "committed_refs": list(item["committed_refs"]),
            }
            for item in self.ledger.all("receipts")
        ]
        receipts.sort(key=lambda item: item["operation_id"])
        return receipts

    def effect_knowledge(self) -> list[dict[str, Any]]:
        knowledge = [
            {
                "record_id": item["record_id"],
                "request_id": item["request_id"],
                "prior_knowledge": item["prior_knowledge"],
                "new_knowledge": item["new_knowledge"],
                "evidence_refs": list(item["evidence_refs"]),
                "known_revision": item["known_revision"],
            }
            for item in self.ledger.all("effect_knowledge")
        ]
        knowledge.sort(key=lambda item: item["record_id"])
        return knowledge

    def scenario_report(self, scenario_id: str) -> dict[str, Any]:
        return {
            "scenario_id": scenario_id,
            "definition_revisions": ["conventional-unversioned"],
            "records": self.records(),
            "operation_receipts": self.operation_receipts(),
            "effect_knowledge": self.effect_knowledge(),
            "aliases": self.ledger.aliases(),
        }

    def _records_digest(self) -> str:
        return digest(self.records())

    def _public_methods(self) -> list[str]:
        names = []
        for name in dir(self):
            if name.startswith("_"):
                continue
            if callable(getattr(self, name, None)):
                names.append(name)
        return sorted(names)

    def _surface_observations(self) -> None:
        methods = self._public_methods()
        self.proof_observations.append(
            _observation("obs:public-methods", "public-methods", digest(methods), digest(methods), ["obs:public-methods"])
        )
        before = self._records_digest()
        surface = getattr(self, "write_authoritative_claim", None)
        refs = ["obs:public-methods"]
        if callable(surface):
            refs.append("obs:raw-write")
            surface({"claim_id": "claim:raw-write-probe", "value": 1})
            after = self._records_digest()
            self.proof_observations.append(_observation("obs:raw-write", "raw-write-invoked", before, after, refs))
            return
        after = self._records_digest()
        self.proof_observations.append(_observation("obs:raw-write", "raw-write-absent", before, after, refs))

    def run(self) -> dict[str, Any]:
        commands = self.scenario.get("commands") or []
        if not commands:
            raise InternalError("empty_scenario", "o cenário não contém comandos")
        cut_before: dict[str, str] = {}
        for alias, spec in (self.scenario.get("knowledge_cuts") or {}).items():
            if isinstance(spec, dict) and spec.get("before_command_id"):
                cut_before[str(spec["before_command_id"])] = alias
        queries = self.scenario.get("closing_queries") or []
        subject = next((item.get("subject") for item in queries if item.get("subject")), None)
        predicate = next((item.get("predicate") for item in queries if item.get("predicate")), None)
        late_ids: set[str] = set()
        before_report: dict[str, Any] | None = None
        for index, command in enumerate(commands):
            payload = dict(command)
            nxt = commands[index + 1] if index + 1 < len(commands) else None
            alias = None
            if nxt is not None:
                alias = cut_before.get(nxt.get("command_id"))
            command_type = payload.get("type")
            before_digest = self._records_digest()
            if command_type == "RecordClaim" and self._seen_reconcile:
                before_report = self.records()
                late_claims = _claim_slice(before_report, subject, predicate)
                late_ids = {item["claim_id"] for item in late_claims if item.get("claim_id")}
                self.proof_observations.append(
                    _observation(
                        "obs:claims-before-late",
                        "claims-before-late-evidence",
                        digest(late_claims),
                        digest(late_claims),
                        sorted(late_ids),
                    )
                )
            receipt = self.apply(payload)
            if alias:
                self.ledger.alias(alias, receipt["known_revision"])
            self.command_receipts.append(
                {
                    "command_id": command.get("command_id"),
                    "type": command.get("type"),
                    "outcome": receipt["outcome"],
                    "known_revision": receipt["known_revision"],
                    "record_refs": list(receipt["record_refs"]),
                    "details": receipt["details"],
                }
            )
            after_digest = self._records_digest()
            if command_type == "ProposeOperation":
                self.proof_observations.append(
                    _observation("obs:proposal", "proposal-apply", before_digest, after_digest, ["obs:proposal"])
                )
            elif command_type == "CommitOperation":
                self._commit_count += 1
                name = "obs:after-commit" if self._commit_count == 1 else "obs:replay"
                operation = "commit-apply" if self._commit_count == 1 else "replay-apply"
                self.proof_observations.append(_observation(name, operation, before_digest, after_digest, [name]))
            elif command_type == "RecordClaim" and before_report is not None:
                after_same = _claim_slice(self.records(), subject, predicate, late_ids)
                self.proof_observations.append(
                    _observation(
                        "obs:claims-after-late",
                        "claims-after-late-evidence",
                        digest(_claim_slice(before_report, subject, predicate, late_ids)),
                        digest(after_same),
                        sorted(late_ids),
                    )
                )
                self.proof_observations.append(
                    _observation("obs:records-after-late", "late-evidence-records", before_digest, after_digest, ["obs:records-after-late"])
                )
                before_report = None
        self._surface_observations()
        return self.scenario_run_document()

    def scenario_run_document(self, source_sha: str | None = None) -> dict[str, Any]:
        report = self.scenario_report(self.scenario_id)
        query_results = [self.query(item) for item in self.scenario.get("closing_queries") or []]
        explanations = [self.explain(item) for item in self.scenario.get("closing_explains") or []]
        document = {
            "contract_version": "kernel-v001-scenario-run/1",
            "scenario_id": self.scenario_id,
            "engine": "conventional",
            "input_digest": digest({key: value for key, value in self.scenario.items() if key != "black_box_expectations"}),
            "definition_revisions": report["definition_revisions"],
            "records": report["records"],
            "queries": query_results,
            "explanations": explanations,
            "operation_receipts": report["operation_receipts"],
            "effect_knowledge": report["effect_knowledge"],
            "command_receipts": self.command_receipts,
            "aliases": report["aliases"],
            "temporal_limit": self.scenario.get("temporal_limit"),
            "proof_observations": self.proof_observations,
        }
        if source_sha:
            document["source_sha"] = source_sha
        return document


def run_scenario_document(scenario: dict[str, Any], source_sha: str | None = None) -> dict[str, Any]:
    engine = ConventionalEngine(scenario)
    document = engine.run()
    if source_sha:
        document["source_sha"] = source_sha
    return document


def run_named_scenario(scenario_id: str, source_sha: str | None = None) -> dict[str, Any]:
    scenario = load_json(scenario_dir(scenario_id) / "scenario.json")
    if scenario.get("scenario_id") != scenario_id:
        raise InternalError("scenario_mismatch", "scenario_id no arquivo não coincide com o pedido")
    return run_scenario_document(scenario, source_sha)


def engine_for_named_scenario(scenario_id: str) -> ConventionalEngine:
    scenario = load_json(scenario_dir(scenario_id) / "scenario.json")
    engine = ConventionalEngine(scenario)
    engine.run()
    return engine
