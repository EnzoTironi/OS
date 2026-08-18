from __future__ import annotations

from typing import Any, Mapping


class ExpectationError(AssertionError):
    pass


def subset(actual: Mapping[str, Any], expected: Mapping[str, Any], path: str = "$") -> None:
    for key, want in expected.items():
        here = f"{path}.{key}"
        if key not in actual:
            raise ExpectationError(f"{here} missing; got {sorted(actual)}")
        got = actual[key]
        if isinstance(want, dict) and isinstance(got, dict):
            subset(got, want, here)
            continue
        if isinstance(want, list) and isinstance(got, list):
            if sorted(_freeze(item) for item in got) != sorted(_freeze(item) for item in want):
                raise ExpectationError(f"{here} expected {want!r}, got {got!r}")
            continue
        if got != want:
            raise ExpectationError(f"{here} expected {want!r}, got {got!r}")


def _freeze(value: Any) -> Any:
    if isinstance(value, dict):
        return tuple(sorted((key, _freeze(item)) for key, item in value.items()))
    if isinstance(value, list):
        return tuple(_freeze(item) for item in value)
    return value
