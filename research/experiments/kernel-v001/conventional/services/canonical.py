from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping, Sequence
from typing import Any


def canonicalize(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {key: canonicalize(value[key]) for key in sorted(value)}
    if isinstance(value, (str, bytes)):
        return value
    if isinstance(value, Sequence):
        return [canonicalize(item) for item in value]
    return value


def canonical_dumps(value: Any) -> str:
    return json.dumps(canonicalize(value), ensure_ascii=True, separators=(",", ":"), sort_keys=True)


def digest(value: Any) -> str:
    return "sha256:" + hashlib.sha256(canonical_dumps(value).encode("utf-8")).hexdigest()


def dumps_pretty(value: Any) -> str:
    return json.dumps(canonicalize(value), ensure_ascii=True, indent=2, sort_keys=True) + "\n"
