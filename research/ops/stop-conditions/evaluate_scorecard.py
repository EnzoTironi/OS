#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError, ValidationError

HERE = Path(__file__).resolve().parent
SCHEMA_PATH = HERE / "scorecard.schema.json"
CRITERIA_PATH = HERE / "criteria.json"

EXIT_OK = 0
EXIT_INVALID = 1
EXIT_INPUT = 2
EXIT_INTERNAL = 3

USAGE = "uso: evaluate_scorecard.py CAMINHO [CAMINHO ...]"
HELP = """Avalia assessments de readiness do corpus de pesquisa.

uso: evaluate_scorecard.py CAMINHO [CAMINHO ...]
     evaluate_scorecard.py --help

O scorecard autoriza pesquisa experimental e comparação.
Ele não escolhe stack, linguagem, metamodelo, R5, R6 ou arquitetura.

Códigos de saída:
  0  assessments válidas
  1  violação de schema ou critério
  2  uso, leitura, decode ou parse de input
  3  erro interno
"""
UTF8_INPUT_MESSAGE = "JSON inválido: o arquivo precisa usar UTF-8"
NOT_OBJECT_MESSAGE = "o documento precisa ser um objeto JSON"
UNREADABLE_MESSAGE = "arquivo ilegível"
INTERNAL_SCHEMA_MESSAGE = "falha ao carregar schema"
INTERNAL_CRITERIA_MESSAGE = "falha ao carregar o catálogo de critérios"


class InputError(Exception):
    def __init__(self, code: str, message: str, path: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.path = path


class InternalError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


def dotted_get(document: Any, path: str) -> Any:
    current = document
    for part in path.split("."):
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return current


def locator_complete(locator: Any) -> bool:
    if not isinstance(locator, dict):
        return False
    path = locator.get("path")
    anchor = locator.get("anchor")
    return isinstance(path, str) and bool(path) and isinstance(anchor, str) and bool(anchor)


def collect_locators(assessment: dict[str, Any]) -> list[tuple[str, Any]]:
    found: list[tuple[str, Any]] = []
    for index, item in enumerate(assessment.get("evidence_items") or []):
        found.append((f"/evidence_items/{index}/locator", item.get("locator")))
    for index, item in enumerate(assessment.get("open_questions") or []):
        found.append((f"/open_questions/{index}/locator", item.get("locator")))
    for index, item in enumerate(assessment.get("criteria") or []):
        for locator_index, locator in enumerate(item.get("locators") or []):
            found.append(
                (f"/criteria/{index}/locators/{locator_index}", locator)
            )
    found.append(
        (
            "/architectural_promotion_case/governance_process",
            dotted_get(assessment, "architectural_promotion_case.governance_process"),
        )
    )
    return found


def incomplete_locator_pointer(assessment: dict[str, Any]) -> str:
    for pointer, locator in collect_locators(assessment):
        if not locator_complete(locator):
            return pointer
    return ""


def match_clause(assessment: dict[str, Any], catalog: dict[str, Any], clause: dict[str, Any]) -> bool:
    results = []
    for name, expected in clause.items():
        if name == "all":
            results.append(all(match_clause(assessment, catalog, item) for item in expected))
        elif name == "empty_field":
            value = dotted_get(assessment, expected)
            results.append(not value)
        elif name == "nonempty_field":
            value = dotted_get(assessment, expected)
            results.append(bool(value))
        elif name == "field_equals":
            path, wanted = expected
            results.append(dotted_get(assessment, path) == wanted)
        elif name == "candidate_count_equals":
            candidates = dotted_get(assessment, "stack_bakeoff_case.candidates") or []
            results.append(len(candidates) == expected)
        elif name == "any_locator_incomplete":
            results.append(bool(incomplete_locator_pointer(assessment)) is bool(expected))
        elif name == "required_open_question_missing":
            present = {item.get("id") for item in assessment.get("open_questions") or []}
            required = {item["id"] for item in catalog.get("required_open_questions") or []}
            results.append(bool(required - present) is bool(expected))
        elif name == "any_equals":
            results.append(any(dotted_get(assessment, path) == wanted for path, wanted in expected))
        else:
            raise InternalError(f"predicado desconhecido no catálogo: {name}")
    return all(results)


def require_holds(name: str, expected: Any, assessment: dict[str, Any], gate: str) -> bool:
    if name == "every_criterion_status":
        statuses = [
            item.get("status")
            for item in assessment.get("criteria") or []
            if item.get("gate") == gate
        ]
        return bool(statuses) and all(status == expected for status in statuses)
    if name == "blocking_question_count":
        blocked = [
            item
            for item in assessment.get("open_questions") or []
            if gate in (item.get("blocks") or [])
        ]
        return len(blocked) == expected
    if name == "min_candidates":
        candidates = dotted_get(assessment, "stack_bakeoff_case.candidates") or []
        return len(candidates) >= expected
    if name == "source_shaped_exceptions":
        return dotted_get(assessment, "stack_bakeoff_case.source_shaped_exceptions") is expected
    if name == "adoption_claim":
        return dotted_get(assessment, "architectural_promotion_case.adoption_claim") == expected
    raise InternalError(f"requisito desconhecido no catálogo: {name}")


def derive_gate(gate: str, policy: dict[str, Any], assessment: dict[str, Any]) -> str:
    for rule in policy["rules"]:
        if rule.get("default"):
            return rule["result"]
        required = rule.get("require") or {}
        if all(require_holds(name, expected, assessment, gate) for name, expected in required.items()):
            return rule["result"]
    raise InternalError(f"nenhuma regra de derivação fechou o gate {gate}")


def json_pointer(error: ValidationError) -> str:
    parts = [""]
    for item in error.absolute_path:
        parts.append(str(item))
    if len(parts) == 1:
        return ""
    return "/".join(parts)


def load_user_json(path: Path) -> dict[str, Any]:
    try:
        raw = path.read_bytes()
    except OSError as exc:
        raise InputError("unreadable-input", UNREADABLE_MESSAGE, str(path)) from exc
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise InputError("invalid-json", UTF8_INPUT_MESSAGE, str(path)) from exc
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise InputError("invalid-json", f"JSON inválido: {exc.msg}", str(path)) from exc
    if not isinstance(data, dict):
        raise InputError("invalid-json", NOT_OBJECT_MESSAGE, str(path))
    return data


def load_packaged_json(path: Path, message: str) -> dict[str, Any]:
    try:
        raw = path.read_bytes()
    except OSError as exc:
        raise InternalError(message) from exc
    try:
        data = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise InternalError(message) from exc
    if not isinstance(data, dict):
        raise InternalError(message)
    return data


def finding(
    code: str,
    message: str,
    path: str,
    pointer: str,
) -> dict[str, Any]:
    return {
        "code": code,
        "message": message,
        "path": path,
        "pointer": pointer,
    }


def catalog_findings(assessment: dict[str, Any], catalog: dict[str, Any], source: str) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    evidence_ids = [item.get("id") for item in assessment.get("evidence_items") or []]
    if len(evidence_ids) != len(set(evidence_ids)):
        found.append(finding("duplicate-evidence-id", "IDs de evidência precisam ser únicos.", source, "/evidence_items"))
    question_ids = [item.get("id") for item in assessment.get("open_questions") or []]
    if len(question_ids) != len(set(question_ids)):
        found.append(finding("duplicate-question-id", "IDs de questão precisam ser únicos.", source, "/open_questions"))

    declared = {item.get("criterion_id"): item for item in assessment.get("criteria") or []}
    expected = {item["criterion_id"]: item for item in catalog["criteria"]}
    missing = sorted(set(expected) - set(declared))
    extra = sorted(set(declared) - set(expected))
    if missing:
        found.append(
            finding(
                "missing-criterion",
                f"Faltam critérios do catálogo: {', '.join(missing)}.",
                source,
                "/criteria",
            )
        )
    if extra:
        found.append(
            finding(
                "unknown-criterion",
                f"Critérios fora do catálogo: {', '.join(extra)}.",
                source,
                "/criteria",
            )
        )
    for criterion_id, spec in expected.items():
        item = declared.get(criterion_id)
        if item is None:
            continue
        if item.get("gate") != spec["gate"]:
            found.append(
                finding(
                    "criterion-gate-mismatch",
                    f"{criterion_id} pertence ao gate {spec['gate']}.",
                    source,
                    f"/criteria/{criterion_id}",
                )
            )
        for ref in item.get("evidence_refs") or []:
            if ref not in evidence_ids:
                found.append(
                    finding(
                        "evidence-ref-unresolved",
                        f"{criterion_id} aponta para {ref}, que não existe.",
                        source,
                        f"/criteria/{criterion_id}/evidence_refs",
                    )
                )

    for check in catalog["checks"]:
        if match_clause(assessment, catalog, check["when"]):
            pointer = check["pointer"]
            if check["finding"] == "locator-missing":
                pointer = incomplete_locator_pointer(assessment)
            found.append(finding(check["finding"], check["message"], source, pointer))
    return found


def evaluate_assessment(
    assessment: dict[str, Any],
    catalog: dict[str, Any],
    source: str,
    validator: Draft202012Validator,
) -> dict[str, Any]:
    findings: list[dict[str, Any]] = []
    for error in sorted(validator.iter_errors(assessment), key=lambda item: list(item.absolute_path)):
        findings.append(
            finding(
                "schema-violation",
                error.message,
                source,
                json_pointer(error),
            )
        )
    if findings:
        return {
            "path": source,
            "assessment_id": assessment.get("assessment_id"),
            "valid": False,
            "gate_results": None,
            "findings": sort_findings(findings),
        }

    findings.extend(catalog_findings(assessment, catalog, source))
    derived: dict[str, str] = {}
    for gate, policy in catalog["derivation"].items():
        derived[gate] = derive_gate(gate, policy, assessment)
        if derived[gate] not in policy["allowed_results"]:
            findings.append(
                finding(
                    "illegal-gate-result",
                    f"O gate {gate} não pode resultar em {derived[gate]}.",
                    source,
                    f"/gate_results/{gate}",
                )
            )
        declared = (assessment.get("gate_results") or {}).get(gate)
        if declared != derived[gate]:
            findings.append(
                finding(
                    "gate-results-mismatch",
                    f"O gate {gate} deriva {derived[gate]}, não {declared}.",
                    source,
                    f"/gate_results/{gate}",
                )
            )

    findings = sort_findings(findings)
    return {
        "path": source,
        "assessment_id": assessment.get("assessment_id"),
        "valid": not findings,
        "gate_results": derived,
        "findings": findings,
    }


def sort_findings(findings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(findings, key=lambda item: (item["code"], item["path"], item["pointer"], item["message"]))


def emit(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))


def error_payload(code: str, message: str, path: str) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "status": "error",
        "findings": [
            {
                "code": code,
                "message": message,
                "path": path,
                "pointer": "",
                "valid": False,
            }
        ],
    }


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if args and args[0] in {"-h", "--help"}:
        print(HELP, end="")
        return EXIT_OK
    if not args:
        print(USAGE, file=sys.stderr)
        emit(error_payload("usage", USAGE, ""))
        return EXIT_INPUT

    try:
        schema = load_packaged_json(SCHEMA_PATH, INTERNAL_SCHEMA_MESSAGE)
        catalog = load_packaged_json(CRITERIA_PATH, INTERNAL_CRITERIA_MESSAGE)
        try:
            validator = Draft202012Validator(
                schema,
                format_checker=Draft202012Validator.FORMAT_CHECKER,
            )
        except SchemaError as exc:
            raise InternalError(INTERNAL_SCHEMA_MESSAGE) from exc
        if "criteria" not in catalog or "derivation" not in catalog or "checks" not in catalog:
            raise InternalError(INTERNAL_CRITERIA_MESSAGE)
    except InternalError as exc:
        emit(error_payload("internal-error", exc.message, str(SCHEMA_PATH)))
        return EXIT_INTERNAL

    assessments: list[dict[str, Any]] = []
    try:
        for raw_path in args:
            path = Path(raw_path)
            document = load_user_json(path)
            assessments.append(evaluate_assessment(document, catalog, str(path), validator))
    except InputError as exc:
        emit(error_payload(exc.code, exc.message, exc.path))
        return EXIT_INPUT

    all_findings = [item for result in assessments for item in result["findings"]]
    payload = {
        "schema_version": 1,
        "status": "valid" if not all_findings else "invalid",
        "assessments": assessments,
        "findings": sort_findings(all_findings),
    }
    emit(payload)
    return EXIT_OK if payload["status"] == "valid" else EXIT_INVALID


if __name__ == "__main__":
    raise SystemExit(main())
