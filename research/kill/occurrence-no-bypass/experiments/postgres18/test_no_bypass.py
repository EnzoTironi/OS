#!/usr/bin/env python3
"""PostgreSQL 18 competency experiment for issue #157.

This proves only that the generic sealed-semantic lifecycle can be projected to
a real local authority boundary without hard-coding an Event/Occurrence type.
It does not claim that a database superuser cannot intentionally disable the
control; superuser/physical compromise is an operational security boundary.
"""

from __future__ import annotations

import json
import os
import uuid

import psycopg
from psycopg import sql


DSN = os.environ["STORAGE39_DSN"]
SCHEMA = f"occ157_{uuid.uuid4().hex[:10]}"


def expect_failure(cur, statement: str, params=()) -> None:
    try:
        cur.execute("SAVEPOINT expected_failure")
        cur.execute(statement, params)
    except psycopg.Error:
        cur.execute("ROLLBACK TO SAVEPOINT expected_failure")
        cur.execute("RELEASE SAVEPOINT expected_failure")
        return
    cur.execute("RELEASE SAVEPOINT expected_failure")
    raise AssertionError(f"statement unexpectedly succeeded: {statement}")


def main() -> None:
    with psycopg.connect(DSN, autocommit=True) as admin:
        with admin.cursor() as cur:
            cur.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(SCHEMA)))
            cur.execute(
                sql.SQL(
                    """
                    CREATE TABLE {}.semantic_record (
                        record_id text PRIMARY KEY,
                        type_name text NOT NULL,
                        sealed_semantics boolean NOT NULL,
                        semantic_core jsonb NOT NULL,
                        payload jsonb NOT NULL DEFAULT '{{}}'::jsonb,
                        representation_version integer NOT NULL DEFAULT 1
                    )
                    """
                ).format(sql.Identifier(SCHEMA))
            )
            cur.execute(
                sql.SQL(
                    """
                    CREATE FUNCTION {}.protect_sealed_semantics()
                    RETURNS trigger LANGUAGE plpgsql AS $$
                    BEGIN
                      IF OLD.sealed_semantics AND NEW.semantic_core IS DISTINCT FROM OLD.semantic_core THEN
                        RAISE EXCEPTION 'sealed semantic core cannot be replaced in place';
                      END IF;
                      RETURN NEW;
                    END
                    $$
                    """
                ).format(sql.Identifier(SCHEMA))
            )
            cur.execute(
                sql.SQL(
                    """
                    CREATE TRIGGER protect_sealed_semantics
                    BEFORE UPDATE OF semantic_core ON {}.semantic_record
                    FOR EACH ROW EXECUTE FUNCTION {}.protect_sealed_semantics()
                    """
                ).format(sql.Identifier(SCHEMA), sql.Identifier(SCHEMA))
            )
            cur.execute("DROP ROLE IF EXISTS occ157_app")
            cur.execute("DROP ROLE IF EXISTS occ157_admin")
            cur.execute("CREATE ROLE occ157_app NOLOGIN")
            cur.execute("CREATE ROLE occ157_admin NOLOGIN")
            cur.execute(sql.SQL("GRANT USAGE ON SCHEMA {} TO occ157_app, occ157_admin").format(sql.Identifier(SCHEMA)))
            cur.execute(
                sql.SQL("GRANT SELECT, INSERT ON {}.semantic_record TO occ157_app").format(sql.Identifier(SCHEMA))
            )
            cur.execute(
                sql.SQL(
                    "GRANT UPDATE(payload, representation_version) ON {}.semantic_record TO occ157_app"
                ).format(sql.Identifier(SCHEMA))
            )
            cur.execute(
                sql.SQL("GRANT SELECT, INSERT, UPDATE ON {}.semantic_record TO occ157_admin").format(sql.Identifier(SCHEMA))
            )
            insert = sql.SQL(
                """
                INSERT INTO {}.semantic_record(
                    record_id,type_name,sealed_semantics,semantic_core,payload
                ) VALUES (%s,%s,%s,%s::jsonb,%s::jsonb)
                """
            ).format(sql.Identifier(SCHEMA))
            for row in [
                ("stock:1", "StockMovement", True, {"qty": 10, "sku": "X"}, {"operator": "A"}),
                ("definition:1", "PublishedDefinition", True, {"name": "Account", "schema": 1}, {}),
                ("draft:1", "MutableNote", False, {"text": "draft"}, {}),
            ]:
                cur.execute(insert, (row[0], row[1], row[2], json.dumps(row[3]), json.dumps(row[4])))

    with psycopg.connect(DSN) as conn:
        with conn.cursor() as cur:
            # Ordinary application role cannot even address semantic_core update.
            cur.execute("SET ROLE occ157_app")
            expect_failure(
                cur,
                sql.SQL("UPDATE {}.semantic_record SET semantic_core=%s::jsonb WHERE record_id='stock:1'")
                .format(sql.Identifier(SCHEMA))
                .as_string(cur),
                (json.dumps({"qty": 99, "sku": "X"}),),
            )
            cur.execute(
                sql.SQL("UPDATE {}.semantic_record SET payload=%s::jsonb WHERE record_id='stock:1'").format(sql.Identifier(SCHEMA)),
                (json.dumps({}),),
            )
            cur.execute(
                sql.SQL("UPDATE {}.semantic_record SET representation_version=2 WHERE record_id='stock:1'").format(sql.Identifier(SCHEMA))
            )
            cur.execute("RESET ROLE")

            # Privileged semantic admin has column UPDATE, but generic trigger
            # still rejects semantic replacement for both an occurrence and a
            # non-event published definition. No Type name appears in trigger.
            cur.execute("SET ROLE occ157_admin")
            for record_id, replacement in [
                ("stock:1", {"qty": 99, "sku": "X"}),
                ("definition:1", {"name": "Account", "schema": 2}),
            ]:
                expect_failure(
                    cur,
                    sql.SQL("UPDATE {}.semantic_record SET semantic_core=%s::jsonb WHERE record_id=%s")
                    .format(sql.Identifier(SCHEMA))
                    .as_string(cur),
                    (json.dumps(replacement), record_id),
                )

            # Same generic mechanism permits a type whose semantics are not sealed.
            cur.execute(
                sql.SQL("UPDATE {}.semantic_record SET semantic_core=%s::jsonb WHERE record_id='draft:1'").format(sql.Identifier(SCHEMA)),
                (json.dumps({"text": "edited"}),),
            )
            cur.execute("RESET ROLE")
            conn.commit()

    with psycopg.connect(DSN, autocommit=True) as admin:
        with admin.cursor() as cur:
            cur.execute(
                sql.SQL(
                    "SELECT semantic_core, payload, representation_version FROM {}.semantic_record WHERE record_id='stock:1'"
                ).format(sql.Identifier(SCHEMA))
            )
            core, payload, rep = cur.fetchone()
            assert core == {"qty": 10, "sku": "X"}
            assert payload == {}
            assert rep == 2
            cur.execute(
                sql.SQL("SELECT semantic_core FROM {}.semantic_record WHERE record_id='definition:1'").format(sql.Identifier(SCHEMA))
            )
            assert cur.fetchone()[0] == {"name": "Account", "schema": 1}
            cur.execute(
                sql.SQL("SELECT semantic_core FROM {}.semantic_record WHERE record_id='draft:1'").format(sql.Identifier(SCHEMA))
            )
            assert cur.fetchone()[0] == {"text": "edited"}
            cur.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(SCHEMA)))
            cur.execute("DROP ROLE occ157_app")
            cur.execute("DROP ROLE occ157_admin")

    print(
        "ok: PostgreSQL 18 generic sealed-semantic boundary blocks occurrence + "
        "non-event semantic rewrites; payload/representation remain mutable"
    )


if __name__ == "__main__":
    main()
