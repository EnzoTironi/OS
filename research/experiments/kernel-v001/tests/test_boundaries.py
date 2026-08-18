from __future__ import annotations

import sys
import unittest
from pathlib import Path

from jsonschema.exceptions import ValidationError

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from support import ROOT, load_json, load_schema, open_kernel, validator
from os_kernel.errors import InputError
from os_kernel.model import Approval, Attribution


class BoundaryTests(unittest.TestCase):
    def test_schema_format_rejects_bad_datetime(self) -> None:
        schema = load_schema("scenario-input.schema.json")
        check = validator(schema)
        payload = load_json(ROOT / "fixtures" / "v001" / "scenario.json")
        payload["clock"]["start"] = "not-a-date"
        with self.assertRaises(ValidationError):
            check.validate(payload)
        payload["clock"]["start"] = "2030-08-10T10:00:00Z"
        check.validate(payload)

    def test_create_entity_rejects_properties(self) -> None:
        kernel = open_kernel()
        with self.assertRaises(InputError):
            kernel.apply(
                {
                    "type": "CreateEntity",
                    "entity_id": "x",
                    "type_ref": {"definition_id": "type.organization"},
                    "properties": {"name": "nope"},
                    "provenance": {
                        "source_id": "s",
                        "source_locator": "l",
                        "capture_id": "c",
                        "capture_revision": "r",
                        "actor_id": "a",
                        "workload_id": "w",
                    },
                }
            )

    def test_approval_requires_basis(self) -> None:
        with self.assertRaises(ValueError):
            Approval(
                "a",
                "p",
                "digest",
                {},
                "",
                None,  # type: ignore[arg-type]
                Attribution("a1", "a2", "a3", "a4"),
                (),
                "kr:0001",
            )

    def test_attribution_rejects_collapse(self) -> None:
        with self.assertRaises(ValueError):
            Attribution("same", "same", "w", "d")
        kernel = open_kernel()
        with self.assertRaises(InputError):
            kernel.apply(
                {
                    "type": "ProposeOperation",
                    "proposal_id": "p",
                    "operation_id": "o",
                    "action_id": "action.purchase-raw",
                    "inputs": {"quantity": 1, "subject": "stock:sku-x", "predicate": "available-quantity"},
                    "attribution": {"principal_id": "only"},
                }
            )

    def test_unknown_command_is_input_error(self) -> None:
        kernel = open_kernel()
        with self.assertRaises(InputError):
            kernel.apply({"type": "set_state", "key": "x"})

    def test_definition_rejects_callable(self) -> None:
        from os_kernel.definitions import load_bundle

        with self.assertRaises(InputError):
            load_bundle({"revision_id": "r", "computations": [{"definition_id": "c", "expression": {"op": "literal", "callable": "nope"}}]})
