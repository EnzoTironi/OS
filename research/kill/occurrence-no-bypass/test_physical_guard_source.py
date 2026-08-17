#!/usr/bin/env python3
from __future__ import annotations

import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
PG = HERE / "experiments" / "postgres18" / "test_no_bypass.py"


class PhysicalGuardSourceTests(unittest.TestCase):
    def test_postgres_guard_covers_record_identity_type_binding_and_core(self) -> None:
        text = PG.read_text(encoding="utf-8").lower()
        self.assertIn(
            "before update of record_id, type_name, type_revision, semantic_core",
            text,
        )
        self.assertIn("accepted semantic record identity cannot be rewritten in place", text)
        self.assertIn("accepted record type revision binding cannot be rewritten in place", text)
        self.assertIn("sealed semantic core cannot be replaced in place", text)

    def test_contract_is_not_a_mutable_business_row_flag(self) -> None:
        text = PG.read_text(encoding="utf-8").lower()
        self.assertNotIn("sealed_semantics boolean", text)
        self.assertIn("create table {}.type_revision", text)
        self.assertIn("protect_type_revision_history", text)
        self.assertIn("before update or delete", text)

    def test_downgrade_attacks_are_present(self) -> None:
        text = PG.read_text(encoding="utf-8").lower()
        self.assertIn("stock-v2", text)
        self.assertIn("set record_id='stock:moved'", text)
        self.assertIn("set type_revision='stock-v2'", text)
        self.assertIn("set type_name='mutablenote'", text)
        self.assertIn("set contracts='[]'::jsonb", text)


if __name__ == "__main__":
    unittest.main()
