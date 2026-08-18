from __future__ import annotations

import unittest

from adapters.stub import StubRuntime
from harness.check import ExpectationError
from harness.runner import assert_suite


class StubTests(unittest.TestCase):
    def test_stub_fails_the_suite(self) -> None:
        with self.assertRaises(ExpectationError):
            assert_suite(StubRuntime())
