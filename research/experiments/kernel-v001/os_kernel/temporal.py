from __future__ import annotations

from typing import Any

from os_kernel.canonical import digest
from os_kernel.definitions import DefinitionBundle, computation_for_predicate, pinned_expression
from os_kernel.expression import EvalContext, evaluate
from os_kernel.store import Store


def evaluate_quantity(
    bundle: DefinitionBundle,
    store: Store,
    subject: str,
    predicate: str,
    valid_at: str,
    known_at: str | None,
) -> dict[str, Any]:
    computation = computation_for_predicate(bundle, predicate)
    ctx = EvalContext(
        inputs={"subject": subject, "predicate": predicate, "valid_at": valid_at, "known_at": known_at},
        store=store,
        valid_at=valid_at,
        known_at=known_at,
        knowledge_cut=known_at,
    )
    value = evaluate(pinned_expression(computation), ctx)
    contributors = []
    rivals = []
    for claim in store.claims():
        if claim.subject_ref != subject or claim.predicate_ref != predicate:
            continue
        row = {
            "claim_id": claim.claim_id,
            "value": claim.value,
            "known_revision": claim.known_revision,
            "valid_time": {
                "instant": claim.valid_time.instant,
                "start": claim.valid_time.start,
                "end": claim.valid_time.end,
            },
            "provenance": {
                "source_id": claim.provenance.source_id,
                "source_locator": claim.provenance.source_locator,
                "capture_id": claim.provenance.capture_id,
                "capture_revision": claim.provenance.capture_revision,
            },
        }
        covers = claim.valid_time.covers(valid_at)
        known = known_at is None or claim.known_revision <= known_at
        if covers and known:
            contributors.append(row)
        else:
            rivals.append(row)
    contributors.sort(key=lambda item: item["claim_id"])
    rivals.sort(key=lambda item: item["claim_id"])
    return {
        "subject": subject,
        "predicate": predicate,
        "valid_at": valid_at,
        "known_at": known_at,
        "value": value,
        "contributors": contributors,
        "rivals": rivals,
        "computation_revision": computation.definition_ref.revision_id,
        "computation_digest": computation.definition_ref.definition_digest,
        "contributor_digest": digest([item["claim_id"] for item in contributors]),
    }
