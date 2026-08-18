from __future__ import annotations

from typing import Any

from os_kernel.definitions import EffectDefinition
from os_kernel.errors import InputError
from os_kernel.model import EFFECT_KNOWLEDGE


def reduce_attempt(prior: str, outcome: str) -> str:
    if outcome == "sent_no_response":
        return "unknown"
    if outcome == "rejected_before_send":
        return "definitely_not_sent"
    if outcome == "accepted":
        return "accepted_pending"
    if outcome == "remote_receipt":
        return "accepted_pending"
    raise InputError(
        "invalid_attempt",
        f"unsupported attempt outcome {outcome}",
        "os scenario run v001 --output json",
    )


def retry_allowed(definition: EffectDefinition, knowledge: str) -> tuple[bool, str]:
    safety = definition.protocol_safety
    safe_dedupe = bool(safety.get("safe_dedupe", False))
    absence_proof = bool(safety.get("absence_proof", False))
    if knowledge == "unknown" and not safe_dedupe and not absence_proof:
        return (False, "unsafe_retry")
    if knowledge == "confirmed":
        return (False, "already_confirmed")
    return (True, "retry_ok")


def reconcile_knowledge(prior: str, computed: Any) -> str:
    if computed not in EFFECT_KNOWLEDGE:
        raise InputError(
            "invalid_reconciliation",
            f"reconciliation produced unknown knowledge {computed!r}",
            "os scenario run v001 --output json",
        )
    return str(computed)
