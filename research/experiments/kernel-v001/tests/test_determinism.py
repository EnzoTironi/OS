from __future__ import annotations

import json
import unittest

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from os_kernel.canonical import canonical_dumps
from support import v001_run


class DeterminismTests(unittest.TestCase):
    def test_two_runs_are_byte_identical(self) -> None:
        first = canonical_dumps(v001_run())
        second = canonical_dumps(v001_run())
        self.assertEqual(first, second)
        json.loads(first)
