#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError, ValidationError

HERE = Path(__file__).resolve().parent
SCHEMA_PATH = HERE / "scorecard.schema.json"
CRITERIA_SCHEMA_PATH = HERE / "criteria.schema.json"
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

O input v2 declara fatos, evidence items, questões abertas e cases.
Criteria, rationale e gate_results são output derivado.

Códigos de saída:
  0  assessment estruturalmente válida, inclusive com gate em block
  1  contrato da assessment inválido
  2  uso, leitura, decode ou parse de input
  3  schema ou catálogo empacotado inválido
"""
UTF8_INPUT_MESSAGE = "JSON inválido: o arquivo precisa usar UTF-8"
NOT_OBJECT_MESSAGE = "o documento precisa ser um objeto JSON"
UNREADABLE_MESSAGE = "arquivo ilegível"
INTERNAL_SCHEMA_MESSAGE = "falha ao carregar schema"
INTERNAL_CRITERIA_MESSAGE = "falha ao carregar o catálogo de critérios"
INTERNAL_CRITERIA_SCHEMA_MESSAGE = "falha ao carregar o schema do catálogo"
UNKNOWN_OPERATOR_MESSAGE = "operador desconhecido no catálogo"
UNRESOLVED_PACKAGED_REF_MESSAGE = "referência empacotada não resolvida"
INVALID_METASCHEMA_MESSAGE = "schema empacotado inválido no metaschema"

EVIDENCE_REF_PREFIX = "E-"
OPERATORS = {
    "all",
    "any",
    "not",
    "field_nonempty",
    "field_equals",
    "paths_equal",
    "min_items",
    "min_distinct",
    "min_resolved_refs",
    "each_item_resolved_refs",
    "no_blocker",
    "every_derived_status",
}


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


@dataclass
class EvalFact:
    code: str
    message: str
    refs: list[str] = field(default_factory=list)


@dataclass
class EvalResult:
    ok: bool
    facts: list[EvalFact] = field(default_factory=list)


@dataclass
class RuntimeContext:
    assessment: dict[str, Any]
    evidence_ids: set[str]
    blockers: dict[str, list[str]]
    derived_criteria: list[dict[str, Any]]


def dotted_get(document: Any, path: str) -> Any:
    current = document
    for part in path.split("."):
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return current


def field_present(value: Any) -> bool:
    if value is None:
        return False
    if value == "":
        return False
    if value == []:
        return False
    if value == {}:
        return False
    return True


def as_ref_list(value: Any) -> list[str]:
    if isinstance(value, str) and value:
        return [value]
    if isinstance(value, list):
        return [item for item in value if isinstance(item, str) and item]
    return []


def json_pointer(error: ValidationError) -> str:
    parts = [""]
    for item in error.absolute_path:
        parts.append(str(item))
    if len(parts) == 1:
        return ""
    return "/".join(parts)


def finding(code: str, message: str, path: str, pointer: str) -> dict[str, Any]:
    return {
        "code": code,
        "message": message,
        "path": path,
        "pointer": pointer,
    }


def sort_findings(findings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        findings,
        key=lambda item: (item["code"], item["path"], item["pointer"], item["message"]),
    )


def emit(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))


def error_payload(code: str, message: str, path: str) -> dict[str, Any]:
    return {
        "schema_version": 2,
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


def collect_packaged_refs(node: Any) -> list[str]:
    found: list[str] = []
    if isinstance(node, dict):
        ref = node.get("$ref")
        if isinstance(ref, str):
            found.append(ref)
        for value in node.values():
            found.extend(collect_packaged_refs(value))
    elif isinstance(node, list):
        for item in node:
            found.extend(collect_packaged_refs(item))
    return found


def resolve_internal_pointer(document: dict[str, Any], pointer: str) -> Any:
    if not pointer.startswith("#/"):
        return None
    current: Any = document
    for part in pointer[2:].split("/"):
        part = part.replace("~1", "/").replace("~0", "~")
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return current


def assert_packaged_refs(document: dict[str, Any], message: str) -> None:
    for ref in collect_packaged_refs(document):
        if ref.startswith("#/") and resolve_internal_pointer(document, ref) is None:
            raise InternalError(message)


def walk_operator_names(expr: Any) -> set[str]:
    names: set[str] = set()
    if not isinstance(expr, dict) or len(expr) != 1:
        raise InternalError(UNKNOWN_OPERATOR_MESSAGE)
    name, payload = next(iter(expr.items()))
    names.add(name)
    if name not in OPERATORS:
        raise InternalError(UNKNOWN_OPERATOR_MESSAGE)
    if name in {"all", "any"}:
        if not isinstance(payload, list):
            raise InternalError(UNKNOWN_OPERATOR_MESSAGE)
        for item in payload:
            names.update(walk_operator_names(item))
    elif name == "not":
        names.update(walk_operator_names(payload))
    return names


def display_value(value: Any) -> str:
    if value is True:
        return "true"
    if value is False:
        return "false"
    if value is None:
        return "null"
    return str(value)


def refs_phrase(count: int) -> str:
    if count == 1:
        return "1 referência resolvida"
    return f"{count} referências resolvidas"


def validate_packaged_schema(schema: dict[str, Any], path: Path) -> Draft202012Validator:
    try:
        Draft202012Validator.check_schema(schema)
    except SchemaError as exc:
        raise InternalError(INVALID_METASCHEMA_MESSAGE) from exc
    assert_packaged_refs(schema, UNRESOLVED_PACKAGED_REF_MESSAGE)
    try:
        return Draft202012Validator(
            schema,
            format_checker=Draft202012Validator.FORMAT_CHECKER,
        )
    except SchemaError as exc:
        raise InternalError(INTERNAL_SCHEMA_MESSAGE) from exc


def load_packaged() -> tuple[Draft202012Validator, dict[str, Any]]:
    schema = load_packaged_json(SCHEMA_PATH, INTERNAL_SCHEMA_MESSAGE)
    criteria_schema = load_packaged_json(CRITERIA_SCHEMA_PATH, INTERNAL_CRITERIA_SCHEMA_MESSAGE)
    catalog = load_packaged_json(CRITERIA_PATH, INTERNAL_CRITERIA_MESSAGE)
    validator = validate_packaged_schema(schema, SCHEMA_PATH)
    catalog_validator = validate_packaged_schema(criteria_schema, CRITERIA_SCHEMA_PATH)
    catalog_errors = sorted(
        catalog_validator.iter_errors(catalog),
        key=lambda item: list(item.absolute_path),
    )
    if catalog_errors:
        raise InternalError(INTERNAL_CRITERIA_MESSAGE)
    for criterion in catalog.get("criteria") or []:
        for rule in criterion.get("rules") or []:
            if "when" in rule:
                walk_operator_names(rule["when"])
    for policy in (catalog.get("gates") or {}).values():
        for rule in policy.get("rules") or []:
            if "when" in rule:
                walk_operator_names(rule["when"])
    return validator, catalog


def run_git(*args: str, cwd: Path) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(
        ["git", *args],
        cwd=cwd,
        capture_output=True,
        shell=False,
    )


def repository_root() -> Path:
    result = run_git("rev-parse", "--show-toplevel", cwd=HERE)
    if result.returncode != 0:
        raise InternalError("repositório git não encontrado")
    return Path(result.stdout.decode("utf-8").strip())


def commit_sha(ref: str, root: Path) -> str | None:
    result = run_git("rev-parse", "--verify", f"{ref}^{{commit}}", cwd=root)
    if result.returncode != 0:
        return None
    return result.stdout.decode("utf-8").strip()


def blob_bytes(sha: str, path: str, root: Path) -> bytes | None:
    result = run_git("cat-file", "blob", f"{sha}:{path}", cwd=root)
    if result.returncode != 0:
        return None
    return result.stdout


def walk_nodes(node: Any, pointer: str = "") -> list[tuple[str, Any]]:
    found = [(pointer, node)]
    if isinstance(node, dict):
        for key, value in node.items():
            found.extend(walk_nodes(value, f"{pointer}/{key}"))
    elif isinstance(node, list):
        for index, item in enumerate(node):
            found.extend(walk_nodes(item, f"{pointer}/{index}"))
    return found


def collect_evidence_refs(assessment: dict[str, Any]) -> list[tuple[str, str]]:
    skip_prefixes = ("/evidence_items/",)
    found: list[tuple[str, str]] = []
    for pointer, value in walk_nodes(assessment):
        if not isinstance(value, str) or not value.startswith(EVIDENCE_REF_PREFIX):
            continue
        if any(pointer.startswith(prefix) and pointer.endswith("/id") for prefix in skip_prefixes):
            continue
        found.append((pointer, value))
    return found


def parse_assessed_at(value: str) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def resolve_target(assessment: dict[str, Any], source: str, root: Path) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    target = assessment.get("assessed_target") or {}
    sha = target.get("sha")
    ref = target.get("ref")
    if not isinstance(sha, str) or commit_sha(sha, root) is None:
        found.append(
            finding(
                "target-sha-missing",
                "O SHA avaliado não existe como commit.",
                source,
                "/assessed_target/sha",
            )
        )
        return found
    if not isinstance(ref, str):
        found.append(
            finding(
                "target-ref-unresolved",
                "A ref avaliada não resolve para um commit.",
                source,
                "/assessed_target/ref",
            )
        )
        return found
    resolved = commit_sha(ref, root)
    if resolved is None:
        found.append(
            finding(
                "target-ref-unresolved",
                "A ref avaliada não resolve para um commit.",
                source,
                "/assessed_target/ref",
            )
        )
        return found
    if resolved != sha:
        found.append(
            finding(
                "target-ref-mismatch",
                "A ref avaliada resolve para um SHA diferente do informado.",
                source,
                "/assessed_target/ref",
            )
        )
    return found


def resolve_locators(
    locators: list[tuple[str, dict[str, Any]]],
    sha: str,
    source: str,
    root: Path,
) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    for pointer, locator in locators:
        path = locator.get("path")
        anchor = locator.get("anchor")
        if not isinstance(path, str) or not path or not isinstance(anchor, str) or not anchor:
            found.append(
                finding(
                    "locator-unresolved",
                    "Todo locator contado precisa de path e âncora não vazios.",
                    source,
                    pointer,
                )
            )
            continue
        blob = blob_bytes(sha, path, root)
        if blob is None:
            found.append(
                finding(
                    "locator-path-missing",
                    f"O path {path} não existe no tree do SHA avaliado.",
                    source,
                    f"{pointer}/path",
                )
            )
            continue
        if anchor.encode("utf-8") not in blob:
            found.append(
                finding(
                    "locator-anchor-missing",
                    "A âncora não ocorre como texto literal no blob do SHA avaliado.",
                    source,
                    f"{pointer}/anchor",
                )
            )
    return found


def uniqueness_findings(assessment: dict[str, Any], source: str) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    evidence_ids = [item.get("id") for item in assessment.get("evidence_items") or []]
    if len(evidence_ids) != len(set(evidence_ids)):
        found.append(
            finding(
                "duplicate-evidence-id",
                "IDs de evidência precisam ser únicos.",
                source,
                "/evidence_items",
            )
        )
    question_ids = [item.get("id") for item in assessment.get("open_questions") or []]
    if len(question_ids) != len(set(question_ids)):
        found.append(
            finding(
                "duplicate-question-id",
                "IDs de questão precisam ser únicos.",
                source,
                "/open_questions",
            )
        )
    return found


def derive_blockers(
    assessment: dict[str, Any],
    catalog: dict[str, Any],
    evidence_ids: set[str],
    source: str,
) -> tuple[dict[str, list[str]], list[dict[str, Any]]]:
    findings: list[dict[str, Any]] = []
    present = {
        item.get("id"): item
        for item in assessment.get("open_questions") or []
        if isinstance(item, dict)
    }
    blockers: dict[str, list[str]] = {}
    required_ids = [item["id"] for item in catalog["required_open_questions"]]
    missing = [question_id for question_id in required_ids if question_id not in present]
    if missing:
        findings.append(
            finding(
                "blocking-question-omitted",
                "A assessment omitiu uma questão bloqueante exigida pelo catálogo.",
                source,
                "/open_questions",
            )
        )
    catalog_ids = {item["id"] for item in catalog["required_open_questions"]}
    extras = sorted(set(present) - catalog_ids)
    if extras:
        findings.append(
            finding(
                "unknown-question",
                f"Questões fora do catálogo: {', '.join(extras)}.",
                source,
                "/open_questions",
            )
        )
    for spec in catalog["required_open_questions"]:
        question_id = spec["id"]
        item = present.get(question_id)
        if item is None:
            for gate in spec["gates"]:
                blockers.setdefault(gate, []).append(question_id)
            continue
        state = item.get("state")
        limit_refs = as_ref_list(item.get("limit_refs"))
        resolved_limits = [ref for ref in limit_refs if ref in evidence_ids]
        if state == "limited":
            if not resolved_limits:
                findings.append(
                    finding(
                        "question-limit-unresolved",
                        f"{question_id} limitada precisa de refs de limitação resolvidas.",
                        source,
                        f"/open_questions/{question_id}/limit_refs",
                    )
                )
                for gate in spec["gates"]:
                    blockers.setdefault(gate, []).append(question_id)
            continue
        for gate in spec["gates"]:
            blockers.setdefault(gate, []).append(question_id)
    return blockers, findings


def eval_expression(expr: dict[str, Any], ctx: RuntimeContext) -> EvalResult:
    if not isinstance(expr, dict) or len(expr) != 1:
        raise InternalError(UNKNOWN_OPERATOR_MESSAGE)
    name, payload = next(iter(expr.items()))
    if name not in OPERATORS:
        raise InternalError(UNKNOWN_OPERATOR_MESSAGE)
    if name == "all":
        facts: list[EvalFact] = []
        ok = True
        for item in payload:
            result = eval_expression(item, ctx)
            facts.extend(result.facts)
            ok = ok and result.ok
        return EvalResult(ok, facts)
    if name == "any":
        facts = []
        ok = False
        for item in payload:
            result = eval_expression(item, ctx)
            facts.extend(result.facts)
            ok = ok or result.ok
        return EvalResult(ok, facts)
    if name == "not":
        result = eval_expression(payload, ctx)
        return EvalResult(not result.ok, result.facts)
    if name == "field_nonempty":
        path = payload
        present = field_present(dotted_get(ctx.assessment, path))
        message = (
            f"O campo {path} está preenchido."
            if present
            else f"O campo {path} está vazio."
        )
        return EvalResult(
            present,
            [EvalFact("field-nonempty" if present else "field-empty", message)],
        )
    if name == "field_equals":
        path = payload["path"]
        expected = payload["value"]
        actual = dotted_get(ctx.assessment, path)
        ok = actual == expected
        rendered = display_value(expected)
        message = (
            f"O campo {path} é {rendered}."
            if ok
            else f"O campo {path} não é {rendered}."
        )
        return EvalResult(
            ok,
            [EvalFact("field-equals" if ok else "field-not-equals", message)],
        )
    if name == "paths_equal":
        left = payload["left"]
        right = payload["right"]
        ok = dotted_get(ctx.assessment, left) == dotted_get(ctx.assessment, right)
        message = (
            f"Os campos {left} e {right} são iguais."
            if ok
            else f"Os campos {left} e {right} diferem."
        )
        return EvalResult(
            ok,
            [EvalFact("paths-equal" if ok else "paths-differ", message)],
        )
    if name == "min_items":
        path = payload["path"]
        count = payload["count"]
        value = dotted_get(ctx.assessment, path)
        actual = len(value) if isinstance(value, list) else 0
        ok = actual >= count
        message = (
            f"A coleção {path} tem pelo menos {count} itens."
            if ok
            else f"A coleção {path} tem {actual} itens, abaixo de {count}."
        )
        return EvalResult(ok, [EvalFact("min-items" if ok else "min-items-short", message)])
    if name == "min_distinct":
        path = payload["path"]
        field_name = payload["field"]
        count = payload["count"]
        value = dotted_get(ctx.assessment, path)
        values = []
        if isinstance(value, list):
            for item in value:
                if isinstance(item, dict) and field_name in item:
                    values.append(item[field_name])
        actual = len(set(values))
        ok = actual >= count
        message = (
            f"A coleção {path} tem pelo menos {count} valores distintos em {field_name}."
            if ok
            else f"A coleção {path} tem {actual} valores distintos em {field_name}, abaixo de {count}."
        )
        return EvalResult(
            ok,
            [EvalFact("min-distinct" if ok else "min-distinct-short", message)],
        )
    if name == "min_resolved_refs":
        path = payload["path"]
        count = payload["count"]
        refs = [ref for ref in as_ref_list(dotted_get(ctx.assessment, path)) if ref in ctx.evidence_ids]
        ok = len(refs) >= count
        message = (
            f"Há pelo menos {refs_phrase(count)} em {path}."
            if ok
            else f"Há {refs_phrase(len(refs))} em {path}, abaixo de {count}."
        )
        return EvalResult(
            ok,
            [EvalFact("min-resolved-refs" if ok else "min-resolved-refs-short", message, refs)],
        )
    if name == "each_item_resolved_refs":
        path = payload["path"]
        field_name = payload["field"]
        count = payload["count"]
        value = dotted_get(ctx.assessment, path)
        items = value if isinstance(value, list) else []
        refs: list[str] = []
        ok = bool(items)
        for item in items:
            item_refs = []
            if isinstance(item, dict):
                item_refs = [
                    ref
                    for ref in as_ref_list(item.get(field_name))
                    if ref in ctx.evidence_ids
                ]
            refs.extend(item_refs)
            if len(item_refs) < count:
                ok = False
        message = (
            f"Cada item de {path} tem refs resolvidas em {field_name}."
            if ok
            else f"Há item em {path} sem o mínimo de refs resolvidas em {field_name}."
        )
        return EvalResult(
            ok,
            [EvalFact("each-item-resolved-refs" if ok else "each-item-resolved-refs-short", message, refs)],
        )
    if name == "no_blocker":
        gate = payload["gate"]
        blocked = ctx.blockers.get(gate) or []
        ok = not blocked
        message = (
            f"Não há blocker derivado para {gate}."
            if ok
            else f"Há blocker derivado para {gate}."
        )
        return EvalResult(ok, [EvalFact("no-blocker" if ok else "has-blocker", message)])
    if name == "every_derived_status":
        gate = payload["gate"]
        status = payload["status"]
        items = [item for item in ctx.derived_criteria if item.get("gate") == gate]
        ok = bool(items) and all(item.get("status") == status for item in items)
        message = (
            f"Todos os critérios de {gate} resultaram em {status}."
            if ok
            else f"Os critérios de {gate} não resultaram todos em {status}."
        )
        return EvalResult(
            ok,
            [EvalFact("every-derived-status" if ok else "derived-status-short", message)],
        )
    raise InternalError(UNKNOWN_OPERATOR_MESSAGE)


def first_matching_rule(rules: list[dict[str, Any]], ctx: RuntimeContext) -> tuple[dict[str, Any], EvalResult]:
    for rule in rules:
        if rule.get("default"):
            return rule, EvalResult(True, [EvalFact("default-rule", "Nenhuma regra anterior fechou o resultado.")])
        result = eval_expression(rule["when"], ctx)
        if result.ok:
            return rule, result
    raise InternalError("nenhuma regra de derivação fechou o resultado")


def derive_criteria(catalog: dict[str, Any], ctx: RuntimeContext) -> list[dict[str, Any]]:
    derived: list[dict[str, Any]] = []
    for spec in catalog["criteria"]:
        rule, result = first_matching_rule(spec["rules"], ctx)
        refs: list[str] = []
        for fact in result.facts:
            for ref in fact.refs:
                if ref not in refs:
                    refs.append(ref)
        if result.facts:
            rationale = {
                "code": result.facts[0].code,
                "message": " ".join(fact.message for fact in result.facts),
            }
        else:
            rationale = {
                "code": "default-rule",
                "message": "Nenhuma regra anterior fechou o resultado.",
            }
        derived.append(
            {
                "criterion_id": spec["criterion_id"],
                "gate": spec["gate"],
                "status": rule["status"],
                "evidence_refs": refs,
                "rationale": rationale,
            }
        )
    return derived


def derive_gates(catalog: dict[str, Any], ctx: RuntimeContext) -> dict[str, str]:
    derived: dict[str, str] = {}
    for gate, policy in catalog["gates"].items():
        rule, _result = first_matching_rule(policy["rules"], ctx)
        result = rule["result"]
        if result not in policy["allowed_results"]:
            raise InternalError(f"resultado de gate fora do catálogo: {result}")
        derived[gate] = result
    return derived


def catalog_locators(catalog: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    found: list[tuple[str, dict[str, Any]]] = []
    for index, item in enumerate(catalog["required_open_questions"]):
        found.append((f"/required_open_questions/{index}/locator", item["locator"]))
    return found


def evidence_locators(assessment: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    found: list[tuple[str, dict[str, Any]]] = []
    for index, item in enumerate(assessment.get("evidence_items") or []):
        locator = item.get("locator")
        if isinstance(locator, dict):
            found.append((f"/evidence_items/{index}/locator", locator))
    return found


def evaluate_assessment(
    assessment: dict[str, Any],
    catalog: dict[str, Any],
    source: str,
    validator: Draft202012Validator,
    root: Path,
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
    empty_result = {
        "path": source,
        "assessment_id": assessment.get("assessment_id"),
        "valid": False,
        "criteria": None,
        "gate_results": None,
        "findings": sort_findings(findings),
    }
    if findings:
        return empty_result

    findings.extend(uniqueness_findings(assessment, source))
    findings.extend(resolve_target(assessment, source, root))
    evidence_ids = {
        item.get("id")
        for item in assessment.get("evidence_items") or []
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    }
    for pointer, ref in collect_evidence_refs(assessment):
        if ref not in evidence_ids:
            findings.append(
                finding(
                    "evidence-ref-unresolved",
                    f"A ref {ref} não existe no índice de evidência.",
                    source,
                    pointer,
                )
            )
    sha = (assessment.get("assessed_target") or {}).get("sha")
    if isinstance(sha, str) and commit_sha(sha, root) is not None:
        findings.extend(resolve_locators(evidence_locators(assessment), sha, source, root))
        findings.extend(resolve_locators(catalog_locators(catalog), sha, source, root))

    blockers, blocker_findings = derive_blockers(assessment, catalog, evidence_ids, source)
    findings.extend(blocker_findings)

    ctx = RuntimeContext(
        assessment=assessment,
        evidence_ids=evidence_ids,
        blockers=blockers,
        derived_criteria=[],
    )
    derived = derive_criteria(catalog, ctx)
    ctx.derived_criteria = derived
    gates = derive_gates(catalog, ctx)

    assessed_at = parse_assessed_at(str(assessment.get("assessed_at") or ""))
    if assessed_at is not None and assessed_at > datetime.now(timezone.utc):
        findings.append(
            finding(
                "assessed-at-in-future",
                "A data da assessment não pode estar no futuro.",
                source,
                "/assessed_at",
            )
        )

    findings = sort_findings(findings)
    return {
        "path": source,
        "assessment_id": assessment.get("assessment_id"),
        "valid": not findings,
        "criteria": derived,
        "gate_results": gates,
        "findings": findings,
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
        validator, catalog = load_packaged()
        root = repository_root()
    except InternalError as exc:
        emit(error_payload("internal-error", exc.message, str(SCHEMA_PATH)))
        return EXIT_INTERNAL
    except Exception:
        emit(error_payload("internal-error", INTERNAL_SCHEMA_MESSAGE, str(SCHEMA_PATH)))
        return EXIT_INTERNAL

    assessments: list[dict[str, Any]] = []
    try:
        for raw_path in args:
            path = Path(raw_path)
            document = load_user_json(path)
            assessments.append(evaluate_assessment(document, catalog, str(path), validator, root))
    except InputError as exc:
        emit(error_payload(exc.code, exc.message, exc.path))
        return EXIT_INPUT
    except InternalError as exc:
        emit(error_payload("internal-error", exc.message, str(SCHEMA_PATH)))
        return EXIT_INTERNAL
    except Exception:
        emit(error_payload("internal-error", INTERNAL_SCHEMA_MESSAGE, str(SCHEMA_PATH)))
        return EXIT_INTERNAL

    all_findings = [item for result in assessments for item in result["findings"]]
    payload = {
        "schema_version": 2,
        "status": "valid" if not all_findings else "invalid",
        "assessments": assessments,
        "findings": sort_findings(all_findings),
    }
    emit(payload)
    return EXIT_OK if payload["status"] == "valid" else EXIT_INVALID


if __name__ == "__main__":
    raise SystemExit(main())
