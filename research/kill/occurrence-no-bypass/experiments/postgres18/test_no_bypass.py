#!/usr/bin/env python3
"""PostgreSQL 18 competency experiment for issue #157.

This proves only that a generic Type-revision contract can protect committed
semantic meaning at a real local authority boundary without hard-coding an
Event/Occurrence type. The protection contract is *not* a mutable flag on the
business row: records are pinned to immutable Type revisions whose contracts
are governed separately.

The experiment does not claim that a database/schema owner or superuser cannot
intentionally disable triggers or rewrite storage. Physical compromise and
break-glass governance remain a separate operational-security boundary.
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

            # Contract-bearing Type revisions are independent authority records.
            # Existing revisions are immutable. A migration may add a new revision
            # but cannot rewrite what an old revision meant.
            cur.execute(
                sql.SQL(
                    """
                    CREATE TABLE {}.type_revision (
                        type_name text NOT NULL,
                        revision text NOT NULL,
                        contracts jsonb NOT NULL DEFAULT '[]'::jsonb,
                        PRIMARY KEY(type_name, revision),
                        CHECK (jsonb_typeof(contracts) = 'array')
                    )
                    """
                ).format(sql.Identifier(SCHEMA))
            )
            cur.execute(
                sql.SQL(
                    """
                    CREATE FUNCTION {}.protect_type_revision_history()
                    RETURNS trigger LANGUAGE plpgsql AS $$
                    BEGIN
                      RAISE EXCEPTION 'published Type revision cannot be updated or deleted in place';
                    END
                    $$
                    """
                ).format(sql.Identifier(SCHEMA))
            )
            cur.execute(
                sql.SQL(
                    """
                    CREATE TRIGGER protect_type_revision_history
                    BEFORE UPDATE OR DELETE ON {}.type_revision
                    FOR EACH ROW EXECUTE FUNCTION {}.protect_type_revision_history()
                    """
                ).format(sql.Identifier(SCHEMA), sql.Identifier(SCHEMA))
            )

            cur.execute(
                sql.SQL(
                    """
                    CREATE TABLE {}.semantic_record (
                        record_id text PRIMARY KEY,
                        type_name text NOT NULL,
                        type_revision text NOT NULL,
                        semantic_core jsonb NOT NULL,
                        payload jsonb NOT NULL DEFAULT '{{}}'::jsonb,
                        representation_version integer NOT NULL DEFAULT 1,
                        FOREIGN KEY(type_name, type_revision)
                          REFERENCES {}.type_revision(type_name, revision)
                    )
                    """
                ).format(sql.Identifier(SCHEMA), sql.Identifier(SCHEMA))
            )
            cur.execute(
                sql.SQL(
                    """
                    CREATE FUNCTION {}.protect_semantic_binding_and_core()
                    RETURNS trigger LANGUAGE plpgsql AS $$
                    DECLARE
                      type_contracts jsonb;
                    BEGIN
                      IF NEW.type_name IS DISTINCT FROM OLD.type_name
                         OR NEW.type_revision IS DISTINCT FROM OLD.type_revision THEN
                        RAISE EXCEPTION 'accepted record Type revision binding cannot be rewritten in place';
                      END IF;

                      SELECT contracts INTO STRICT type_contracts
                        FROM {}.type_revision
                       WHERE type_name = OLD.type_name AND revision = OLD.type_revision;

                      IF type_contracts ? 'sealed_semantics'
                         AND NEW.semantic_core IS DISTINCT FROM OLD.semantic_core THEN
                        RAISE EXCEPTION 'sealed semantic core cannot be replaced in place';
                      END IF;
                      RETURN NEW;
                    END
                    $$
                    """
                ).format(sql.Identifier(SCHEMA), sql.Identifier(SCHEMA))
            )
            cur.execute(
                sql.SQL(
                    """
                    CREATE TRIGGER protect_semantic_binding_and_core
                    BEFORE UPDATE OF type_name, type_revision, semantic_core ON {}.semantic_record
                    FOR EACH ROW EXECUTE FUNCTION {}.protect_semantic_binding_and_core()
                    """
                ).format(sql.Identifier(SCHEMA), sql.Identifier(SCHEMA))
            )

            for role in ["occ157_app", "occ157_admin", "occ157_type_admin"]:
                cur.execute(sql.SQL("DROP ROLE IF EXISTS {}").format(sql.Identifier(role)))
                cur.execute(sql.SQL("CREATE ROLE {} NOLOGIN").format(sql.Identifier(role)))
            cur.execute(
                sql.SQL("GRANT USAGE ON SCHEMA {} TO occ157_app, occ157_admin, occ157_type_admin")
                .format(sql.Identifier(SCHEMA))
            )

            # Type migration authority may add revisions and is deliberately
            # granted UPDATE/DELETE too; the generic trigger, not mere ACL luck,
            # must reject rewriting published revisions.
            cur.execute(
                sql.SQL("GRANT SELECT, INSERT, UPDATE, DELETE ON {}.type_revision TO occ157_type_admin")
                .format(sql.Identifier(SCHEMA))
            )
            cur.execute(
                sql.SQL("GRANT SELECT ON {}.type_revision TO occ157_app, occ157_admin")
                .format(sql.Identifier(SCHEMA))
            )

            cur.execute(
                sql.SQL("GRANT SELECT, INSERT ON {}.semantic_record TO occ157_app")
                .format(sql.Identifier(SCHEMA))
            )
            cur.execute(
                sql.SQL("GRANT UPDATE(payload, representation_version) ON {}.semantic_record TO occ157_app")
                .format(sql.Identifier(SCHEMA))
            )
            # Privileged semantic admin can address every record column. The
            # trigger must still make Type binding/core downgrade impossible.
            cur.execute(
                sql.SQL("GRANT SELECT, INSERT, UPDATE ON {}.semantic_record TO occ157_admin")
                .format(sql.Identifier(SCHEMA))
            )

            insert_type = sql.SQL(
                "INSERT INTO {}.type_revision(type_name, revision, contracts) VALUES (%s,%s,%s::jsonb)"
            ).format(sql.Identifier(SCHEMA))
            for type_name, revision, contracts in [
                ("StockMovement", "stock-v1", ["sealed_semantics"]),
                ("PublishedDefinition", "definition-v1", ["sealed_semantics"]),
                ("MutableNote", "note-v1", []),
            ]:
                cur.execute(insert_type, (type_name, revision, json.dumps(contracts)))

            insert_record = sql.SQL(
                """
                INSERT INTO {}.semantic_record(
                    record_id,type_name,type_revision,semantic_core,payload
                ) VALUES (%s,%s,%s,%s::jsonb,%s::jsonb)
                """
            ).format(sql.Identifier(SCHEMA))
            for row in [
                ("stock:1", "StockMovement", "stock-v1", {"qty": 10, "sku": "X"}, {"operator": "A"}),
                ("definition:1", "PublishedDefinition", "definition-v1", {"name": "Account", "schema": 1}, {}),
                ("draft:1", "MutableNote", "note-v1", {"text": "draft"}, {}),
            ]:
                cur.execute(
                    insert_record,
                    (row[0], row[1], row[2], json.dumps(row[3]), json.dumps(row[4])),
                )

    with psycopg.connect(DSN) as conn:
        with conn.cursor() as cur:
            cur.execute("SET ROLE occ157_app")
            expect_failure(
                cur,
                sql.SQL("UPDATE {}.semantic_record SET semantic_core=%s::jsonb WHERE record_id='stock:1'")
                .format(sql.Identifier(SCHEMA)).as_string(cur),
                (json.dumps({"qty": 99, "sku": "X"}),),
            )
            cur.execute(
                sql.SQL("UPDATE {}.semantic_record SET payload=%s::jsonb WHERE record_id='stock:1'")
                .format(sql.Identifier(SCHEMA)),
                (json.dumps({}),),
            )
            cur.execute(
                sql.SQL("UPDATE {}.semantic_record SET representation_version=2 WHERE record_id='stock:1'")
                .format(sql.Identifier(SCHEMA))
            )
            cur.execute("RESET ROLE")

            # Privileged semantic admin cannot rewrite core or escape by swapping
            # to another Type/revision. There is no mutable per-row seal flag.
            cur.execute("SET ROLE occ157_admin")
            for record_id, replacement in [
                ("stock:1", {"qty": 99, "sku": "X"}),
                ("definition:1", {"name": "Account", "schema": 2}),
            ]:
                expect_failure(
                    cur,
                    sql.SQL("UPDATE {}.semantic_record SET semantic_core=%s::jsonb WHERE record_id=%s")
                    .format(sql.Identifier(SCHEMA)).as_string(cur),
                    (json.dumps(replacement), record_id),
                )
            expect_failure(
                cur,
                sql.SQL(
                    "UPDATE {}.semantic_record SET type_name='MutableNote', type_revision='note-v1' "
                    "WHERE record_id='stock:1'"
                ).format(sql.Identifier(SCHEMA)).as_string(cur),
            )
            cur.execute("RESET ROLE")

            # Migration authority can publish a new weaker revision for future
            # records, but cannot rewrite the meaning of stock-v1 itself.
            cur.execute("SET ROLE occ157_type_admin")
            cur.execute(
                sql.SQL(
                    "INSERT INTO {}.type_revision(type_name,revision,contracts) "
                    "VALUES ('StockMovement','stock-v2','[]'::jsonb)"
                ).format(sql.Identifier(SCHEMA))
            )
            expect_failure(
                cur,
                sql.SQL(
                    "UPDATE {}.type_revision SET contracts='[]'::jsonb "
                    "WHERE type_name='StockMovement' AND revision='stock-v1'"
                ).format(sql.Identifier(SCHEMA)).as_string(cur),
            )
            expect_failure(
                cur,
                sql.SQL(
                    "DELETE FROM {}.type_revision "
                    "WHERE type_name='StockMovement' AND revision='stock-v1'"
                ).format(sql.Identifier(SCHEMA)).as_string(cur),
            )
            cur.execute("RESET ROLE")

            # Even after stock-v2 exists, admin cannot rebind historical stock:1
            # to the weaker revision and then mutate it.
            cur.execute("SET ROLE occ157_admin")
            expect_failure(
                cur,
                sql.SQL(
                    "UPDATE {}.semantic_record SET type_revision='stock-v2' "
                    "WHERE record_id='stock:1'"
                ).format(sql.Identifier(SCHEMA)).as_string(cur),
            )

            # Same generic mechanism still permits a genuinely unsealed Type.
            cur.execute(
                sql.SQL("UPDATE {}.semantic_record SET semantic_core=%s::jsonb WHERE record_id='draft:1'")
                .format(sql.Identifier(SCHEMA)),
                (json.dumps({"text": "edited"}),),
            )
            cur.execute("RESET ROLE")
            conn.commit()

    with psycopg.connect(DSN, autocommit=True) as admin:
        with admin.cursor() as cur:
            cur.execute(
                sql.SQL(
                    "SELECT type_name,type_revision,semantic_core,payload,representation_version "
                    "FROM {}.semantic_record WHERE record_id='stock:1'"
                ).format(sql.Identifier(SCHEMA))
            )
            type_name, revision, core, payload, rep = cur.fetchone()
            assert (type_name, revision) == ("StockMovement", "stock-v1")
            assert core == {"qty": 10, "sku": "X"}
            assert payload == {}
            assert rep == 2
            cur.execute(
                sql.SQL("SELECT contracts FROM {}.type_revision WHERE type_name='StockMovement' AND revision='stock-v1'")
                .format(sql.Identifier(SCHEMA))
            )
            assert cur.fetchone()[0] == ["sealed_semantics"]
            cur.execute(
                sql.SQL("SELECT semantic_core FROM {}.semantic_record WHERE record_id='definition:1'")
                .format(sql.Identifier(SCHEMA))
            )
            assert cur.fetchone()[0] == {"name": "Account", "schema": 1}
            cur.execute(
                sql.SQL("SELECT semantic_core FROM {}.semantic_record WHERE record_id='draft:1'")
                .format(sql.Identifier(SCHEMA))
            )
            assert cur.fetchone()[0] == {"text": "edited"}

            cur.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(SCHEMA)))
            for role in ["occ157_app", "occ157_admin", "occ157_type_admin"]:
                cur.execute(sql.SQL("DROP ROLE {}").format(sql.Identifier(role)))

    print(
        "ok: PostgreSQL 18 generic Type-revision contract blocks semantic-core, "
        "Type-binding and historical-contract downgrade for occurrence + non-event; "
        "payload/representation and genuinely unsealed Type remain mutable"
    )


if __name__ == "__main__":
    main()
