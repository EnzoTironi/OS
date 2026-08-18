from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from support import ROOT


class NoDomainHardcodeTests(unittest.TestCase):
    def test_checker_passes(self) -> None:
        script = ROOT / "scripts" / "check_no_domain_branches.py"
        proc = subprocess.run([sys.executable, str(script)], check=False, capture_output=True, text=True)
        self.assertEqual(proc.returncode, 0, proc.stderr)

    def test_kernel_has_no_public_bypass(self) -> None:
        from os_kernel.kernel import Kernel

        self.assertFalse(hasattr(Kernel, "append"))
        self.assertFalse(hasattr(Kernel, "set_state"))
        self.assertFalse(hasattr(Kernel, "update"))
        self.assertFalse(hasattr(Kernel, "delete"))
