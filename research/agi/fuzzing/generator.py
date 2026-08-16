#!/usr/bin/env python3
"""Reusable Wave-A semantic scenario generator for issue #51.

This is **research tooling**, not OS runtime or target ontology syntax.
It turns a deterministic choice stream plus one or more dimension recipes into
JSON-compatible scenario records shaped like `dsl.md`.  The same choice stream
can be minimized and replayed, which lets a later acceptance harness shrink a
semantic failure without hand-editing its timeline.

Only Python stdlib is used so agents can run it in a fresh checkout.
"""

from __future__ import annotations

import argparse
import copy
import json
import random
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Iterable, Mapping, Sequence


UTC = timezone.utc
BASE_TIME = datetime(2026, 8, 16, 12, 0, tzinfo=UTC)


class ChoiceStream:
    """Deterministic choices whose consumed integers are replayable/shrinkable."""

    def __init__(self, choices: Sequence[int] | None = None, seed: int = 0):
        self._input = list(choices or [])
        self._rng = random.Random(seed)
        self.used: list[int] = []
        self.pos = 0

    def int(self, low: int, high: int) -> int:
        if high < low:
            raise ValueError("invalid choice range")
        span = high - low + 1
        if self.pos < len(self._input):
            raw = int(self._input[self.pos])
        else:
            raw = self._rng.randrange(span)
        self.pos += 1
        self.used.append(raw)
        return low + (raw % span)

    def bool(self) -> bool:
        return bool(self.int(0, 1))

    def one(self, values: Sequence[Any]) -> Any:
        if not values:
            raise ValueError("empty choice set")
        return values[self.int(0, len(values) - 1)]


@dataclass
class Build:
    dimensions: list[str] = field(default_factory=list)
    world: dict[str, Any] = field(default_factory=lambda: {
        "parties": ["org:A", "org:B"],
        "resources": ["sku:X"],
        "locations": ["loc:main"],
        "policies": [],
    })
    timeline: list[dict[str, Any]] = field(default_factory=list)
    oracles: list[dict[str, Any]] = field(default_factory=list)
    validity: list[str] = field(default_factory=list)

    def step(
        self,
        kind: str,
        *,
        valid: datetime,
        known: datetime,
        actor: str,
        body: Mapping[str, Any],
        source: str | None = None,
        idempotency: str | None = None,
    ) -> str:
        step_id = f"t{len(self.timeline) + 1}"
        row: dict[str, Any] = {
            "id": step_id,
            "kind": kind,
            "valid_time": valid.isoformat(),
            "known_time": known.isoformat(),
            "actor": actor,
            "body": dict(body),
        }
        if source is not None:
            row["source"] = source
        if idempotency is not None:
            row["idempotency"] = idempotency
        self.timeline.append(row)
        return step_id

    def oracle(self, kind: str, law: str, check: str) -> None:
        self.oracles.append({"kind": kind, "law": law, "check": check})


Recipe = Callable[[ChoiceStream, Build], None]
RECIPES: dict[str, Recipe] = {}


def recipe(name: str) -> Callable[[Recipe], Recipe]:
    def register(fn: Recipe) -> Recipe:
        RECIPES[name] = fn
        return fn
    return register


@recipe("D-01")
def partial_quantities(c: ChoiceStream, b: Build) -> None:
    b.dimensions.append("D-01")
    ordered = c.int(1, 20)
    shipped = c.int(0, ordered + 3)
    invoiced = c.int(0, ordered)
    paid = c.int(0, invoiced)
    returned = c.int(0, min(shipped, ordered))
    b.world["order"] = {
        "ordered": ordered,
        "shipped": shipped,
        "invoiced": invoiced,
        "paid": paid,
        "returned": returned,
    }
    b.step("Observe", valid=BASE_TIME, known=BASE_TIME, actor="service:orders",
           source="source:order", body={"ordered_qty": ordered})
    if shipped:
        b.step("Occur", valid=BASE_TIME + timedelta(hours=1), known=BASE_TIME + timedelta(hours=1),
               actor="service:warehouse", body={"shipment_qty": shipped})
    if invoiced:
        b.step("Occur", valid=BASE_TIME + timedelta(hours=2), known=BASE_TIME + timedelta(hours=2),
               actor="service:billing", body={"invoice_qty": invoiced})
    b.oracle("competency", "D-01", "leftover demand, bill and settlement remain independently answerable")
    b.validity.append("ordered_qty >= 1; paid <= invoiced; returned <= min(shipped, ordered)")


@recipe("D-02")
def backdating(c: ChoiceStream, b: Build) -> None:
    b.dimensions.append("D-02")
    lag_days = c.int(1, 15)
    valid = BASE_TIME - timedelta(days=lag_days)
    known = BASE_TIME
    qty = c.int(1, 50)
    b.step("Occur", valid=valid, known=known, actor="service:inventory",
           source="source:late-receipt", body={"receipt_qty": qty, "late_record": True})
    b.oracle("metamorphic", "D-02", "late evidence may change now-believed-for-then without rewriting what was known then")
    b.validity.append("late record has known_time > valid_time")


@recipe("D-04")
def duplicate_or_reordered(c: ChoiceStream, b: Build) -> None:
    b.dimensions.append("D-04")
    occurrence = f"occ:{c.int(1, 9)}"
    qty = c.int(1, 10)
    duplicate_same_message = c.bool()
    msg1 = f"msg:{c.int(1, 99)}"
    msg2 = msg1 if duplicate_same_message else f"msg:{c.int(100, 199)}"
    for index, msg in enumerate((msg1, msg2)):
        b.step("Observe", valid=BASE_TIME, known=BASE_TIME + timedelta(seconds=index),
               actor="connector:external", source=msg,
               body={"occurrence_id": occurrence, "quantity": qty})
    b.oracle("invariant", "D-04", "two messages describing one occurrence must not double-apply the occurrence")
    b.validity.append("both observations intentionally reference the same occurrence identity")


@recipe("D-10")
def concurrent_decisions(c: ChoiceStream, b: Build) -> None:
    b.dimensions.append("D-10")
    available = c.int(1, 8)
    q1 = c.int(1, available)
    q2 = c.int(1, available)
    b.world["inventory"] = {"available": available}
    for actor, qty in (("actor:a", q1), ("actor:b", q2)):
        b.step("Attempt", valid=BASE_TIME, known=BASE_TIME, actor=actor,
               body={"action": "reserve", "qty": qty, "read_available": available})
    b.oracle("invariant", "D-10", "committed exclusive claims cannot exceed the same available quantity")
    b.validity.append("both attempts read the same initial availability")


@recipe("D-11")
def stale_approval(c: ChoiceStream, b: Build) -> None:
    b.dimensions.append("D-11")
    initial = c.int(5, 30)
    proposed = c.int(1, initial)
    intervening = c.int(1, initial)
    freeze_basis = c.bool()
    b.world["approval"] = {
        "initial_inventory": initial,
        "proposed_qty": proposed,
        "basis": "frozen-snapshot" if freeze_basis else "live-at-commit",
    }
    b.step("Attempt", valid=BASE_TIME, known=BASE_TIME, actor="agent:purchasing",
           body={"action": "propose", "qty": proposed, "assumed_inventory": initial})
    b.step("Occur", valid=BASE_TIME + timedelta(minutes=5), known=BASE_TIME + timedelta(minutes=5),
           actor="service:warehouse", body={"inventory_delta": intervening})
    b.step("Attempt", valid=BASE_TIME + timedelta(minutes=10), known=BASE_TIME + timedelta(minutes=10),
           actor="actor:approver", body={"action": "commit-approved-proposal", "basis": b.world["approval"]["basis"]})
    b.oracle("competency", "D-11", "commit validates the exact proposal against its declared state/temporal basis")
    b.validity.append("approval basis is explicit; live-at-commit and frozen-snapshot are distinct cases")


@recipe("D-12")
def external_unknown(c: ChoiceStream, b: Build) -> None:
    b.dimensions.append("D-12")
    key = f"idem:{c.int(1, 9999)}"
    later = c.one(["success", "failure", "unobserved"])
    b.step("Attempt", valid=BASE_TIME, known=BASE_TIME, actor="service:payments",
           body={"action": "send-external"}, idempotency=key)
    b.step("ExternalUnknown", valid=BASE_TIME, known=BASE_TIME + timedelta(seconds=30),
           actor="connector:external", body={"reason": "timeout"}, idempotency=key)
    if later != "unobserved":
        b.step("Observe", valid=BASE_TIME + timedelta(seconds=10), known=BASE_TIME + timedelta(minutes=5),
               actor="connector:reconcile", source="source:provider",
               body={"idempotency": key, "outcome": later})
    b.oracle("unknown-safe", "D-12", "transport timeout is not silently rewritten as business failure")
    b.validity.append("external request left the system before timeout")


@recipe("D-13")
def contradictory_observations(c: ChoiceStream, b: Build) -> None:
    b.dimensions.append("D-13")
    first = c.int(10, 40)
    delta = c.int(1, 10)
    second = first + (delta if c.bool() else -delta)
    for source, value, minute in (("source:erp", first, 0), ("source:sheet", second, 1)):
        b.step("Observe", valid=BASE_TIME, known=BASE_TIME + timedelta(minutes=minute),
               actor="connector:ingest", source=source,
               body={"subject": "sku:X", "predicate": "observed_quantity", "value": value})
    b.oracle("competency", "D-13", "the model can answer what each source asserted without last-write-wins erasure")
    b.validity.append("sources remain separately attributable")


@recipe("D-14")
def ontology_revision(c: ChoiceStream, b: Build) -> None:
    b.dimensions.append("D-14")
    old = f"rev:{c.int(1, 5)}"
    new = f"rev:{c.int(6, 10)}"
    b.step("Attempt", valid=BASE_TIME, known=BASE_TIME, actor="actor:user",
           body={"action": "approve", "ontology_revision": old})
    b.step("ReviseOntology", valid=BASE_TIME + timedelta(days=1), known=BASE_TIME + timedelta(days=1),
           actor="actor:maintainer", body={"from": old, "to": new})
    b.oracle("competency", "D-14", "historical explanation retains the definition identity used by the earlier decision")
    b.validity.append("old and new ontology revisions are distinct")


def generate(
    fragment: str,
    recipes: Sequence[str],
    choices: Sequence[int] | None = None,
    *,
    seed: int = 0,
    scenario_id: str = "S-FUZ-GEN",
) -> dict[str, Any]:
    """Generate a JSON-compatible scenario from reusable recipes.

    `recipes` must name dimensions registered above.  When `choices` is given,
    the same input deterministically reproduces the scenario.  Without choices,
    `seed` supplies deterministic pseudo-random values and the consumed integers
    are returned under `shrink.choices`.
    """
    if not recipes:
        raise ValueError("at least one recipe is required")
    unknown = [name for name in recipes if name not in RECIPES]
    if unknown:
        raise KeyError(f"unknown recipes: {unknown}")

    stream = ChoiceStream(choices, seed)
    build = Build()
    for name in recipes:
        RECIPES[name](stream, build)

    return {
        "scenario": {
            "id": scenario_id,
            "fragment": fragment,
            "seed": seed,
            "dimensions": build.dimensions,
            "ontology_pin": "undetermined",
            "world": build.world,
            "timeline": build.timeline,
            "oracles": build.oracles,
            "coverage": {"recipes": sorted(set(build.dimensions)), "count": len(build.dimensions)},
            "shrink": {"choices": stream.used, "validity": build.validity},
            "failure": {"state": "not-run", "typed_as": None, "question": None},
        }
    }


def pairwise(recipe_names: Iterable[str] | None = None) -> list[tuple[str, str]]:
    names = list(recipe_names or RECIPES)
    return [(names[i], names[j]) for i in range(len(names)) for j in range(i + 1, len(names))]


def shrink_choices(
    fragment: str,
    recipes: Sequence[str],
    choices: Sequence[int],
    fails: Callable[[dict[str, Any]], bool],
) -> list[int]:
    """Greedy deterministic reducer for a caller-supplied semantic failure.

    The caller owns the oracle.  A candidate choice sequence is kept only when
    regeneration remains valid *and* `fails(candidate)` is still true.  The
    reducer never edits the generated timeline by hand.
    """
    best = [int(x) for x in choices]
    if not fails(generate(fragment, recipes, best)):
        raise ValueError("initial choices do not reproduce the requested failure")

    changed = True
    while changed:
        changed = False
        for i, current in enumerate(list(best)):
            # Prefer zero, then monotonically smaller values. ChoiceStream maps
            # values into each recipe's valid range, so regeneration maintains
            # recipe validity.
            candidates = [0]
            candidates.extend(range(max(0, current - 1), -1, -1))
            seen: set[int] = set()
            for value in candidates:
                if value in seen or value == current:
                    continue
                seen.add(value)
                trial = copy.copy(best)
                trial[i] = value
                try:
                    scenario = generate(fragment, recipes, trial)
                except (ValueError, KeyError):
                    continue
                if fails(scenario):
                    best = trial
                    changed = True
                    break
            if changed:
                break
    return best


def _cli() -> None:
    parser = argparse.ArgumentParser(description="Generate replayable Wave-A semantic fuzz scenarios")
    parser.add_argument("--fragment", default="research-fragment")
    parser.add_argument("--recipe", action="append", dest="recipes", help="dimension id such as D-01; repeatable")
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--choices", help="comma-separated integer choice stream")
    parser.add_argument("--pairwise", action="store_true", help="emit one scenario for each pair of registered recipes")
    args = parser.parse_args()

    choices = None if not args.choices else [int(x) for x in args.choices.split(",") if x.strip()]
    if args.pairwise:
        out = [generate(args.fragment, pair, choices, seed=args.seed, scenario_id=f"S-FUZ-{a}-{b}")
               for a, b in pairwise(args.recipes)]
    else:
        recipes = args.recipes or ["D-01", "D-12"]
        out = generate(args.fragment, recipes, choices, seed=args.seed)
    print(json.dumps(out, indent=2, sort_keys=True))


if __name__ == "__main__":
    _cli()
