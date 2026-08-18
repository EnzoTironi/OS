from __future__ import annotations

import copy
import hashlib
import json
from collections.abc import Mapping, Sequence
from types import MappingProxyType
from typing import Any


def canonicalize(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {key: canonicalize(value[key]) for key in sorted(value)}
    if isinstance(value, (str, bytes)):
        return value
    if isinstance(value, Sequence):
        return [canonicalize(item) for item in value]
    return value


def freeze(value: Any) -> Any:
    if isinstance(value, Mapping):
        return MappingProxyType({key: freeze(value[key]) for key in value})
    if isinstance(value, (str, bytes)):
        return value
    if isinstance(value, Sequence):
        return tuple(freeze(item) for item in value)
    return value


def retained(value: Any) -> Any:
    return freeze(copy.deepcopy(value))


def public_output(value: Any) -> Any:
    return freeze(copy.deepcopy(value))


def canonical_dumps(value: Any) -> str:
    return json.dumps(canonicalize(value), ensure_ascii=True, separators=(",", ":"), sort_keys=True)


def digest(value: Any) -> str:
    payload = canonical_dumps(value).encode("utf-8")
    return "sha256:" + hashlib.sha256(payload).hexdigest()


def dumps_pretty(value: Any) -> str:
    return json.dumps(canonicalize(value), ensure_ascii=True, indent=2, sort_keys=True) + "\n"
