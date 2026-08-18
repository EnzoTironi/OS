#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
EVALUATOR = HERE / "evaluate_scorecard.py"
SCHEMA = HERE / "scorecard.schema.json"
CRITERIA_SCHEMA = HERE / "criteria.schema.json"
CRITERIA = HERE / "criteria.json"
CURRENT = HERE / "current-assessment.json"
SHARD = ROOT / "research" / "index" / "issue-0080-research-stop-conditions.json"
VALID = HERE / "fixtures" / "valid"
MUTANTS = HERE / "fixtures" / "mutants"

VALID_BLOCK_MUTANTS = {
    "hypothesis-without-falsifier.json": {
        "reason": "Preservado como caso negativo válido: hipótese sem falsificador deriva experiment=block sem status forjado.",
        "experiment": "block",
    },
    "bakeoff-single-candidate.json": {
        "reason": "Preservado: um candidato não compara stacks e deriva stack_bakeoff=block.",
        "stack_bakeoff": "block",
    },
    "bakeoff-duplicate-candidate.json": {
        "reason": "Substituto mais forte do ataque de um candidato: o mesmo candidate_id conta uma vez.",
        "stack_bakeoff": "block",
    },
    "source-shaped-acceptance.json": {
        "reason": "Preservado: o flag estruturado source_shaped_exceptions=true deriva block.",
        "stack_bakeoff": "block",
    },
}

CONTRACT_MUTANTS = {
    "locator-missing.json": {
        "reason": "Substituído pelo ataque de path inexistente no tree do SHA.",
        "code": "locator-path-missing",
    },
    "locator-anchor-missing.json": {
        "reason": "Complementa locator-missing com path real e âncora ausente no blob.",
        "code": "locator-anchor-missing",
    },
    "blocking-question-omitted.json": {
        "reason": "Substituído para omitir Q-015; omissão de blocker catalogado invalida a assessment.",
        "code": "blocking-question-omitted",
    },
    "blocking-question-omitted-q071.json": {
        "reason": "Complementa o mutante original cobrindo a omissão de Q-071.",
        "code": "blocking-question-omitted",
    },
    "architectural-promotion-accepted.json": {
        "reason": "Substituído: o input v2 rejeita adoption_claim accepted no schema.",
        "code": "schema-violation",
    },
}

REF_FIELDS = [
    ("experiment_case", "question_refs", ["E-999"]),
    ("experiment_case", "hypothesis_refs", ["E-999"]),
    ("experiment_case", "falsifier_refs", ["E-999"]),
    ("experiment_case", "discriminating_proof_refs", ["E-999"]),
    ("experiment_case", "source_kind_refs", ["E-999"]),
    ("experiment_case", "limits_refs", ["E-999"]),
    ("experiment_case", "normative_promotion_refs", ["E-999"]),
    ("stack_bakeoff_case", "suite_ref", "E-999"),
    ("stack_bakeoff_case", "shared_measure_refs", ["E-999"]),
    ("stack_bakeoff_case", "semantic_contract_refs", ["E-999"]),
    ("architectural_promotion_case", "cross_domain_refs", ["E-999"]),
    ("architectural_promotion_case", "cross_industry_refs", ["E-999"]),
    ("architectural_promotion_case", "kill_test_refs", ["E-999"]),
    ("architectural_promotion_case", "high_risk_semantics_refs", ["E-999"]),
    ("architectural_promotion_case", "competitors_reduced_refs", ["E-999"]),
    ("architectural_promotion_case", "current_sha_review_ref", "E-999"),
    ("architectural_promotion_case", "governance_process_ref", "E-999"),
]


def run_cli(*args: str, extra_env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    if extra_env:
        env.update(extra_env)
    return subprocess.run(
        [sys.executable, str(EVALUATOR), *args],
        capture_output=True,
        text=True,
        env=env,
    )


def payload_of(result: subprocess.CompletedProcess[str]) -> dict:
    return json.loads(result.stdout)


def load_current() -> dict:
    return json.loads(CURRENT.read_text(encoding="utf-8"))


def write_probe(document: dict, work: Path, name: str = "probe.json") -> Path:
    target = work / name
    target.write_text(json.dumps(document), encoding="utf-8")
    return target


def criterion_by_id(document: dict, criterion_id: str) -> dict:
    for item in document["assessments"][0]["criteria"]:
        if item["criterion_id"] == criterion_id:
            return item
    raise AssertionError(f"missing derived criterion {criterion_id}")


class ScorecardCliTests(unittest.TestCase):
    def test_help_is_portuguese(self) -> None:
        result = run_cli("--help")
        self.assertEqual(result.returncode, 0)
        self.assertIn("Avalia assessments de readiness", result.stdout)
        self.assertIn("não escolhe stack", result.stdout)
        self.assertIn("output derivado", result.stdout)
        self.assertEqual(result.stderr, "")

    def test_usage_without_args_is_exit_2(self) -> None:
        result = run_cli()
        self.assertEqual(result.returncode, 2)
        self.assertIn("uso:", result.stderr)
        document = payload_of(result)
        self.assertEqual(document["status"], "error")
        self.assertEqual(document["findings"][0]["code"], "usage")

    def test_current_assessment_allows_only_experiment(self) -> None:
        result = run_cli(str(CURRENT))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stderr, "")
        document = payload_of(result)
        self.assertEqual(document["schema_version"], 2)
        self.assertEqual(document["status"], "valid")
        assessment = document["assessments"][0]
        gates = assessment["gate_results"]
        self.assertEqual(gates["experiment"], "allow")
        self.assertEqual(gates["stack_bakeoff"], "block")
        self.assertEqual(gates["architectural_promotion"], "block")
        self.assertEqual(criterion_by_id(document, "PRO-02")["status"], "pass")
        self.assertEqual(document["findings"], [])
        self.assertNotIn("accepted", json.dumps(gates))

    def test_empty_experiment_case_is_valid_block(self) -> None:
        document = load_current()
        document["assessment_id"] = "assessment:empty-experiment"
        document["experiment_case"] = {
            "question": "",
            "question_refs": [],
            "hypothesis": "",
            "hypothesis_refs": [],
            "falsifier": "",
            "falsifier_refs": [],
            "discriminating_proof_refs": [],
            "source_kind": "",
            "source_kind_refs": [],
            "limits": "",
            "limits_refs": [],
            "normative_promotion": None,
            "normative_promotion_refs": [],
        }
        with tempfile.TemporaryDirectory() as tmp:
            result = run_cli(str(write_probe(document, Path(tmp))))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        payload = payload_of(result)
        self.assertEqual(payload["assessments"][0]["gate_results"]["experiment"], "block")
        self.assertNotEqual(criterion_by_id(payload, "EXP-01")["status"], "pass")
        self.assertNotEqual(criterion_by_id(payload, "EXP-03")["status"], "pass")

    def test_green_experiment_only_allows_only_experiment(self) -> None:
        result = run_cli(str(VALID / "experiment-only.json"))
        self.assertEqual(result.returncode, 0, result.stdout)
        gates = payload_of(result)["assessments"][0]["gate_results"]
        self.assertEqual(gates["experiment"], "allow")
        self.assertEqual(gates["stack_bakeoff"], "block")
        self.assertEqual(gates["architectural_promotion"], "block")

    def test_green_bakeoff_keeps_promotion_blocked(self) -> None:
        result = run_cli(str(VALID / "bakeoff-allowed.json"))
        self.assertEqual(result.returncode, 0, result.stdout)
        gates = payload_of(result)["assessments"][0]["gate_results"]
        self.assertEqual(gates["experiment"], "allow")
        self.assertEqual(gates["stack_bakeoff"], "allow")
        self.assertEqual(gates["architectural_promotion"], "block")

    def test_green_eligible_is_not_accepted(self) -> None:
        result = run_cli(str(VALID / "eligible-governance.json"))
        self.assertEqual(result.returncode, 0, result.stdout)
        document = payload_of(result)
        gates = document["assessments"][0]["gate_results"]
        self.assertEqual(gates["architectural_promotion"], "eligible_for_governance_review")
        dumped = json.dumps(document)
        self.assertNotIn("accepted", dumped)
        self.assertNotEqual(gates["architectural_promotion"], "allow")

    def test_all_green_fixtures_together(self) -> None:
        paths = sorted(str(path) for path in VALID.glob("*.json"))
        result = run_cli(*paths)
        self.assertEqual(result.returncode, 0, result.stdout)

    def test_cli_validates_date_and_date_time_formats(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            cases = {
                "not-a-date-time": False,
                "2026-08-18T10:30:00": False,
                "2026-02-30T10:30:00Z": False,
                "2026-08-18T10:30:00+08:00": True,
            }
            for value, ok in cases.items():
                document = load_current()
                document["assessed_at"] = value
                result = run_cli(str(write_probe(document, work)))
                payload = payload_of(result)
                if ok:
                    self.assertEqual(result.returncode, 0, value)
                    self.assertEqual(payload["status"], "valid")
                else:
                    self.assertEqual(result.returncode, 1, value)
                    codes = [item["code"] for item in payload["findings"]]
                    self.assertEqual(codes, ["schema-violation"])
                    self.assertEqual(payload["findings"][0]["pointer"], "/assessed_at")

    def test_future_assessed_at_is_exit_1_without_changing_gates(self) -> None:
        document = load_current()
        document["assessed_at"] = "2099-01-01T00:00:00Z"
        with tempfile.TemporaryDirectory() as tmp:
            result = run_cli(str(write_probe(document, Path(tmp))))
        self.assertEqual(result.returncode, 1, result.stdout)
        payload = payload_of(result)
        codes = [item["code"] for item in payload["findings"]]
        self.assertEqual(codes, ["assessed-at-in-future"])
        gates = payload["assessments"][0]["gate_results"]
        self.assertEqual(gates["experiment"], "allow")
        self.assertEqual(gates["stack_bakeoff"], "block")
        self.assertEqual(gates["architectural_promotion"], "block")
        self.assertEqual(criterion_by_id(payload, "PRO-02")["status"], "pass")

    def test_non_utf8_input_is_invalid_json_exit_2(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "broken.json"
            target.write_bytes(b'{"schema_version": 2,\xff}')
            result = run_cli(str(target))
        self.assertEqual(result.returncode, 2)
        self.assertEqual(result.stderr, "")
        document = payload_of(result)
        self.assertEqual(document["status"], "error")
        self.assertEqual(document["findings"][0]["code"], "invalid-json")
        self.assertEqual(
            document["findings"][0]["message"],
            "JSON inválido: o arquivo precisa usar UTF-8",
        )
        self.assertEqual(document["findings"][0]["pointer"], "")
        self.assertIs(document["findings"][0]["valid"], False)
        self.assertNotIn("codec", document["findings"][0]["message"])
        self.assertNotIn("0xff", document["findings"][0]["message"])

    def test_invalid_json_is_exit_2(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "truncated.json"
            target.write_text("{", encoding="utf-8")
            result = run_cli(str(target))
        self.assertEqual(result.returncode, 2)
        document = payload_of(result)
        self.assertEqual(document["findings"][0]["code"], "invalid-json")

    def test_array_document_is_exit_2(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "array.json"
            target.write_text("[]", encoding="utf-8")
            result = run_cli(str(target))
        self.assertEqual(result.returncode, 2)
        document = payload_of(result)
        self.assertEqual(document["findings"][0]["message"], "o documento precisa ser um objeto JSON")

    def test_dangling_ref_in_each_family_is_exit_1(self) -> None:
        for case_name, field_name, value in REF_FIELDS:
            with self.subTest(field=f"{case_name}.{field_name}"):
                document = load_current()
                document[case_name][field_name] = value
                with tempfile.TemporaryDirectory() as tmp:
                    result = run_cli(str(write_probe(document, Path(tmp))))
                self.assertEqual(result.returncode, 1, result.stdout)
                self.assertEqual(result.stderr, "")
                codes = [item["code"] for item in payload_of(result)["findings"]]
                self.assertIn("evidence-ref-unresolved", codes)

        document = load_current()
        document["stack_bakeoff_case"]["candidates"] = [
            {"candidate_id": "orphan", "execution_refs": ["E-999"]}
        ]
        with tempfile.TemporaryDirectory() as tmp:
            result = run_cli(str(write_probe(document, Path(tmp))))
        self.assertEqual(result.returncode, 1, result.stdout)
        self.assertIn(
            "evidence-ref-unresolved",
            [item["code"] for item in payload_of(result)["findings"]],
        )

        document = load_current()
        document["open_questions"][1]["state"] = "limited"
        document["open_questions"][1]["limit_refs"] = ["E-999"]
        with tempfile.TemporaryDirectory() as tmp:
            result = run_cli(str(write_probe(document, Path(tmp))))
        self.assertEqual(result.returncode, 1, result.stdout)
        codes = [item["code"] for item in payload_of(result)["findings"]]
        self.assertTrue(
            "evidence-ref-unresolved" in codes or "question-limit-unresolved" in codes,
            codes,
        )

    def test_missing_sha_and_ref_mismatch_are_exit_1(self) -> None:
        missing = load_current()
        missing["assessed_target"]["sha"] = "ffffffffffffffffffffffffffffffffffffffff"
        with tempfile.TemporaryDirectory() as tmp:
            result = run_cli(str(write_probe(missing, Path(tmp), "missing-sha.json")))
        self.assertEqual(result.returncode, 1, result.stdout)
        self.assertEqual(payload_of(result)["findings"][0]["code"], "target-sha-missing")

        unknown_ref = load_current()
        unknown_ref["assessed_target"]["ref"] = "refs/heads/does-not-exist-scorecard"
        with tempfile.TemporaryDirectory() as tmp:
            result = run_cli(str(write_probe(unknown_ref, Path(tmp), "missing-ref.json")))
        self.assertEqual(result.returncode, 1, result.stdout)
        self.assertEqual(payload_of(result)["findings"][0]["code"], "target-ref-unresolved")

        mismatch = load_current()
        mismatch["assessed_target"]["ref"] = "HEAD"
        with tempfile.TemporaryDirectory() as tmp:
            result = run_cli(str(write_probe(mismatch, Path(tmp), "mismatch.json")))
        self.assertEqual(result.returncode, 1, result.stdout)
        codes = [item["code"] for item in payload_of(result)["findings"]]
        self.assertIn("target-ref-mismatch", codes)

    def test_injected_rationale_is_rejected_by_schema(self) -> None:
        cases = [
            ({"rationale": "promotion accepted by reviewer"}, "/rationale"),
            (
                {"stack_bakeoff_case": {"rationale": "source-shaped exception is accepted"}},
                "/stack_bakeoff_case",
            ),
            (
                {
                    "architectural_promotion_case": {
                        "rationale": "there is no evidence against the flags"
                    }
                },
                "/architectural_promotion_case",
            ),
        ]
        for extra, pointer in cases:
            with self.subTest(pointer=pointer):
                document = load_current()
                if "rationale" in extra:
                    document["rationale"] = extra["rationale"]
                else:
                    key = next(iter(extra))
                    document[key]["rationale"] = extra[key]["rationale"]
                with tempfile.TemporaryDirectory() as tmp:
                    result = run_cli(str(write_probe(document, Path(tmp))))
                self.assertEqual(result.returncode, 1, result.stdout)
                payload = payload_of(result)
                self.assertEqual(payload["findings"][0]["code"], "schema-violation")

    def test_input_rejects_authorial_status_and_gate_results(self) -> None:
        document = load_current()
        document["criteria"] = [
            {
                "criterion_id": "EXP-01",
                "gate": "experiment",
                "status": "pass",
                "rationale": "accepted",
            }
        ]
        document["gate_results"] = {
            "experiment": "allow",
            "stack_bakeoff": "allow",
            "architectural_promotion": "accepted",
        }
        with tempfile.TemporaryDirectory() as tmp:
            result = run_cli(str(write_probe(document, Path(tmp))))
        self.assertEqual(result.returncode, 1, result.stdout)
        codes = [item["code"] for item in payload_of(result)["findings"]]
        self.assertTrue(codes)
        self.assertTrue(all(code == "schema-violation" for code in codes))


class PackagedInternalErrorTests(unittest.TestCase):
    def _copy_packaged(self, work: Path) -> None:
        shutil.copy(EVALUATOR, work / "evaluate_scorecard.py")
        shutil.copy(SCHEMA, work / "scorecard.schema.json")
        shutil.copy(CRITERIA_SCHEMA, work / "criteria.schema.json")
        shutil.copy(CRITERIA, work / "criteria.json")
        shutil.copy(CURRENT, work / "ok.json")

    def _run_copied(self, work: Path) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(work / "evaluate_scorecard.py"), str(work / "ok.json")],
            capture_output=True,
            text=True,
            env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
        )

    def test_internal_schema_failure_remains_exit_3(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            self._copy_packaged(work)
            (work / "scorecard.schema.json").write_text("{", encoding="utf-8")
            result = self._run_copied(work)
        self.assertEqual(result.returncode, 3)
        self.assertEqual(result.stderr, "")
        self.assertNotIn("Traceback", result.stdout)
        document = json.loads(result.stdout)
        self.assertEqual(document["status"], "error")
        self.assertEqual(document["findings"][0]["code"], "internal-error")

    def test_schema_invalid_on_metaschema_is_exit_3(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            self._copy_packaged(work)
            (work / "scorecard.schema.json").write_text(
                json.dumps(
                    {
                        "$schema": "https://json-schema.org/draft/2020-12/schema",
                        "type": "object",
                        "properties": True,
                    }
                ),
                encoding="utf-8",
            )
            result = self._run_copied(work)
        self.assertEqual(result.returncode, 3)
        self.assertEqual(result.stderr, "")
        self.assertNotIn("Traceback", result.stdout + result.stderr)
        self.assertEqual(json.loads(result.stdout)["findings"][0]["code"], "internal-error")

    def test_unresolved_packaged_ref_is_exit_3(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            self._copy_packaged(work)
            (work / "scorecard.schema.json").write_text(
                json.dumps(
                    {
                        "$schema": "https://json-schema.org/draft/2020-12/schema",
                        "type": "object",
                        "properties": {"x": {"$ref": "#/$defs/missing"}},
                    }
                ),
                encoding="utf-8",
            )
            result = self._run_copied(work)
        self.assertEqual(result.returncode, 3)
        self.assertEqual(result.stderr, "")
        self.assertNotIn("Traceback", result.stdout)
        document = json.loads(result.stdout)
        self.assertEqual(document["findings"][0]["code"], "internal-error")
        self.assertIn("não resolvida", document["findings"][0]["message"])

    def test_truncated_catalog_is_exit_3(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            self._copy_packaged(work)
            (work / "criteria.json").write_text("{", encoding="utf-8")
            result = self._run_copied(work)
        self.assertEqual(result.returncode, 3)
        self.assertEqual(result.stderr, "")
        self.assertNotIn("Traceback", result.stdout)
        self.assertEqual(json.loads(result.stdout)["findings"][0]["code"], "internal-error")

    def test_invalid_catalog_shape_is_exit_3(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            self._copy_packaged(work)
            (work / "criteria.json").write_text("{\"schema_version\": 2}", encoding="utf-8")
            result = self._run_copied(work)
        self.assertEqual(result.returncode, 3)
        self.assertEqual(result.stderr, "")
        self.assertNotIn("Traceback", result.stdout)
        self.assertEqual(json.loads(result.stdout)["findings"][0]["code"], "internal-error")

    def test_unknown_operator_is_exit_3(self) -> None:
        catalog = json.loads(CRITERIA.read_text(encoding="utf-8"))
        catalog["criteria"][0]["rules"][0]["when"] = {"explode": True}
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            self._copy_packaged(work)
            (work / "criteria.json").write_text(json.dumps(catalog), encoding="utf-8")
            result = self._run_copied(work)
        self.assertEqual(result.returncode, 3)
        self.assertEqual(result.stderr, "")
        self.assertNotIn("Traceback", result.stdout + result.stderr)
        self.assertEqual(json.loads(result.stdout)["findings"][0]["code"], "internal-error")


class MutantIsolationTests(unittest.TestCase):
    def test_valid_block_mutants_keep_shape_and_block(self) -> None:
        for name, spec in VALID_BLOCK_MUTANTS.items():
            with self.subTest(name=name, reason=spec["reason"]):
                result = run_cli(str(MUTANTS / name))
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                payload = payload_of(result)
                gates = payload["assessments"][0]["gate_results"]
                for gate, expected in spec.items():
                    if gate == "reason":
                        continue
                    self.assertEqual(gates[gate], expected, spec["reason"])

    def test_contract_mutants_are_exit_1(self) -> None:
        for name, spec in CONTRACT_MUTANTS.items():
            with self.subTest(name=name, reason=spec["reason"]):
                result = run_cli(str(MUTANTS / name))
                self.assertEqual(result.returncode, 1, result.stdout)
                codes = [item["code"] for item in payload_of(result)["findings"]]
                self.assertIn(spec["code"], codes, spec["reason"])

    def test_replacing_mutant_with_green_makes_assertion_fail(self) -> None:
        green = run_cli(str(VALID / "experiment-only.json"))
        self.assertEqual(green.returncode, 0)
        green_payload = payload_of(green)
        green_codes = [item["code"] for item in green_payload["findings"]]
        self.assertEqual(green_codes, [])
        self.assertEqual(green_payload["assessments"][0]["gate_results"]["experiment"], "allow")
        for spec in CONTRACT_MUTANTS.values():
            self.assertNotIn(spec["code"], green_codes)
        self.assertNotEqual(
            green_payload["assessments"][0]["gate_results"]["experiment"],
            "block",
        )

    def test_evaluator_has_no_criterion_or_gate_dispatch(self) -> None:
        text = EVALUATOR.read_text(encoding="utf-8")
        self.assertNotIn("EXP-", text)
        self.assertNotIn("BAK-", text)
        self.assertNotIn("PRO-", text)
        self.assertNotIn("if criterion_id", text)
        self.assertNotIn("if gate ==", text)


class ShardResolutionTests(unittest.TestCase):
    def test_disagreement_targets_resolve_to_real_records(self) -> None:
        shard = json.loads(SHARD.read_text(encoding="utf-8"))
        entry = shard["entries"][0]
        records = {item["ref"] for item in entry["records"]}
        self.assertIn("issue-0080-research-stop-conditions#EXP-01", records)
        for disagreement in entry["disagreements"]:
            for target in disagreement["targets"]:
                self.assertIn(
                    target,
                    records,
                    f"{disagreement['id']} aponta para o record órfão {target}",
                )


if __name__ == "__main__":
    unittest.main()
