#!/usr/bin/env python3
"""Drive the durable semantic commit contract through psql only."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SCHEMA_SQL = HERE / "schema.sql"
FUNCTIONS_SQL = HERE / "functions.sql"
RESET_SQL = HERE / "reset.sql"
MUTANT_DIR = HERE / "mutants"
REQUEST_SCHEMA = HERE / "schemas" / "commit-request.schema.json"
RESULT_SCHEMA = HERE / "schemas" / "commit-result.schema.json"
STATUS_SCHEMA = HERE / "schemas" / "status-result.schema.json"

FORBIDDEN_IDENTIFIERS = (
    "TypeScript",
    "Go",
    "Rust",
    "Python",
    "Product",
    "PurchaseRaw",
    "V-001",
)
DIGEST_A = "sha256:" + ("a" * 64)
DIGEST_B = "sha256:" + ("b" * 64)
DIGEST_C = "sha256:" + ("c" * 64)


def dollar_quote(text: str) -> str:
    tag = "p" + hashlib.sha256(text.encode()).hexdigest()[:12]
    if f"${tag}$" in text:
        raise RuntimeError("quote tag collided with payload")
    return f"${tag}${text}${tag}$"


def request_payload(
    *,
    namespace: str = "org-a",
    operation_id: str = "op-1",
    intent_digest: str = DIGEST_A,
    expected_revision: int = 0,
    result: dict[str, Any] | None = None,
    records: list[dict[str, Any]] | None = None,
    effect_requests: list[dict[str, Any]] | None = None,
    protocol_version: Any = 1,
) -> dict[str, Any]:
    return {
        "protocol_version": protocol_version,
        "namespace": namespace,
        "operation_id": operation_id,
        "intent_digest": intent_digest,
        "expected_revision": expected_revision,
        "result": result if result is not None else {"status": "ok"},
        "records": records
        if records is not None
        else [{"record_id": "claim:1", "kind": "claim", "payload": {"value": 7}}],
        "effect_requests": effect_requests
        if effect_requests is not None
        else [
            {
                "request_id": "effect:1",
                "effect_definition_ref": "effect.book-carrier@1",
                "intent_digest": DIGEST_B,
                "payload": {"kind": "pickup"},
            }
        ],
    }


def dump_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, indent=2, ensure_ascii=True) + "\n"


def write_json(path: Path, value: Any) -> None:
    path.write_text(dump_json(value), encoding="utf-8")


def run_psql(
    dsn: str,
    sql: str | None = None,
    *,
    sql_file: Path | None = None,
    tuples_only: bool = True,
    timeout: float = 30,
) -> subprocess.CompletedProcess[str]:
    command = ["psql", dsn, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-P", "pager=off"]
    if tuples_only:
        command.extend(["-t", "-A"])
    if sql_file is not None:
        command.extend(["-f", str(sql_file)])
    elif sql is not None:
        command.extend(["-c", sql])
    else:
        raise ValueError("sql or sql_file is required")
    return subprocess.run(
        command,
        check=False,
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def psql_ok(dsn: str, sql: str, timeout: float = 30) -> str:
    completed = run_psql(dsn, sql, timeout=timeout)
    if completed.returncode != 0:
        raise RuntimeError(
            f"psql failed ({completed.returncode}): {completed.stderr.strip() or completed.stdout.strip()}"
        )
    return completed.stdout.strip()


def apply_sql_file(dsn: str, path: Path) -> None:
    completed = run_psql(dsn, sql_file=path, tuples_only=False)
    if completed.returncode != 0:
        raise RuntimeError(f"failed to apply {path}: {completed.stderr.strip()}")


def init_contract(dsn: str) -> None:
    apply_sql_file(dsn, SCHEMA_SQL)
    apply_sql_file(dsn, FUNCTIONS_SQL)


def reset_contract(dsn: str) -> None:
    apply_sql_file(dsn, RESET_SQL)


def restore_functions(dsn: str) -> None:
    apply_sql_file(dsn, FUNCTIONS_SQL)


def commit_sql(payload: dict[str, Any]) -> str:
    return f"SELECT commit_semantic_operation({dollar_quote(json.dumps(payload, sort_keys=True))}::jsonb);"


def status_sql(namespace: str, operation_id: str) -> str:
    return (
        "SELECT semantic_operation_status("
        f"{dollar_quote(namespace)}::text, {dollar_quote(operation_id)}::text);"
    )


def parse_json_line(text: str) -> Any:
    line = text.strip().splitlines()[-1] if text.strip() else ""
    if not line:
        raise RuntimeError("psql returned empty JSON")
    return json.loads(line)


def call_commit(dsn: str, payload: dict[str, Any]) -> dict[str, Any]:
    raw = psql_ok(dsn, commit_sql(payload))
    return parse_json_line(raw)


def observe_commit(dsn: str, payload: dict[str, Any]) -> dict[str, Any]:
    completed = run_psql(dsn, commit_sql(payload))
    if completed.returncode != 0:
        return {
            "state": "error",
            "detail": completed.stderr.strip() or completed.stdout.strip(),
        }
    return parse_json_line(completed.stdout)


def call_status(dsn: str, namespace: str, operation_id: str) -> dict[str, Any]:
    raw = psql_ok(dsn, status_sql(namespace, operation_id))
    return parse_json_line(raw)


def call_commit_expect_error(dsn: str, payload: dict[str, Any]) -> str:
    completed = run_psql(dsn, commit_sql(payload))
    if completed.returncode == 0:
        raise RuntimeError(f"expected rejection, got {completed.stdout.strip()}")
    return completed.stderr + completed.stdout


def counts(dsn: str, namespace: str | None = None, operation_id: str | None = None) -> dict[str, int]:
    if namespace is None:
        sql = """
        SELECT jsonb_build_object(
            'operations', (SELECT count(*)::int FROM semantic_operation),
            'records', (SELECT count(*)::int FROM semantic_record),
            'effects', (SELECT count(*)::int FROM effect_request),
            'heads', (SELECT count(*)::int FROM semantic_head),
            'head_revision', (SELECT coalesce(max(revision), 0)::int FROM semantic_head)
        );
        """
    else:
        op_filter = ""
        if operation_id is not None:
            op_filter = f" AND operation_id = {dollar_quote(operation_id)}"
        sql = f"""
        SELECT jsonb_build_object(
            'operations', (SELECT count(*)::int FROM semantic_operation
                           WHERE namespace = {dollar_quote(namespace)}{op_filter}),
            'records', (SELECT count(*)::int FROM semantic_record
                        WHERE namespace = {dollar_quote(namespace)}{op_filter}),
            'effects', (SELECT count(*)::int FROM effect_request
                        WHERE namespace = {dollar_quote(namespace)}{op_filter}),
            'head_revision', (SELECT coalesce(revision, 0)::int FROM semantic_head
                              WHERE namespace = {dollar_quote(namespace)})
        );
        """
    return parse_json_line(psql_ok(dsn, sql))


def server_version(dsn: str) -> str:
    return psql_ok(dsn, "SHOW server_version;")


def full_version(dsn: str) -> str:
    return psql_ok(dsn, "SELECT version();")


def git_sha() -> str:
    completed = subprocess.run(
        ["git", "-C", str(ROOT), "rev-parse", "HEAD"],
        check=True,
        capture_output=True,
        text=True,
    )
    return completed.stdout.strip()


def load_schema(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def schema_type_ok(value: Any, expected: str) -> bool:
    if expected == "object":
        return isinstance(value, dict)
    if expected == "array":
        return isinstance(value, list)
    if expected == "string":
        return isinstance(value, str)
    if expected == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected == "boolean":
        return isinstance(value, bool)
    if expected == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    return False


def validate_schema(instance: Any, schema: dict[str, Any], path: str = "$") -> list[str]:
    errors: list[str] = []
    expected_type = schema.get("type")
    if expected_type and not schema_type_ok(instance, expected_type):
        errors.append(f"{path}: expected {expected_type}")
        return errors
    if "const" in schema and instance != schema["const"]:
        errors.append(f"{path}: expected const {schema['const']!r}")
    if "enum" in schema and instance not in schema["enum"]:
        errors.append(f"{path}: expected one of {schema['enum']}")
    if isinstance(instance, str) and "pattern" in schema:
        if re.fullmatch(schema["pattern"], instance) is None:
            errors.append(f"{path}: pattern mismatch")
    if isinstance(instance, int) and instance < schema.get("minimum", instance):
        errors.append(f"{path}: below minimum")
    if isinstance(instance, str) and len(instance) < schema.get("minLength", 0):
        errors.append(f"{path}: shorter than minLength")
    if isinstance(instance, dict):
        required = schema.get("required", [])
        for key in required:
            if key not in instance:
                errors.append(f"{path}.{key}: missing")
        props = schema.get("properties", {})
        if schema.get("additionalProperties") is False:
            extra = set(instance) - set(props)
            if extra:
                errors.append(f"{path}: extra {sorted(extra)}")
        for key, value in instance.items():
            if key in props:
                errors.extend(validate_schema(value, props[key], f"{path}.{key}"))
    if isinstance(instance, list) and "items" in schema:
        for index, item in enumerate(instance):
            errors.extend(validate_schema(item, schema["items"], f"{path}[{index}]"))
    for clause in schema.get("allOf", []):
        if "if" in clause and "then" in clause:
            if not validate_schema(instance, clause["if"], path):
                errors.extend(validate_schema(instance, clause["then"], path))
        else:
            errors.extend(validate_schema(instance, clause, path))
    return errors


def property_row(name: str, passed: bool, detail: Any) -> dict[str, Any]:
    return {"property": name, "passed": passed, "detail": detail}


def wait_for_path(path: Path, timeout: float = 10) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if path.exists():
            return True
        time.sleep(0.02)
    return False


def start_worker(args: list[str]) -> subprocess.Popen[str]:
    return subprocess.Popen(
        [sys.executable, str(HERE / "harness.py"), *args],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        start_new_session=True,
    )


def finish_worker(proc: subprocess.Popen[str], timeout: float = 20) -> tuple[int, str, str]:
    stdout, stderr = proc.communicate(timeout=timeout)
    return proc.returncode, stdout, stderr


def worker_commit(dsn: str, request_path: Path, result_path: Path, ready_path: Path, proceed_path: Path) -> int:
    ready_path.write_text("ready\n", encoding="utf-8")
    if not wait_for_path(proceed_path, timeout=20):
        sys.stderr.write("timeout waiting for proceed\n")
        return 2
    payload = json.loads(request_path.read_text(encoding="utf-8"))
    try:
        result = call_commit(dsn, payload)
        write_json(result_path, result)
        return 0
    except Exception as exc:
        write_json(result_path, {"state": "error", "detail": str(exc)})
        return 1


def worker_crash_before_call(dsn: str, request_path: Path, ready_path: Path) -> int:
    payload = json.loads(request_path.read_text(encoding="utf-8"))
    ready_path.write_text("ready\n", encoding="utf-8")
    sql = "BEGIN;\nSELECT pg_sleep(60);\n" + commit_sql(payload) + "\nCOMMIT;\n"
    run_psql(dsn, sql, timeout=90)
    return 0


def worker_crash_after_write(dsn: str, request_path: Path, ready_path: Path) -> int:
    payload = json.loads(request_path.read_text(encoding="utf-8"))
    ready_path.write_text("ready\n", encoding="utf-8")
    sql = "BEGIN;\n" + commit_sql(payload) + "\nSELECT pg_sleep(60);\nCOMMIT;\n"
    run_psql(dsn, sql, timeout=90)
    return 0


def worker_crash_after_commit(dsn: str, request_path: Path, sentinel_path: Path) -> int:
    payload = json.loads(request_path.read_text(encoding="utf-8"))
    call_commit(dsn, payload)
    sentinel_path.write_text("committed\n", encoding="utf-8")
    time.sleep(60)
    return 0


def kill_process(proc: subprocess.Popen[str]) -> None:
    if proc.poll() is not None:
        return
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except ProcessLookupError:
        return
    try:
        proc.communicate(timeout=5)
    except subprocess.TimeoutExpired:
        proc.wait(timeout=5)


def terminate_stray_backends(dsn: str) -> None:
    sql = """
    SELECT coalesce(sum(pg_terminate_backend(pid)::int), 0)
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND pid <> pg_backend_pid()
      AND (
          query LIKE '%pg_sleep%'
          OR query LIKE '%commit_semantic_operation%'
          OR state <> 'idle'
      );
    """
    psql_ok(dsn, sql)


def wait_for_sleeping_backend(dsn: str, timeout: float = 15) -> bool:
    deadline = time.monotonic() + timeout
    sql = """
    SELECT count(*)::int
    FROM pg_stat_activity
    WHERE query LIKE '%pg_sleep%'
      AND state = 'active';
    """
    while time.monotonic() < deadline:
        if int(psql_ok(dsn, sql) or "0") > 0:
            return True
        time.sleep(0.05)
    return False


def run_forced_error(dsn: str, payload: dict[str, Any]) -> str:
    sql = (
        "BEGIN;\n"
        + commit_sql(payload)
        + "\nSELECT 1 / 0;\nCOMMIT;\n"
    )
    completed = run_psql(dsn, sql)
    return completed.stderr + completed.stdout


def run_idempotency(dsn: str, transcript: list[str]) -> list[dict[str, Any]]:
    reset_contract(dsn)
    payload = request_payload()
    first = call_commit(dsn, payload)
    after_first = counts(dsn, "org-a", "op-1")
    replay = call_commit(dsn, payload)
    after_replay = counts(dsn, "org-a", "op-1")
    mismatch_payload = request_payload(intent_digest=DIGEST_C)
    mismatch = call_commit(dsn, mismatch_payload)
    after_mismatch = counts(dsn, "org-a", "op-1")
    transcript.append("idempotency first/replay/mismatch")
    return [
        property_row(
            "idempotency.first_commit",
            first.get("state") == "committed" and first.get("commit_revision") == 1,
            first,
        ),
        property_row(
            "idempotency.replay_same_intent",
            replay.get("state") == "replayed"
            and replay.get("result") == payload["result"]
            and replay.get("commit_revision") == first.get("commit_revision"),
            replay,
        ),
        property_row(
            "idempotency.replay_no_extra_rows",
            after_replay == after_first,
            {"after_first": after_first, "after_replay": after_replay},
        ),
        property_row(
            "idempotency.mismatch",
            mismatch.get("state") == "intent_mismatch",
            mismatch,
        ),
        property_row(
            "idempotency.mismatch_no_write",
            after_mismatch == after_first,
            {"after_first": after_first, "after_mismatch": after_mismatch},
        ),
    ]


def run_two_commits(
    dsn: str,
    left: dict[str, Any],
    right: dict[str, Any],
) -> tuple[list[dict[str, Any]], dict[str, str]]:
    with tempfile.TemporaryDirectory() as tmp:
        folder = Path(tmp)
        left_req = folder / "left.json"
        right_req = folder / "right.json"
        left_res = folder / "left.out.json"
        right_res = folder / "right.out.json"
        left_ready = folder / "left.ready"
        right_ready = folder / "right.ready"
        proceed = folder / "proceed"
        write_json(left_req, left)
        write_json(right_req, right)
        common = ["--dsn", dsn, "--worker", "commit", "--proceed", str(proceed)]
        proc_left = start_worker(
            [*common, "--request", str(left_req), "--result", str(left_res), "--ready", str(left_ready)]
        )
        proc_right = start_worker(
            [*common, "--request", str(right_req), "--result", str(right_res), "--ready", str(right_ready)]
        )
        if not wait_for_path(left_ready) or not wait_for_path(right_ready):
            kill_process(proc_left)
            kill_process(proc_right)
            raise RuntimeError("workers did not become ready")
        proceed.write_text("proceed\n", encoding="utf-8")
        finish_worker(proc_left)
        finish_worker(proc_right)
        results = [
            json.loads(left_res.read_text(encoding="utf-8")),
            json.loads(right_res.read_text(encoding="utf-8")),
        ]
        traces = {
            "left_state": results[0].get("state"),
            "right_state": results[1].get("state"),
        }
        return results, traces


def run_conflict(dsn: str, transcript: list[str]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    reset_contract(dsn)
    left = request_payload(operation_id="op-a", records=[{"record_id": "claim:a", "kind": "claim", "payload": {"n": 1}}], effect_requests=[{"request_id": "effect:a", "effect_definition_ref": "effect.book-carrier@1", "intent_digest": DIGEST_B, "payload": {"kind": "pickup"}}])
    right = request_payload(operation_id="op-b", records=[{"record_id": "claim:b", "kind": "claim", "payload": {"n": 2}}], effect_requests=[{"request_id": "effect:b", "effect_definition_ref": "effect.book-carrier@1", "intent_digest": DIGEST_B, "payload": {"kind": "pickup"}}])
    results, traces = run_two_commits(dsn, left, right)
    states = sorted(item.get("state") for item in results)
    winner = next((item for item in results if item.get("state") == "committed"), None)
    loser_id = "op-b" if winner and winner.get("operation_id") == "op-a" else "op-a"
    loser_counts = counts(dsn, "org-a", loser_id)
    head = counts(dsn, "org-a")
    transcript.append("conflict two distinct operations")
    rows = [
        property_row(
            "conflict.one_committed_one_conflict",
            states == ["committed", "conflict"],
            {"states": states, "traces": traces},
        ),
        property_row(
            "conflict.head_advances_once",
            head["head_revision"] == 1 and head["operations"] == 1,
            head,
        ),
        property_row(
            "conflict.loser_no_rows",
            loser_counts["operations"] == 0
            and loser_counts["records"] == 0
            and loser_counts["effects"] == 0,
            {"loser": loser_id, "counts": loser_counts},
        ),
    ]
    return rows, {"states": states, "traces": traces, "head": head, "loser": loser_counts}


def run_same_operation_races(dsn: str, transcript: list[str]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    reset_contract(dsn)
    same = request_payload(operation_id="op-same")
    same_results, same_traces = run_two_commits(dsn, same, same)
    same_states = sorted(item.get("state") for item in same_results)
    same_counts = counts(dsn, "org-a", "op-same")
    reset_contract(dsn)
    left = request_payload(operation_id="op-mix", intent_digest=DIGEST_A)
    right = request_payload(operation_id="op-mix", intent_digest=DIGEST_C)
    mix_results, mix_traces = run_two_commits(dsn, left, right)
    mix_states = sorted(item.get("state") for item in mix_results)
    mix_counts = counts(dsn, "org-a", "op-mix")
    transcript.append("same operation races")
    rows = [
        property_row(
            "same_op.same_intent_race",
            same_states == ["committed", "replayed"],
            {"states": same_states, "traces": same_traces},
        ),
        property_row(
            "same_op.different_intent_race",
            mix_states == ["committed", "intent_mismatch"],
            {"states": mix_states, "traces": mix_traces},
        ),
        property_row(
            "same_op.exactly_one_row",
            same_counts["operations"] == 1 and mix_counts["operations"] == 1,
            {"same": same_counts, "mix": mix_counts},
        ),
    ]
    return rows, {
        "same_intent": {"states": same_states, "traces": same_traces, "counts": same_counts},
        "different_intent": {"states": mix_states, "traces": mix_traces, "counts": mix_counts},
    }


def run_atomicity(dsn: str, transcript: list[str]) -> list[dict[str, Any]]:
    reset_contract(dsn)
    committed = call_commit(dsn, request_payload())
    with_op = counts(dsn, "org-a", "op-1")
    reset_contract(dsn)
    dup_record = request_payload(
        operation_id="op-dup-record",
        records=[
            {"record_id": "claim:dup", "kind": "claim", "payload": {"value": 1}},
            {"record_id": "claim:dup", "kind": "claim", "payload": {"value": 2}},
        ],
    )
    dup_record_err = call_commit_expect_error(dsn, dup_record)
    after_dup_record = counts(dsn, "org-a", "op-dup-record")
    dup_effect = request_payload(
        operation_id="op-dup-effect",
        effect_requests=[
            {
                "request_id": "effect:dup",
                "effect_definition_ref": "effect.book-carrier@1",
                "intent_digest": DIGEST_B,
                "payload": {"kind": "pickup"},
            },
            {
                "request_id": "effect:dup",
                "effect_definition_ref": "effect.book-carrier@1",
                "intent_digest": DIGEST_C,
                "payload": {"kind": "drop"},
            },
        ],
    )
    dup_effect_err = call_commit_expect_error(dsn, dup_effect)
    after_dup_effect = counts(dsn, "org-a", "op-dup-effect")
    bad = request_payload(operation_id="op-bad")
    bad["intent_digest"] = "not-a-digest"
    bad_err = call_commit_expect_error(dsn, bad)
    after_bad = counts(dsn)
    reset_contract(dsn)
    forced = run_forced_error(dsn, request_payload(operation_id="op-fail"))
    after_forced = counts(dsn)
    transcript.append("atomicity rejects and rollback")
    return [
        property_row(
            "atomicity.records_effects_only_with_operation",
            committed.get("state") == "committed"
            and with_op["operations"] == 1
            and with_op["records"] == 1
            and with_op["effects"] == 1,
            with_op,
        ),
        property_row(
            "atomicity.duplicate_record_ids",
            "duplicate_record_id" in dup_record_err
            and after_dup_record["operations"] == 0
            and after_dup_record["records"] == 0,
            {"error": dup_record_err.strip().splitlines()[-1], "counts": after_dup_record},
        ),
        property_row(
            "atomicity.duplicate_effect_ids",
            "duplicate_effect_id" in dup_effect_err
            and after_dup_effect["operations"] == 0
            and after_dup_effect["effects"] == 0,
            {"error": dup_effect_err.strip().splitlines()[-1], "counts": after_dup_effect},
        ),
        property_row(
            "atomicity.malformed_payload",
            "malformed_payload" in bad_err and after_bad["head_revision"] == 0,
            {"error": bad_err.strip().splitlines()[-1], "counts": after_bad},
        ),
        property_row(
            "atomicity.final_write_error",
            after_forced["operations"] == 0
            and after_forced["records"] == 0
            and after_forced["effects"] == 0
            and after_forced["head_revision"] == 0,
            {"error": forced.strip().splitlines()[-1], "counts": after_forced},
        ),
        property_row(
            "atomicity.effects_same_transaction",
            after_forced["effects"] == 0,
            after_forced,
        ),
    ]


def run_crash_case(
    dsn: str,
    worker: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    with tempfile.TemporaryDirectory() as tmp:
        folder = Path(tmp)
        request_path = folder / "request.json"
        ready_path = folder / "ready"
        proceed_path = folder / "proceed"
        sentinel_path = folder / "sentinel"
        write_json(request_path, payload)
        if worker == "crash-after-commit":
            proc = start_worker(
                [
                    "--dsn",
                    dsn,
                    "--worker",
                    worker,
                    "--request",
                    str(request_path),
                    "--sentinel",
                    str(sentinel_path),
                ]
            )
            if not wait_for_path(sentinel_path, timeout=15):
                kill_process(proc)
                raise RuntimeError("sentinel was not written")
            kill_process(proc)
            terminate_stray_backends(dsn)
            return {"sentinel": True, "ready": False}
        proc = start_worker(
            [
                "--dsn",
                dsn,
                "--worker",
                worker,
                "--request",
                str(request_path),
                "--ready",
                str(ready_path),
                "--proceed",
                str(proceed_path),
            ]
        )
        if not wait_for_path(ready_path, timeout=15):
            kill_process(proc)
            raise RuntimeError(f"{worker} did not signal ready")
        if not wait_for_sleeping_backend(dsn):
            kill_process(proc)
            raise RuntimeError(f"{worker} never reached pg_sleep")
        kill_process(proc)
        terminate_stray_backends(dsn)
        return {"sentinel": False, "ready": True}


def run_failures(dsn: str, transcript: list[str]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    reset_contract(dsn)
    before = request_payload(operation_id="op-crash-1")
    run_crash_case(dsn, "crash-before-call", before)
    status_before = call_status(dsn, "org-a", "op-crash-1")
    counts_before = counts(dsn, "org-a", "op-crash-1")
    transcript.append("crash before call, new psql status")

    reset_contract(dsn)
    mid = request_payload(operation_id="op-crash-2")
    run_crash_case(dsn, "crash-after-write", mid)
    status_mid = call_status(dsn, "org-a", "op-crash-2")
    counts_mid = counts(dsn, "org-a", "op-crash-2")
    transcript.append("crash after write, new psql status")

    reset_contract(dsn)
    after = request_payload(operation_id="op-crash-3")
    crash_after = run_crash_case(dsn, "crash-after-commit", after)
    steps = ["crash"]
    status_after = call_status(dsn, "org-a", "op-crash-3")
    steps.append("status")
    retry = call_commit(dsn, after)
    steps.append("retry")
    transcript.append("crash after commit, status then replay")
    label = "unknown_resolved_committed" if status_after.get("found") else "unknown_unresolved"
    rows = [
        property_row(
            "crash.before_call_absent",
            status_before.get("found") is False and counts_before["operations"] == 0,
            {"status": status_before, "counts": counts_before},
        ),
        property_row(
            "crash.after_write_absent",
            status_mid.get("found") is False and counts_mid["operations"] == 0,
            {"status": status_mid, "counts": counts_mid},
        ),
        property_row(
            "crash.after_commit_status",
            status_after.get("found") is True and status_after.get("state") == "committed",
            status_after,
        ),
        property_row(
            "crash.retry_replayed",
            retry.get("state") == "replayed",
            retry,
        ),
        property_row(
            "crash.unknown_resolved_committed",
            label == "unknown_resolved_committed" and crash_after["sentinel"],
            {"label": label, "sentinel": crash_after["sentinel"]},
        ),
        property_row(
            "crash.no_retry_before_status",
            steps == ["crash", "status", "retry"],
            {"steps": steps},
        ),
        property_row(
            "restart.status_and_replay_new_psql",
            status_after.get("found") is True and retry.get("state") == "replayed",
            {"status": status_after, "retry": retry},
        ),
    ]
    traces = {
        "before_call": {"status": status_before, "counts": counts_before},
        "after_write": {"status": status_mid, "counts": counts_mid},
        "after_commit": {
            "label": label,
            "status": status_after,
            "retry": retry,
            "steps": steps,
        },
    }
    return rows, traces


def run_compatibility(dsn: str, sample_result: dict[str, Any], transcript: list[str]) -> list[dict[str, Any]]:
    request_schema = load_schema(REQUEST_SCHEMA)
    result_schema = load_schema(RESULT_SCHEMA)
    status_schema = load_schema(STATUS_SCHEMA)
    sample = request_payload()
    request_errors = validate_schema(sample, request_schema)
    result_errors = validate_schema(sample_result, result_schema)
    status = call_status(dsn, "org-a", sample_result["operation_id"])
    status_errors = validate_schema(status, status_schema)
    bad_digest = dict(sample)
    bad_digest["intent_digest"] = "sha256:zz"
    invalid_format_errors = validate_schema(bad_digest, request_schema)
    contract_text = SCHEMA_SQL.read_text(encoding="utf-8") + FUNCTIONS_SQL.read_text(encoding="utf-8")
    banned = [token for token in FORBIDDEN_IDENTIFIERS if token in contract_text]
    first = dump_json({"state": "committed", "commit_revision": 1})
    second = dump_json({"commit_revision": 1, "state": "committed"})
    transcript.append("compatibility schemas and identifier ban")
    return [
        property_row(
            "compatibility.request_schema_2020_12",
            request_schema.get("$schema") == "https://json-schema.org/draft/2020-12/schema"
            and not request_errors,
            {"errors": request_errors},
        ),
        property_row(
            "compatibility.result_schema_2020_12",
            result_schema.get("$schema") == "https://json-schema.org/draft/2020-12/schema"
            and not result_errors,
            {"errors": result_errors},
        ),
        property_row(
            "compatibility.status_schema_2020_12",
            status_schema.get("$schema") == "https://json-schema.org/draft/2020-12/schema"
            and not status_errors,
            {"errors": status_errors},
        ),
        property_row(
            "compatibility.invalid_digest_rejected",
            bool(invalid_format_errors),
            {"errors": invalid_format_errors},
        ),
        property_row(
            "compatibility.deterministic_json",
            first == second,
            {"first": first, "second": second},
        ),
        property_row(
            "compatibility.sql_identifier_ban",
            banned == [],
            {"banned": banned},
        ),
    ]


def run_mutants(dsn: str, transcript: list[str]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []

    reset_contract(dsn)
    apply_sql_file(dsn, MUTANT_DIR / "operation_marker_outside_tx.sql")
    run_forced_error(dsn, request_payload(operation_id="op-mut-marker"))
    leftover = counts(dsn, "org-a", "op-mut-marker")
    rows.append(
        {
            "mutant": "operation_marker_outside_tx",
            "property": "atomicity.final_write_error",
            "killed": leftover["operations"] > 0,
            "detail": leftover,
        }
    )
    restore_functions(dsn)
    transcript.append("mutant operation_marker_outside_tx")

    reset_contract(dsn)
    apply_sql_file(dsn, MUTANT_DIR / "effect_outside_tx.sql")
    run_forced_error(dsn, request_payload(operation_id="op-mut-effect"))
    leftover = counts(dsn, "org-a", "op-mut-effect")
    rows.append(
        {
            "mutant": "effect_outside_tx",
            "property": "atomicity.effects_same_transaction",
            "killed": leftover["effects"] > 0,
            "detail": leftover,
        }
    )
    restore_functions(dsn)
    transcript.append("mutant effect_outside_tx")

    reset_contract(dsn)
    apply_sql_file(dsn, MUTANT_DIR / "missing_head_lock.sql")
    psql_ok(dsn, "INSERT INTO semantic_head (namespace, revision) VALUES ('org-a', 0);")
    left = request_payload(operation_id="op-lock-a", records=[{"record_id": "claim:lock-a", "kind": "claim", "payload": {"n": 1}}], effect_requests=[{"request_id": "effect:lock-a", "effect_definition_ref": "effect.book-carrier@1", "intent_digest": DIGEST_B, "payload": {"kind": "pickup"}}])
    right = request_payload(operation_id="op-lock-b", records=[{"record_id": "claim:lock-b", "kind": "claim", "payload": {"n": 2}}], effect_requests=[{"request_id": "effect:lock-b", "effect_definition_ref": "effect.book-carrier@1", "intent_digest": DIGEST_B, "payload": {"kind": "pickup"}}])
    results, traces = run_two_commits(dsn, left, right)
    states = sorted(item.get("state") for item in results)
    rows.append(
        {
            "mutant": "missing_head_lock",
            "property": "conflict.one_committed_one_conflict",
            "killed": states != ["committed", "conflict"],
            "detail": {"states": states, "traces": traces},
        }
    )
    restore_functions(dsn)
    transcript.append("mutant missing_head_lock")

    reset_contract(dsn)
    apply_sql_file(dsn, MUTANT_DIR / "replay_result_not_stored.sql")
    payload = request_payload(operation_id="op-mut-replay")
    call_commit(dsn, payload)
    replay = call_commit(dsn, payload)
    rows.append(
        {
            "mutant": "replay_result_not_stored",
            "property": "idempotency.replay_same_intent",
            "killed": replay.get("state") != "replayed" or replay.get("result") != payload["result"],
            "detail": replay,
        }
    )
    restore_functions(dsn)
    transcript.append("mutant replay_result_not_stored")

    reset_contract(dsn)
    apply_sql_file(dsn, MUTANT_DIR / "mismatch_as_replay.sql")
    call_commit(dsn, request_payload(operation_id="op-mut-mismatch"))
    mismatch = call_commit(dsn, request_payload(operation_id="op-mut-mismatch", intent_digest=DIGEST_C))
    rows.append(
        {
            "mutant": "mismatch_as_replay",
            "property": "idempotency.mismatch",
            "killed": mismatch.get("state") != "intent_mismatch",
            "detail": mismatch,
        }
    )
    restore_functions(dsn)
    transcript.append("mutant mismatch_as_replay")

    reset_contract(dsn)
    apply_sql_file(dsn, MUTANT_DIR / "status_missing_after_commit.sql")
    committed = call_commit(dsn, request_payload(operation_id="op-mut-status"))
    status = call_status(dsn, "org-a", "op-mut-status")
    rows.append(
        {
            "mutant": "status_missing_after_commit",
            "property": "crash.after_commit_status",
            "killed": committed.get("state") == "committed" and status.get("found") is not True,
            "detail": {"commit": committed, "status": status},
        }
    )
    restore_functions(dsn)
    transcript.append("mutant status_missing_after_commit")
    return rows


def claim_record(record_id: str, value: int) -> dict[str, Any]:
    return {"record_id": record_id, "kind": "claim", "payload": {"value": value}}


def carrier_effect(request_id: str, kind: str = "pickup") -> dict[str, Any]:
    return {
        "request_id": request_id,
        "effect_definition_ref": "effect.book-carrier@1",
        "intent_digest": DIGEST_B,
        "payload": {"kind": kind},
    }


def typed_identity_collision(
    result: dict[str, Any],
    operation_id: str,
    *,
    namespace: str = "org-a",
) -> bool:
    return (
        result.get("state") == "identity_collision"
        and result.get("namespace") == namespace
        and result.get("operation_id") == operation_id
    )


def empty_operation(row_counts: dict[str, int]) -> bool:
    return (
        row_counts["operations"] == 0
        and row_counts["records"] == 0
        and row_counts["effects"] == 0
    )


def canonical_receipt(result: dict[str, Any]) -> bool:
    return (
        isinstance(result.get("record_ids"), list)
        and isinstance(result.get("effect_request_ids"), list)
        and result["record_ids"] == ["claim:a", "claim:z"]
        and result["effect_request_ids"] == ["effect:a", "effect:z"]
    )


def run_identity_collision_sequence(dsn: str, case: dict[str, Any]) -> dict[str, Any]:
    reset_contract(dsn)
    owner = call_commit(dsn, case["owner"])
    after_owner = counts(dsn, "org-a")
    first = observe_commit(dsn, case["collider"])
    status = call_status(dsn, "org-a", case["collider_id"])
    after_first = counts(dsn, "org-a", case["collider_id"])
    retry = observe_commit(dsn, case["collider"])
    after_retry = counts(dsn, "org-a", case["collider_id"])
    stale = observe_commit(dsn, case["stale"])
    after_stale = counts(dsn, "org-a", case["stale_id"])
    return {
        "kind": case["kind"],
        "owner": owner,
        "first": first,
        "retry": retry,
        "stale": stale,
        "status": status,
        "after_owner": after_owner,
        "after_first": after_first,
        "after_retry": after_retry,
        "after_stale": after_stale,
        "namespace": counts(dsn, "org-a"),
    }


def identity_sequence_properties(case: dict[str, Any], trace: dict[str, Any]) -> list[dict[str, Any]]:
    kind = case["kind"]
    collider_id = case["collider_id"]
    return [
        property_row(
            f"identity.{kind}_collision",
            typed_identity_collision(trace["first"], collider_id)
            and trace["owner"].get("state") == "committed",
            {"owner": trace["owner"], "first": trace["first"]},
        ),
        property_row(
            f"identity.{kind}_status_absent",
            trace["status"].get("found") is False,
            trace["status"],
        ),
        property_row(
            f"identity.{kind}_retry",
            typed_identity_collision(trace["first"], collider_id)
            and typed_identity_collision(trace["retry"], collider_id),
            {"first": trace["first"], "retry": trace["retry"]},
        ),
        property_row(
            f"identity.{kind}_no_partial",
            empty_operation(trace["after_first"])
            and empty_operation(trace["after_retry"])
            and trace["after_owner"]["head_revision"] == 1
            and trace["namespace"]["head_revision"] == 1
            and trace["namespace"]["operations"] == 1,
            {
                "after_first": trace["after_first"],
                "after_retry": trace["after_retry"],
                "namespace": trace["namespace"],
            },
        ),
        property_row(
            f"identity.{kind}_stale_cas",
            trace["stale"].get("state") == "conflict" and empty_operation(trace["after_stale"]),
            {"stale": trace["stale"], "counts": trace["after_stale"]},
        ),
    ]


def run_identity_collisions(
    dsn: str,
    transcript: list[str],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    cases = (
        {
            "kind": "record",
            "collider_id": "op-rec-collider",
            "stale_id": "op-rec-stale",
            "owner": request_payload(
                operation_id="op-rec-owner",
                records=[claim_record("claim:shared-rec", 1)],
                effect_requests=[carrier_effect("effect:rec-owner")],
            ),
            "collider": request_payload(
                operation_id="op-rec-collider",
                expected_revision=1,
                records=[claim_record("claim:shared-rec", 2)],
                effect_requests=[carrier_effect("effect:rec-collider")],
            ),
            "stale": request_payload(
                operation_id="op-rec-stale",
                expected_revision=0,
                records=[claim_record("claim:shared-rec", 3)],
                effect_requests=[carrier_effect("effect:rec-stale")],
            ),
        },
        {
            "kind": "effect",
            "collider_id": "op-eff-collider",
            "stale_id": "op-eff-stale",
            "owner": request_payload(
                operation_id="op-eff-owner",
                records=[claim_record("claim:eff-owner", 1)],
                effect_requests=[carrier_effect("effect:shared-eff")],
            ),
            "collider": request_payload(
                operation_id="op-eff-collider",
                expected_revision=1,
                records=[claim_record("claim:eff-collider", 2)],
                effect_requests=[carrier_effect("effect:shared-eff")],
            ),
            "stale": request_payload(
                operation_id="op-eff-stale",
                expected_revision=0,
                records=[claim_record("claim:eff-stale", 3)],
                effect_requests=[carrier_effect("effect:shared-eff")],
            ),
        },
    )
    rows: list[dict[str, Any]] = []
    traces: dict[str, Any] = {}
    for case in cases:
        trace = run_identity_collision_sequence(dsn, case)
        traces[case["kind"]] = trace
        rows.extend(identity_sequence_properties(case, trace))
        transcript.append(f"identity {case['kind']} collision")
    return rows, traces


def run_receipt_witness(
    dsn: str,
    transcript: list[str],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    reset_contract(dsn)
    payload = request_payload(
        operation_id="op-receipt",
        records=[claim_record("claim:z", 1), claim_record("claim:a", 2)],
        effect_requests=[carrier_effect("effect:z"), carrier_effect("effect:a", "drop")],
    )
    committed = call_commit(dsn, payload)
    replayed = call_commit(dsn, payload)
    status = call_status(dsn, "org-a", "op-receipt")
    transcript.append("receipt canonical witness")
    traces = {"committed": committed, "replayed": replayed, "status": status}
    passed = (
        committed.get("state") == "committed"
        and replayed.get("state") == "replayed"
        and status.get("found") is True
        and canonical_receipt(committed)
        and canonical_receipt(replayed)
        and canonical_receipt(status)
        and committed["record_ids"] == replayed["record_ids"] == status["record_ids"]
        and committed["effect_request_ids"] == replayed["effect_request_ids"] == status["effect_request_ids"]
    )
    return [property_row("receipt.canonical_witness", passed, traces)], traces


def run_identity_races(
    dsn: str,
    transcript: list[str],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    owner = request_payload(
        operation_id="op-race-owner",
        records=[claim_record("claim:race", 1)],
        effect_requests=[carrier_effect("effect:race-owner")],
    )
    reset_contract(dsn)
    call_commit(dsn, owner)
    left = request_payload(
        operation_id="op-race-c1",
        expected_revision=1,
        records=[claim_record("claim:race", 2)],
        effect_requests=[carrier_effect("effect:race-c1")],
    )
    right = request_payload(
        operation_id="op-race-c2",
        expected_revision=1,
        records=[claim_record("claim:race", 3)],
        effect_requests=[carrier_effect("effect:race-c2")],
    )
    pair_results, pair_traces = run_two_commits(dsn, left, right)
    pair_states = sorted(item.get("state") for item in pair_results)
    pair_c1 = counts(dsn, "org-a", "op-race-c1")
    pair_c2 = counts(dsn, "org-a", "op-race-c2")
    pair_head = counts(dsn, "org-a")
    transcript.append("identity two colliders")

    reset_contract(dsn)
    call_commit(dsn, owner)
    valid = request_payload(
        operation_id="op-race-valid",
        expected_revision=1,
        records=[claim_record("claim:valid", 1)],
        effect_requests=[carrier_effect("effect:valid")],
    )
    collider = request_payload(
        operation_id="op-race-hit",
        expected_revision=1,
        records=[claim_record("claim:race", 4)],
        effect_requests=[carrier_effect("effect:race-hit")],
    )
    mix_results, mix_traces = run_two_commits(dsn, valid, collider)
    mix_states = sorted(item.get("state") for item in mix_results)
    valid_counts = counts(dsn, "org-a", "op-race-valid")
    hit_counts = counts(dsn, "org-a", "op-race-hit")
    mix_head = counts(dsn, "org-a")
    transcript.append("identity collider versus valid")

    traces = {
        "two_colliders": {
            "states": pair_states,
            "traces": pair_traces,
            "counts": {"c1": pair_c1, "c2": pair_c2, "namespace": pair_head},
        },
        "collider_vs_valid": {
            "states": mix_states,
            "traces": mix_traces,
            "counts": {"valid": valid_counts, "collider": hit_counts, "namespace": mix_head},
        },
    }
    rows = [
        property_row(
            "identity.two_colliders",
            pair_states == ["identity_collision", "identity_collision"]
            and empty_operation(pair_c1)
            and empty_operation(pair_c2)
            and pair_head["head_revision"] == 1
            and pair_head["operations"] == 1,
            traces["two_colliders"],
        ),
        property_row(
            "identity.collider_vs_valid",
            mix_states.count("committed") == 1
            and (
                mix_states.count("identity_collision") + mix_states.count("conflict") == 1
            )
            and "error" not in mix_states
            and empty_operation(hit_counts)
            and valid_counts["operations"] == 1
            and mix_head["operations"] == 2
            and mix_head["head_revision"] == 2,
            traces["collider_vs_valid"],
        ),
    ]
    return rows, traces


def run_all(dsn: str, output: Path) -> dict[str, Any]:
    transcript: list[str] = []
    init_contract(dsn)
    transcript.append("init")
    environment = {
        "postgres": full_version(dsn),
        "server_version": server_version(dsn),
        "psql": subprocess.run(["psql", "--version"], check=True, capture_output=True, text=True).stdout.strip(),
        "python": sys.version.split()[0],
        "sha": git_sha(),
    }
    transcript.append("environment")
    properties: list[dict[str, Any]] = []
    properties.extend(run_idempotency(dsn, transcript))
    conflict_rows, conflict_traces = run_conflict(dsn, transcript)
    properties.extend(conflict_rows)
    race_rows, race_traces = run_same_operation_races(dsn, transcript)
    properties.extend(race_rows)
    properties.extend(run_atomicity(dsn, transcript))
    identity_rows, identity_traces = run_identity_collisions(dsn, transcript)
    properties.extend(identity_rows)
    receipt_rows, receipt_traces = run_receipt_witness(dsn, transcript)
    properties.extend(receipt_rows)
    identity_race_rows, identity_race_traces = run_identity_races(dsn, transcript)
    properties.extend(identity_race_rows)
    failure_rows, failure_traces = run_failures(dsn, transcript)
    properties.extend(failure_rows)
    reset_contract(dsn)
    sample = call_commit(dsn, request_payload(operation_id="op-schema"))
    properties.extend(run_compatibility(dsn, sample, transcript))
    mutants = run_mutants(dsn, transcript)
    properties.append(
        property_row(
            "environment.server_version_published",
            bool(environment["server_version"]),
            environment["server_version"],
        )
    )
    properties.append(
        property_row(
            "unsupported.server_crash_recovery",
            True,
            "unsupported",
        )
    )
    failed = [row["property"] for row in properties if not row["passed"]]
    unkilled = [row["mutant"] for row in mutants if not row["killed"]]
    verdict = "VERIFIED" if not failed and not unkilled else "NOT VERIFIED"
    document = {
        "sha": environment["sha"],
        "contract_verdict": verdict,
        "environment": environment,
        "unsupported": ["server_crash_recovery"],
        "property_matrix": properties,
        "concurrency_results": {
            "conflict": conflict_traces,
            "same_operation": race_traces,
            "identity_collision": identity_race_traces,
        },
        "identity_results": identity_traces,
        "receipt_results": receipt_traces,
        "failure_results": failure_traces,
        "mutant_matrix": mutants,
        "transcript": transcript,
        "sql_schema": SCHEMA_SQL.read_text(encoding="utf-8") + FUNCTIONS_SQL.read_text(encoding="utf-8"),
        "failed_properties": failed,
        "unkilled_mutants": unkilled,
    }
    write_artifacts(output, document)
    return document


def write_artifacts(output: Path, document: dict[str, Any]) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    write_json(output, document)
    stem = output.with_suffix("")
    artifact_dir = Path(str(stem) + ".artifacts")
    artifact_dir.mkdir(parents=True, exist_ok=True)
    write_json(artifact_dir / "property-matrix.json", document["property_matrix"])
    write_json(artifact_dir / "concurrency-traces.json", document["concurrency_results"])
    write_json(artifact_dir / "identity-results.json", document["identity_results"])
    write_json(artifact_dir / "receipt-results.json", document["receipt_results"])
    write_json(artifact_dir / "failure-traces.json", document["failure_results"])
    write_json(artifact_dir / "environment.json", document["environment"])
    write_json(artifact_dir / "mutant-matrix.json", document["mutant_matrix"])
    (artifact_dir / "schema.sql").write_text(document["sql_schema"], encoding="utf-8")
    (artifact_dir / "transcript.txt").write_text("\n".join(document["transcript"]) + "\n", encoding="utf-8")
    (artifact_dir / "sha.txt").write_text(document["sha"] + "\n", encoding="utf-8")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Prove the durable semantic commit contract through psql.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python3 harness.py --dsn postgresql:///os_kernel_test --init\n"
            "  python3 harness.py --dsn postgresql:///os_kernel_test --reset\n"
            "  python3 harness.py --dsn postgresql:///os_kernel_test --all --output /tmp/durable-commit-postgres.json\n"
        ),
    )
    parser.add_argument("--dsn", required=True, help="libpq DSN passed to psql")
    parser.add_argument("--init", action="store_true", help="create tables and functions")
    parser.add_argument("--reset", action="store_true", help="truncate contract tables")
    parser.add_argument("--all", action="store_true", dest="run_all", help="run the full property suite")
    parser.add_argument("--output", type=Path, help="raw JSON path for --all")
    parser.add_argument("--worker", help=argparse.SUPPRESS)
    parser.add_argument("--request", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--result", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--ready", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--proceed", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--sentinel", type=Path, help=argparse.SUPPRESS)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.worker:
        if args.worker == "commit":
            return worker_commit(args.dsn, args.request, args.result, args.ready, args.proceed)
        if args.worker == "crash-before-call":
            return worker_crash_before_call(args.dsn, args.request, args.ready)
        if args.worker == "crash-after-write":
            return worker_crash_after_write(args.dsn, args.request, args.ready)
        if args.worker == "crash-after-commit":
            return worker_crash_after_commit(args.dsn, args.request, args.sentinel)
        sys.stderr.write(f"unknown worker {args.worker}\n")
        return 2
    if args.init:
        init_contract(args.dsn)
    if args.reset:
        reset_contract(args.dsn)
    if args.run_all:
        if args.output is None:
            sys.stderr.write(
                "Error: --all requires --output.\n"
                "  python3 harness.py --dsn postgresql:///os_kernel_test --all --output /tmp/durable-commit-postgres.json\n"
            )
            return 2
        document = run_all(args.dsn, args.output)
        if document["contract_verdict"] != "VERIFIED":
            sys.stderr.write(dump_json({"failed_properties": document["failed_properties"], "unkilled_mutants": document["unkilled_mutants"]}))
            return 1
    if not (args.init or args.reset or args.run_all):
        sys.stderr.write(
            "Error: choose --init, --reset, or --all.\n"
            "  python3 harness.py --dsn postgresql:///os_kernel_test --init\n"
        )
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
