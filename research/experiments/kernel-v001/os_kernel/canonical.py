from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping, Sequence
from dataclasses import fields, is_dataclass
from types import MappingProxyType
from typing import Any


def _is_json_scalar(value: Any) -> bool:
    return value is None or isinstance(value, (bool, int, float, str, bytes))


def copy_structure(value: Any) -> Any:
    if _is_json_scalar(value):
        return value
    if is_dataclass(value) and not isinstance(value, type):
        params = getattr(value, "__dataclass_params__", None)
        if params is None or not params.frozen:
            raise TypeError(f"unsupported copy type {type(value).__name__}")
        copied = {item.name: copy_structure(getattr(value, item.name)) for item in fields(value)}
        return type(value)(**copied)
    if isinstance(value, MappingProxyType):
        return MappingProxyType({key: copy_structure(value[key]) for key in value})
    if isinstance(value, Mapping):
        return {key: copy_structure(value[key]) for key in value}
    if isinstance(value, tuple):
        return tuple(copy_structure(item) for item in value)
    if isinstance(value, list):
        return [copy_structure(item) for item in value]
    raise TypeError(f"unsupported copy type {type(value).__name__}")


def canonicalize(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {key: canonicalize(value[key]) for key in sorted(value)}
    if isinstance(value, (str, bytes)):
        return value
    if isinstance(value, Sequence):
        return [canonicalize(item) for item in value]
    return value


def retained(value: Any) -> Any:
    if _is_json_scalar(value):
        return value
    if isinstance(value, Mapping):
        return MappingProxyType({key: retained(value[key]) for key in value})
    if isinstance(value, Sequence):
        return tuple(retained(item) for item in value)
    raise TypeError(f"unsupported retained type {type(value).__name__}")


def public_output(value: Any) -> Any:
    if _is_json_scalar(value):
        return value
    if isinstance(value, Mapping):
        return {key: public_output(value[key]) for key in value}
    if isinstance(value, Sequence):
        return [public_output(item) for item in value]
    raise TypeError(f"unsupported public output type {type(value).__name__}")


def canonical_dumps(value: Any) -> str:
    return json.dumps(canonicalize(value), ensure_ascii=True, separators=(",", ":"), sort_keys=True)


def digest(value: Any) -> str:
    payload = canonical_dumps(value).encode("utf-8")
    return "sha256:" + hashlib.sha256(payload).hexdigest()


def dumps_pretty(value: Any) -> str:
    return json.dumps(canonicalize(value), ensure_ascii=True, indent=2, sort_keys=True) + "\n"
