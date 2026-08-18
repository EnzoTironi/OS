#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path
from typing import Any, NamedTuple

from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError

PROTOCOL_VERSION = 1
SCHEMA_PATH = Path(__file__).resolve().parent / "casebook-fixture.schema.json"
ALLOWED_PERSON_BASIS = frozenset({"primary_source", "premise", "inference"})
RECORD_COLLECTIONS = (
    "identities",
    "grants",
    "approvals",
    "actions",
    "responsibility_claims",
    "scenario_claims",
    "scenario_instances",
    "occurrences",
    "owners",
    "gaps",
    "effect_attempts",
)
HELP_EPILOG = """\
Códigos de saída:
  0  todos os documentos são válidos
  1  pelo menos um documento viola o schema ou uma regra
  2  erro de uso, leitura ou JSON
  3  erro interno do validator

Exemplos:
  python3 research/experiments/structured-casebook/validate_casebook.py \\
    research/experiments/structured-casebook/fixtures/valid-minimal.json
  python3 research/experiments/structured-casebook/validate_casebook.py \\
    research/experiments/structured-casebook/fixtures/mutants/*.json

Limites:
  Este validador não verifica se um locator prova a claim.
  Este validador não verifica se os witnesses satisfazem toda a semântica do cenário.
  Este validador não verifica se os scopes de owner foram extraídos corretamente.
  Os nomes e enums pertencem ao experimento e não definem o Casebook final.
"""


class Finding(NamedTuple):
    code: str
    json_pointer: str
    message: str

    def as_dict(self) -> dict[str, str]:
        return {
            "code": self.code,
            "json_pointer": self.json_pointer,
            "message": self.message,
        }


class DocumentIndexes(NamedTuple):
    identities: dict[str, Mapping[str, Any]]
    grants: dict[str, Mapping[str, Any]]
    approvals: dict[str, Mapping[str, Any]]
    instances: dict[str, Mapping[str, Any]]
    record_ids: set[str]


RuleCheck = Callable[[Mapping[str, Any], DocumentIndexes], list[Finding]]


class JsonArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        write_report("error", [_error_result("", "usage-error", message)])
        self.exit(2)

    def format_help(self) -> str:
        return (
            super()
            .format_help()
            .replace("usage:", "uso:")
            .replace("positional arguments:", "argumentos posicionais:")
            .replace("options:", "opções:")
        )


def write_report(status: str, results: Sequence[Mapping[str, Any]]) -> None:
    payload = {
        "protocol_version": PROTOCOL_VERSION,
        "results": list(results),
        "status": status,
    }
    sys.stdout.write(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n")


def _error_result(path: str, code: str, message: str) -> dict[str, Any]:
    return {
        "findings": [Finding(code, "", message).as_dict()],
        "path": path,
        "valid": False,
    }


def _json_pointer(parts: Sequence[Any]) -> str:
    if not parts:
        return ""
    return "/" + "/".join(str(part).replace("~", "~0").replace("/", "~1") for part in parts)


def load_schema_validator() -> Draft202012Validator:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema, format_checker=Draft202012Validator.FORMAT_CHECKER)


def collect_schema_findings(
    document: Mapping[str, Any], validator: Draft202012Validator
) -> list[Finding]:
    findings = [
        Finding(
            "schema-violation",
            _json_pointer(error.absolute_path),
            error.message,
        )
        for error in validator.iter_errors(document)
    ]
    return sorted(findings, key=lambda item: (item.code, item.json_pointer, item.message))


def _index_by_id(items: Sequence[Mapping[str, Any]]) -> dict[str, Mapping[str, Any]]:
    indexed: dict[str, Mapping[str, Any]] = {}
    for item in items:
        item_id = item.get("id")
        if isinstance(item_id, str):
            indexed[item_id] = item
    return indexed


def build_indexes(document: Mapping[str, Any]) -> DocumentIndexes:
    record_ids: set[str] = set()
    for collection in RECORD_COLLECTIONS:
        for item in document.get(collection, []):
            item_id = item.get("id")
            if isinstance(item_id, str):
                record_ids.add(item_id)
    return DocumentIndexes(
        identities=_index_by_id(document.get("identities", [])),
        grants=_index_by_id(document.get("grants", [])),
        approvals=_index_by_id(document.get("approvals", [])),
        instances=_index_by_id(document.get("scenario_instances", [])),
        record_ids=record_ids,
    )


def check_missing_action_actor_or_grant(
    document: Mapping[str, Any], indexes: DocumentIndexes
) -> list[Finding]:
    findings: list[Finding] = []
    for index, action in enumerate(document.get("actions", [])):
        actor_ref = action.get("actor_ref")
        grant_ref = action.get("grant_ref")
        represented_ref = action.get("represented_ref")
        actor = indexes.identities.get(actor_ref) if isinstance(actor_ref, str) else None
        grant = indexes.grants.get(grant_ref) if isinstance(grant_ref, str) else None
        represented = (
            indexes.identities.get(represented_ref) if isinstance(represented_ref, str) else None
        )
        grant_compatible = (
            grant is not None
            and grant.get("actor_ref") == actor_ref
            and grant.get("represented_ref") == represented_ref
        )
        represented_is_org = represented is not None and represented.get("kind") == "organization"
        if actor is None or grant is None or not grant_compatible or not represented_is_org:
            pointer = (
                f"/actions/{index}/grant_ref"
                if grant is None or not grant_compatible
                else f"/actions/{index}/actor_ref"
            )
            findings.append(
                Finding(
                    "missing-action-actor-or-grant",
                    pointer,
                    "a Action precisa resolver um ator e um grant compatível",
                )
            )
    return findings


def check_workload_used_as_business_actor(
    document: Mapping[str, Any], indexes: DocumentIndexes
) -> list[Finding]:
    findings: list[Finding] = []
    for index, action in enumerate(document.get("actions", [])):
        actor_ref = action.get("actor_ref")
        actor = indexes.identities.get(actor_ref) if isinstance(actor_ref, str) else None
        if actor is not None and actor.get("kind") == "workload":
            findings.append(
                Finding(
                    "workload-used-as-business-actor",
                    f"/actions/{index}/actor_ref",
                    "actor_ref não pode resolver para identidade workload",
                )
            )
    return findings


def check_responsibility_without_source_or_epistemic_label(
    document: Mapping[str, Any], indexes: DocumentIndexes
) -> list[Finding]:
    findings: list[Finding] = []
    for index, claim in enumerate(document.get("responsibility_claims", [])):
        subject_ref = claim.get("subject_ref")
        subject = indexes.identities.get(subject_ref) if isinstance(subject_ref, str) else None
        if subject is None or subject.get("kind") != "person":
            continue
        basis = claim.get("basis")
        pointer = f"/responsibility_claims/{index}"
        if not isinstance(basis, Mapping):
            findings.append(
                Finding(
                    "responsibility-without-source-or-epistemic-label",
                    pointer,
                    "responsabilidade de person exige fonte primária, premissa ou inferência",
                )
            )
            continue
        kind = basis.get("kind")
        locator = basis.get("locator")
        missing_source = kind not in ALLOWED_PERSON_BASIS or (
            kind == "primary_source" and not isinstance(locator, str)
        )
        if missing_source:
            findings.append(
                Finding(
                    "responsibility-without-source-or-epistemic-label",
                    f"{pointer}/basis",
                    "responsabilidade de person exige fonte primária, premissa ou inferência",
                )
            )
    return findings


def check_claimed_scenario_not_instantiated(
    document: Mapping[str, Any], indexes: DocumentIndexes
) -> list[Finding]:
    findings: list[Finding] = []
    for index, claim in enumerate(document.get("scenario_claims", [])):
        if claim.get("relationship") != "instantiated":
            continue
        instance_ref = claim.get("instance_ref")
        instance = indexes.instances.get(instance_ref) if isinstance(instance_ref, str) else None
        if instance is None or instance.get("scenario_ref") != claim.get("scenario_ref"):
            findings.append(
                Finding(
                    "claimed-scenario-not-instantiated",
                    f"/scenario_claims/{index}/instance_ref",
                    "claim instantiated precisa resolver uma instância do mesmo cenário",
                )
            )
            continue
        witnesses = instance.get("witness_refs")
        if not isinstance(witnesses, list) or not witnesses:
            findings.append(
                Finding(
                    "claimed-scenario-not-instantiated",
                    f"/scenario_claims/{index}/instance_ref",
                    "claim instantiated precisa de witnesses existentes",
                )
            )
            continue
        if any(not isinstance(ref, str) or ref not in indexes.record_ids for ref in witnesses):
            findings.append(
                Finding(
                    "claimed-scenario-not-instantiated",
                    f"/scenario_claims/{index}/instance_ref",
                    "claim instantiated precisa de witnesses existentes",
                )
            )
    return findings


def check_ambiguous_occurrence_identity_or_time(
    document: Mapping[str, Any], indexes: DocumentIndexes
) -> list[Finding]:
    del indexes
    findings: list[Finding] = []
    seen: dict[str, int] = {}
    for index, occurrence in enumerate(document.get("occurrences", [])):
        occurrence_id = occurrence.get("id")
        if not isinstance(occurrence_id, str) or not occurrence_id or occurrence_id in seen:
            findings.append(
                Finding(
                    "ambiguous-occurrence-identity-or-time",
                    f"/occurrences/{index}/id",
                    "ocorrência precisa de ID único",
                )
            )
        else:
            seen[occurrence_id] = index
        if not occurrence.get("occurred_at") and not occurrence.get("valid_on"):
            findings.append(
                Finding(
                    "ambiguous-occurrence-identity-or-time",
                    f"/occurrences/{index}",
                    "ocorrência precisa de occurred_at ou valid_on",
                )
            )
    return findings


def check_gap_owner_exists_but_marked_unknown(
    document: Mapping[str, Any], indexes: DocumentIndexes
) -> list[Finding]:
    del indexes
    findings: list[Finding] = []
    owners = document.get("owners", [])
    for index, gap in enumerate(document.get("gaps", [])):
        owner = gap.get("owner")
        if not isinstance(owner, Mapping) or owner.get("status") != "unknown":
            continue
        required = set(gap.get("required_scopes") or [])
        for registered in owners:
            scopes = set(registered.get("scopes") or [])
            if required and required <= scopes:
                findings.append(
                    Finding(
                        "gap-owner-exists-but-marked-unknown",
                        f"/gaps/{index}/owner",
                        "gap unknown não pode coexistir com owner que cobre required_scopes",
                    )
                )
                break
    return findings


def check_stale_approval_accepted(
    document: Mapping[str, Any], indexes: DocumentIndexes
) -> list[Finding]:
    findings: list[Finding] = []
    for index, action in enumerate(document.get("actions", [])):
        approval_ref = action.get("approval_ref")
        if not isinstance(approval_ref, str) or action.get("result") != "accepted":
            continue
        approval = indexes.approvals.get(approval_ref)
        if approval is None:
            continue
        if action.get("basis_ref") != approval.get("basis_ref"):
            findings.append(
                Finding(
                    "stale-approval-accepted",
                    f"/actions/{index}/basis_ref",
                    "Action aceita não pode usar aprovação cujo basis_ref diverge",
                )
            )
    return findings


def check_timeout_collapsed_to_failed(
    document: Mapping[str, Any], indexes: DocumentIndexes
) -> list[Finding]:
    del indexes
    findings: list[Finding] = []
    for index, attempt in enumerate(document.get("effect_attempts", [])):
        if attempt.get("transport_result") != "timeout":
            continue
        if attempt.get("knowledge_state") != "unknown":
            findings.append(
                Finding(
                    "timeout-collapsed-to-failed",
                    f"/effect_attempts/{index}/knowledge_state",
                    "timeout de transporte mantém knowledge_state unknown",
                )
            )
    return findings


RULE_CHECKS: tuple[RuleCheck, ...] = (
    check_missing_action_actor_or_grant,
    check_workload_used_as_business_actor,
    check_responsibility_without_source_or_epistemic_label,
    check_claimed_scenario_not_instantiated,
    check_ambiguous_occurrence_identity_or_time,
    check_gap_owner_exists_but_marked_unknown,
    check_stale_approval_accepted,
    check_timeout_collapsed_to_failed,
)


def evaluate_semantic_rules(document: Mapping[str, Any]) -> list[Finding]:
    indexes = build_indexes(document)
    findings: list[Finding] = []
    for check in RULE_CHECKS:
        findings.extend(check(document, indexes))
    return sorted(findings, key=lambda item: (item.code, item.json_pointer, item.message))


def validate_loaded_document(
    document: Mapping[str, Any], validator: Draft202012Validator
) -> list[Finding]:
    schema_findings = collect_schema_findings(document, validator)
    if schema_findings:
        return schema_findings
    return evaluate_semantic_rules(document)


def load_json_file(path: Path) -> tuple[Any | None, Finding | None]:
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return None, Finding("invalid-json", "", "JSON inválido: o arquivo precisa usar UTF-8")
    except OSError as exc:
        return None, Finding("unreadable-input", "", f"não foi possível ler o arquivo: {exc.strerror}")
    try:
        return json.loads(text), None
    except json.JSONDecodeError as exc:
        return None, Finding("invalid-json", "", f"JSON inválido: {exc.msg}")


def validate_path(raw_path: str, validator: Draft202012Validator) -> tuple[dict[str, Any], str]:
    path = Path(raw_path)
    document, error = load_json_file(path)
    if error is not None:
        return _error_result(raw_path, error.code, error.message), "error"
    if not isinstance(document, Mapping):
        return _error_result(raw_path, "invalid-json", "o documento precisa ser um objeto JSON"), "error"
    findings = validate_loaded_document(document, validator)
    return {
        "findings": [finding.as_dict() for finding in findings],
        "path": raw_path,
        "valid": not findings,
    }, "invalid" if findings else "valid"


def build_parser() -> JsonArgumentParser:
    parser = JsonArgumentParser(
        prog="validate_casebook.py",
        description=(
            "Valida fixtures JSON de eventos e claims do piloto de Casebook estruturado. "
            "O schema é carregado do diretório do validador. Não há flag para schema alternativo."
        ),
        epilog=HELP_EPILOG,
        formatter_class=argparse.RawDescriptionHelpFormatter,
        add_help=False,
    )
    parser.add_argument("-h", "--help", action="help", help="mostra esta ajuda e sai")
    parser.add_argument(
        "paths",
        nargs="*",
        help="um ou mais arquivos JSON da fixture",
    )
    return parser


def run(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if not args.paths:
        write_report(
            "error",
            [_error_result("", "usage-error", "informe um ou mais arquivos JSON")],
        )
        return 2
    try:
        validator = load_schema_validator()
    except (OSError, json.JSONDecodeError, SchemaError) as exc:
        write_report(
            "error",
            [_error_result(SCHEMA_PATH.name, "internal-error", f"falha ao carregar o schema: {exc}")],
        )
        return 3
    results: list[dict[str, Any]] = []
    statuses: list[str] = []
    for raw_path in args.paths:
        result, status = validate_path(raw_path, validator)
        results.append(result)
        statuses.append(status)
    if "error" in statuses:
        write_report("error", results)
        return 2
    if "invalid" in statuses:
        write_report("invalid", results)
        return 1
    write_report("valid", results)
    return 0


def main() -> int:
    try:
        return run()
    except Exception as exc:
        write_report(
            "error",
            [_error_result("", "internal-error", f"erro interno do validator: {exc}")],
        )
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
