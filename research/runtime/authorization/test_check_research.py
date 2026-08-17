from __future__ import annotations

import unittest

from check_research import without_rejected_catalog


class AuthorizationCheckTests(unittest.TestCase):
    def test_rejected_catalog_is_not_scanned_for_forbidden_phrases(self) -> None:
        text = (
            "# Laws\n"
            "workload identity stays distinct\n"
            "# Explicit non-laws\n"
            "Rejected as universal claims:\n"
            "- `agent gets all permissions of delegating user`;\n"
        )
        kept = without_rejected_catalog(text)
        self.assertIn("workload identity", kept)
        self.assertNotIn("agent gets all permissions", kept)

    def test_forbidden_wording_above_the_catalog_remains_visible(self) -> None:
        text = (
            "An agent gets all permissions of the user.\n"
            "# Explicit non-laws\n"
            "- ignored\n"
        )
        kept = without_rejected_catalog(text)
        self.assertIn("agent gets all permissions", kept)


if __name__ == "__main__":
    unittest.main()
