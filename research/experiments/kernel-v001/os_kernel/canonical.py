from __future__ import annotations

import hashlib
import json
from typing import Any


def canonicalize(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: canonicalize(value[key]) for key in sorted(value)}
    if isinstance(value, (list, tuple)):
        return [canonicalize(item) for item in value]
    return value


def canonical_dumps(value: Any) -> str:
    return json.dumps(canonicalize(value), ensure_ascii=True, separators=(",", ":"), sort_keys=True)


def digest(value: Any) -> str:
    payload = canonical_dumps(value).encode("utf-8")
    return "sha256:" + hashlib.sha256(payload).hexdigest()


def dumps_pretty(value: Any) -> str:
    return json.dumps(canonicalize(value), ensure_ascii=True, indent=2, sort_keys=True) + "\n"
