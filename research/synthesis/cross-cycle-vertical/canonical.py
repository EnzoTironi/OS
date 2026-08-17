#!/usr/bin/env python3
"""Canonical semantic forms under test in issue #71.

This module is intentionally tiny. The anti-cheat gate treats every class here
as part of the candidate canonical semantic IR. Runtime safety machinery lives
elsewhere and must not leak new semantic species back into this module.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Mapping


class SemanticDefinitionError(ValueError):
    pass


@dataclass(frozen=True)
class Type:
    stable_id: str
    name: str
    revision: str
    identity: str  # entity | value
    refinements: tuple[str, ...] = ()
    contracts: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if self.identity not in {"entity", "value"}:
            raise SemanticDefinitionError(f"invalid identity semantics: {self.identity}")
        if not self.stable_id or not self.revision:
            raise SemanticDefinitionError("Type requires stable id + revision")


@dataclass(frozen=True)
class RelationRole:
    name: str
    target_type: str
    minimum: int = 1
    maximum: int | None = 1
    collection: str = "set"  # set | list | bag; ignored when maximum == 1

    def __post_init__(self) -> None:
        if self.minimum < 0:
            raise SemanticDefinitionError("relation role minimum must be >= 0")
        if self.maximum is not None and self.maximum < self.minimum:
            raise SemanticDefinitionError("relation role maximum must be >= minimum")
        if self.collection not in {"set", "list", "bag"}:
            raise SemanticDefinitionError(f"invalid collection semantics: {self.collection}")


@dataclass(frozen=True)
class Relation:
    stable_id: str
    name: str
    revision: str
    roles: tuple[RelationRole, ...]
    derived: bool = False
    assertion_identity: str = "optional"  # optional | required | none

    def __post_init__(self) -> None:
        if len(self.roles) < 2:
            raise SemanticDefinitionError("Relation requires at least two roles")
        names = [r.name for r in self.roles]
        if len(names) != len(set(names)):
            raise SemanticDefinitionError("Relation role names must be unique")
        if self.assertion_identity not in {"optional", "required", "none"}:
            raise SemanticDefinitionError("invalid assertion identity contract")


@dataclass(frozen=True)
class Computation:
    stable_id: str
    name: str
    revision: str
    input_types: Mapping[str, str]
    output_type: str
    evaluate: Callable[..., Any] = field(compare=False, repr=False)


@dataclass(frozen=True)
class Action:
    stable_id: str
    name: str
    revision: str
    input_types: Mapping[str, str]
    result_type: str
    proof_types: tuple[str, ...]
    plan: Callable[..., Any] = field(compare=False, repr=False)


CANONICAL_FORMS = (Type, Relation, Computation, Action)
