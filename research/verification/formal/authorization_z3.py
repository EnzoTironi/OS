#!/usr/bin/env python3
"""Bounded SMT checks for #42/#46 authorization invariants.

The goal is not to "prove authorization forever". These small models establish
that the candidate local delegation laws imply transitive non-escalation inside
the chosen scope and that the CI would produce a concrete counterexample if a
constraint is removed.
"""

from __future__ import annotations

import json

from z3 import BitVec, BitVecVal, Int, Solver, sat, unsat

BITS = 8
MASK = (1 << BITS) - 1


def subset(child, parent):
    """All child permission bits are contained in parent permission bits."""
    return (child & ~parent) == BitVecVal(0, BITS)


def check_transitive_scope_non_escalation() -> None:
    root = BitVec("root_scope", BITS)
    child = BitVec("child_scope", BITS)
    grandchild = BitVec("grandchild_scope", BITS)

    solver = Solver()
    solver.add(subset(child, root))
    solver.add(subset(grandchild, child))
    solver.add((grandchild & ~root) != BitVecVal(0, BITS))  # seek escalation beyond root
    if solver.check() != unsat:
        raise AssertionError(f"delegation chain can escalate beyond root: {solver.model()}")


def check_tenant_confinement_transitively() -> None:
    root_tenant = Int("root_tenant")
    child_tenant = Int("child_tenant")
    grandchild_tenant = Int("grandchild_tenant")

    solver = Solver()
    solver.add(child_tenant == root_tenant)
    solver.add(grandchild_tenant == child_tenant)
    solver.add(grandchild_tenant != root_tenant)  # seek cross-tenant descendant
    if solver.check() != unsat:
        raise AssertionError(f"delegation chain crosses tenant: {solver.model()}")


def check_numeric_bound_non_escalation() -> None:
    root_limit = Int("root_limit")
    child_limit = Int("child_limit")
    grandchild_limit = Int("grandchild_limit")

    solver = Solver()
    solver.add(root_limit >= 0, child_limit >= 0, grandchild_limit >= 0)
    solver.add(child_limit <= root_limit)
    solver.add(grandchild_limit <= child_limit)
    solver.add(grandchild_limit > root_limit)  # seek transitive escalation
    if solver.check() != unsat:
        raise AssertionError(f"delegation amount bound escalates: {solver.model()}")


def check_separation_of_duties() -> None:
    initiator = Int("initiator")
    approver = Int("approver")

    solver = Solver()
    solver.add(initiator != approver)  # policy: two independent principal IDs
    solver.add(initiator == approver)  # seek violation under that policy
    if solver.check() != unsat:
        raise AssertionError(f"SoD policy admits same principal: {solver.model()}")


def expected_buggy_scope_counterexample() -> dict[str, int]:
    """Remove child<=parent and require escalation: solver must find a witness."""
    parent = BitVec("bug_parent", BITS)
    child = BitVec("bug_child", BITS)
    solver = Solver()
    solver.add(parent == BitVecVal(0b00000001, BITS))
    solver.add((child & ~parent) != BitVecVal(0, BITS))
    if solver.check() != sat:
        raise AssertionError("SMT sensitivity check failed: expected an escalation witness")
    model = solver.model()
    parent_value = model.eval(parent).as_long() & MASK
    child_value = model.eval(child, model_completion=True).as_long() & MASK
    if (child_value & (~parent_value & MASK)) == 0:
        raise AssertionError("solver witness does not actually broaden parent scope")
    return {"parent_scope": parent_value, "child_scope": child_value}


def expected_buggy_sod_counterexample() -> dict[str, int]:
    initiator = Int("bug_initiator")
    approver = Int("bug_approver")
    solver = Solver()
    solver.add(initiator == 7, approver == initiator)
    if solver.check() != sat:
        raise AssertionError("SMT sensitivity check failed: expected same-principal SoD witness")
    model = solver.model()
    return {
        "initiator": model.eval(initiator).as_long(),
        "approver": model.eval(approver).as_long(),
    }


def main() -> int:
    check_transitive_scope_non_escalation()
    check_tenant_confinement_transitively()
    check_numeric_bound_non_escalation()
    check_separation_of_duties()
    witnesses = {
        "expected_scope_escalation_without_subset_constraint": expected_buggy_scope_counterexample(),
        "expected_sod_violation_without_independence_constraint": expected_buggy_sod_counterexample(),
    }
    print("ok: bounded SMT authorization invariants are UNSAT under candidate constraints")
    print(json.dumps(witnesses, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
