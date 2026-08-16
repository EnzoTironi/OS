#!/usr/bin/env python3
"""Executable PostgreSQL 18 experiment for issue #39.

This is research, not production persistence code. It tests a deliberately small
subset of the storage competency suite against a real PostgreSQL server:

* write-skew can pass under REPEATABLE READ but is rejected under SERIALIZABLE;
* range exclusion can enforce an overlapping temporal predicate;
* semantic operation identity can be committed atomically with business state;
* same operation ID + different intent is rejected;
* source binding history can preserve different targets over non-overlapping eras;
* a snapshot observation can exist without fabricated domain events.

The test intentionally does NOT claim this proves the full PostgreSQL-centered
architecture. It only moves several high-risk requirements from prose to evidence.
"""

from __future__ import annotations

import json
import os
import threading
from dataclasses import dataclass
from datetime import datetime, timezone

import psycopg
from psycopg.errors import ExclusionViolation, SerializationFailure


DSN = os.getenv("STORAGE39_DSN", "postgresql://postgres:postgres@localhost:5432/postgres")
SCHEMA = "storage39"


@dataclass
class ConcurrentResult:
    committed: bool = False
    serialization_failure: bool = False
    error: str | None = None


def connect(*, autocommit: bool = True) -> psycopg.Connection:
    return psycopg.connect(DSN, autocommit=autocommit)


def reset_schema() -> None:
    with connect() as conn:
        conn.execute(f"DROP SCHEMA IF EXISTS {SCHEMA} CASCADE")
        conn.execute(f"CREATE SCHEMA {SCHEMA}")
        conn.execute(f"SET search_path TO {SCHEMA}")
        conn.execute(
            """
            CREATE TABLE on_call (
                doctor_id integer PRIMARY KEY,
                active boolean NOT NULL
            )
            """
        )
        conn.execute("INSERT INTO on_call VALUES (1, true), (2, true)")

        conn.execute(
            """
            CREATE TABLE reservation (
                reservation_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                during tstzrange NOT NULL,
                EXCLUDE USING gist (during WITH &&)
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE account (
                account_id text PRIMARY KEY,
                balance bigint NOT NULL
            )
            """
        )
        conn.execute("INSERT INTO account VALUES ('cash', 0)")
        conn.execute(
            """
            CREATE TABLE semantic_operation (
                operation_id text PRIMARY KEY,
                intent_digest text NOT NULL,
                result jsonb,
                committed_at timestamptz NOT NULL DEFAULT clock_timestamp()
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE source_binding (
                binding_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                source_key text NOT NULL,
                business_id text NOT NULL,
                effective_from timestamptz NOT NULL,
                effective_to timestamptz,
                admitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
                CHECK (effective_to IS NULL OR effective_to > effective_from)
            )
            """
        )
        conn.execute(
            "CREATE INDEX source_binding_lookup ON source_binding(source_key, effective_from, effective_to)"
        )

        conn.execute(
            """
            CREATE TABLE source_observation (
                observation_id text PRIMARY KEY,
                kind text NOT NULL,
                subject_ref text NOT NULL,
                observed_at timestamptz,
                quantity numeric,
                provenance jsonb NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE domain_event (
                event_id text PRIMARY KEY,
                event_type text NOT NULL,
                subject_ref text NOT NULL,
                occurred_at timestamptz
            )
            """
        )


def reset_on_call() -> None:
    with connect() as conn:
        conn.execute(f"SET search_path TO {SCHEMA}")
        conn.execute("UPDATE on_call SET active = true")


def run_write_skew(isolation: str) -> tuple[list[ConcurrentResult], int]:
    """Run the classic cross-row invariant race.

    Business invariant: at least one doctor must remain active.
    Each transaction checks the aggregate and deactivates a different row.
    """

    reset_on_call()
    barrier = threading.Barrier(2)
    results = [ConcurrentResult(), ConcurrentResult()]

    def worker(index: int, doctor_id: int) -> None:
        conn = connect(autocommit=True)
        try:
            conn.execute(f"SET search_path TO {SCHEMA}")
            conn.execute(f"BEGIN ISOLATION LEVEL {isolation}")
            active = conn.execute("SELECT count(*) FROM on_call WHERE active").fetchone()[0]
            if active < 2:
                raise AssertionError(f"test setup invalid: saw {active} active doctors")
            barrier.wait(timeout=10)
            conn.execute("UPDATE on_call SET active = false WHERE doctor_id = %s", (doctor_id,))
            try:
                conn.execute("COMMIT")
                results[index].committed = True
            except SerializationFailure:
                results[index].serialization_failure = True
                conn.execute("ROLLBACK")
        except SerializationFailure:
            results[index].serialization_failure = True
            try:
                conn.execute("ROLLBACK")
            except psycopg.Error:
                pass
        except Exception as exc:  # pragma: no cover - reported with detail on CI failure
            results[index].error = repr(exc)
            try:
                conn.execute("ROLLBACK")
            except psycopg.Error:
                pass
        finally:
            conn.close()

    threads = [
        threading.Thread(target=worker, args=(0, 1), daemon=True),
        threading.Thread(target=worker, args=(1, 2), daemon=True),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=20)
    if any(thread.is_alive() for thread in threads):
        raise AssertionError("concurrency test hung")
    if any(result.error for result in results):
        raise AssertionError(f"concurrency worker errors: {results}")

    with connect() as conn:
        conn.execute(f"SET search_path TO {SCHEMA}")
        remaining = conn.execute("SELECT count(*) FROM on_call WHERE active").fetchone()[0]
    return results, remaining


def test_isolation_levels() -> None:
    rr, rr_remaining = run_write_skew("REPEATABLE READ")
    if sum(result.committed for result in rr) != 2 or rr_remaining != 0:
        raise AssertionError(
            "expected REPEATABLE READ write-skew demonstration: both disjoint updates commit and violate aggregate invariant; "
            f"results={rr}, remaining={rr_remaining}"
        )

    serial, serial_remaining = run_write_skew("SERIALIZABLE")
    if sum(result.committed for result in serial) != 1:
        raise AssertionError(f"expected exactly one SERIALIZABLE transaction to commit: {serial}")
    if sum(result.serialization_failure for result in serial) != 1:
        raise AssertionError(f"expected exactly one serialization failure: {serial}")
    if serial_remaining != 1:
        raise AssertionError(f"SERIALIZABLE must preserve at least-one-active invariant, remaining={serial_remaining}")


def test_range_exclusion() -> None:
    with connect() as conn:
        conn.execute(f"SET search_path TO {SCHEMA}")
        conn.execute(
            "INSERT INTO reservation(during) VALUES (tstzrange('2026-08-16 10:00+00', '2026-08-16 11:00+00', '[)'))"
        )
        try:
            conn.execute(
                "INSERT INTO reservation(during) VALUES (tstzrange('2026-08-16 10:30+00', '2026-08-16 11:30+00', '[)'))"
            )
        except ExclusionViolation:
            pass
        else:
            raise AssertionError("overlapping range should violate exclusion constraint")

        conn.execute(
            "INSERT INTO reservation(during) VALUES (tstzrange('2026-08-16 11:00+00', '2026-08-16 12:00+00', '[)'))"
        )
        count = conn.execute("SELECT count(*) FROM reservation").fetchone()[0]
        if count != 2:
            raise AssertionError(f"expected two non-overlapping reservations, got {count}")


def apply_deposit(operation_id: str, intent_digest: str, amount: int) -> str:
    """Commit operation marker + business mutation atomically."""
    conn = connect(autocommit=True)
    try:
        conn.execute(f"SET search_path TO {SCHEMA}")
        conn.execute("BEGIN ISOLATION LEVEL SERIALIZABLE")
        inserted = conn.execute(
            """
            INSERT INTO semantic_operation(operation_id, intent_digest)
            VALUES (%s, %s)
            ON CONFLICT (operation_id) DO NOTHING
            RETURNING operation_id
            """,
            (operation_id, intent_digest),
        ).fetchone()
        if inserted is None:
            stored = conn.execute(
                "SELECT intent_digest FROM semantic_operation WHERE operation_id = %s",
                (operation_id,),
            ).fetchone()[0]
            if stored != intent_digest:
                conn.execute("ROLLBACK")
                return "mismatch"
            conn.execute("ROLLBACK")
            return "replayed"

        new_balance = conn.execute(
            "UPDATE account SET balance = balance + %s WHERE account_id = 'cash' RETURNING balance",
            (amount,),
        ).fetchone()[0]
        conn.execute(
            "UPDATE semantic_operation SET result = %s::jsonb WHERE operation_id = %s",
            (json.dumps({"balance": new_balance}), operation_id),
        )
        conn.execute("COMMIT")
        return "committed"
    except Exception:
        try:
            conn.execute("ROLLBACK")
        finally:
            conn.close()
        raise
    finally:
        if not conn.closed:
            conn.close()


def test_semantic_operation_marker() -> None:
    if apply_deposit("O-deposit-1", "deposit:50", 50) != "committed":
        raise AssertionError("first semantic operation must commit")
    if apply_deposit("O-deposit-1", "deposit:50", 50) != "replayed":
        raise AssertionError("same operation/intent must replay without second mutation")
    if apply_deposit("O-deposit-1", "deposit:500", 500) != "mismatch":
        raise AssertionError("same operation id with changed intent must be rejected")

    with connect() as conn:
        conn.execute(f"SET search_path TO {SCHEMA}")
        balance = conn.execute("SELECT balance FROM account WHERE account_id = 'cash'").fetchone()[0]
        markers = conn.execute("SELECT count(*) FROM semantic_operation").fetchone()[0]
        if balance != 50 or markers != 1:
            raise AssertionError(f"operation replay/mismatch changed state: balance={balance}, markers={markers}")


def test_binding_history() -> None:
    with connect() as conn:
        conn.execute(f"SET search_path TO {SCHEMA}")
        conn.execute(
            """
            INSERT INTO source_binding(source_key, business_id, effective_from, effective_to)
            VALUES
              ('legacy:123', 'Party-A', '2020-01-01+00', '2025-01-01+00'),
              ('legacy:123', 'Party-B', '2026-01-01+00', NULL)
            """
        )
        old = conn.execute(
            """
            SELECT business_id FROM source_binding
            WHERE source_key = 'legacy:123'
              AND effective_from <= '2024-06-01+00'
              AND (effective_to IS NULL OR effective_to > '2024-06-01+00')
            """
        ).fetchone()[0]
        current = conn.execute(
            """
            SELECT business_id FROM source_binding
            WHERE source_key = 'legacy:123'
              AND effective_from <= '2026-08-16+00'
              AND (effective_to IS NULL OR effective_to > '2026-08-16+00')
            """
        ).fetchone()[0]
        if (old, current) != ("Party-A", "Party-B"):
            raise AssertionError(f"binding history lost source-key reuse: old={old}, current={current}")


def test_snapshot_without_fabricated_event() -> None:
    with connect() as conn:
        conn.execute(f"SET search_path TO {SCHEMA}")
        conn.execute(
            """
            INSERT INTO source_observation(observation_id, kind, subject_ref, observed_at, quantity, provenance)
            VALUES ('OBS-stock-1', 'inventory-position', 'Product-P@Warehouse-W',
                    '2026-08-16 12:00+00', 108,
                    '{"source":"stock-pdf","capture":"sha256:example"}'::jsonb)
            """
        )
        observation = conn.execute(
            "SELECT quantity FROM source_observation WHERE observation_id = 'OBS-stock-1'"
        ).fetchone()[0]
        events = conn.execute("SELECT count(*) FROM domain_event").fetchone()[0]
        if observation != 108 or events != 0:
            raise AssertionError(
                f"snapshot observation must not require fabricated domain Event: quantity={observation}, events={events}"
            )


def main() -> int:
    reset_schema()
    test_isolation_levels()
    test_range_exclusion()
    test_semantic_operation_marker()
    test_binding_history()
    test_snapshot_without_fabricated_event()
    print("ok: PostgreSQL 18 passed issue #39 executable competency subset")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
