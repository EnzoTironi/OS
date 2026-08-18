from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping, Sequence
from typing import Any


def _ordered(value: Any) -> Any:
    if isinstance(value, Mapping):
        ordered: dict[str, Any] = {}
        for key in sorted(value.keys()):
            ordered[key] = _ordered(value[key])
        return ordered
    if type(value) is str or type(value) is bytes:
        return value
    if isinstance(value, Sequence):
        return [_ordered(item) for item in value]
    return value


def encode(value: Any) -> bytes:
    text = json.dumps(_ordered(value), ensure_ascii=True, separators=(",", ":"), sort_keys=True)
    return text.encode("utf-8")


def canonicalize(value: Any) -> Any:
    return _ordered(value)


def canonical_dumps(value: Any) -> str:
    return encode(value).decode("utf-8")


def digest(value: Any) -> str:
    hasher = hashlib.sha256()
    hasher.update(encode(value))
    return "sha256:" + hasher.hexdigest()


def dumps_pretty(value: Any) -> str:
    body = json.dumps(_ordered(value), ensure_ascii=True, indent=2, sort_keys=True)
    return f"{body}\n"
