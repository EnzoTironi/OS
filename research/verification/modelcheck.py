#!/usr/bin/env python3
"""Dependency-free bounded model checker for the local-commit/external-effect protocol.

The state space is intentionally small enough to exhaust. It checks the safety
boundary established by #40/#41/#43:

* one semantic local operation creates at most one EffectRequest;
* lost response yields indeterminate knowledge;
* non-idempotent indeterminate effects cannot be blindly retried;
* protocol-safe idempotent replay cannot create a second remote effect;
* local cancellation does not erase an already happened remote effect;
* reconciliation can make hidden remote success known without creating it again.

A deliberately buggy mode enables blind retry so CI can prove the checker finds
and minimizes the expected duplicate-effect counterexample.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, replace
from enum import Enum
from typing import Callable, Iterable, NamedTuple


class Knowledge(str, Enum):
    NONE = "none"
    INDETERMINATE = "indeterminate"
    PENDING = "pending"
    CONFIRMED = "confirmed"
    REJECTED = "rejected"


@dataclass(frozen=True)
class ProtocolState:
    local_committed: bool = False
    effect_request_count: int = 0
    remote_effect_count: int = 0
    knowledge: Knowledge = Knowledge.NONE
    cancelled: bool = False


class Step(NamedTuple):
    name: str
    state: ProtocolState


@dataclass(frozen=True)
class ModelConfig:
    provider_idempotent: bool
    allow_blind_indeterminate_retry: bool = False


def transitions(state: ProtocolState, config: ModelConfig) -> Iterable[tuple[str, ProtocolState]]:
    # Same LocalOperation replay: commit may be requested repeatedly but the
    # durable operation/effect request marker makes it idempotent.
    if not state.local_committed:
        yield "commit-local", replace(state, local_committed=True, effect_request_count=1)
    else:
        yield "replay-local-commit", state

    if state.local_committed and not state.cancelled and state.effect_request_count == 1:
        if state.knowledge == Knowledge.NONE:
            # Request definitely fails before crossing remote mutation boundary.
            yield "attempt-definitely-not-sent", state
            # Request crosses remote boundary but response is lost. Both remote
            # realities are possible, while caller knowledge is identical.
            yield "attempt-lost-response-no-remote-effect", replace(
                state, knowledge=Knowledge.INDETERMINATE
            )
            yield "attempt-lost-response-remote-effect-happened", replace(
                state, remote_effect_count=1, knowledge=Knowledge.INDETERMINATE
            )
            yield "attempt-accepted-pending", replace(state, knowledge=Knowledge.PENDING)
            yield "attempt-confirmed-success", replace(
                state, remote_effect_count=1, knowledge=Knowledge.CONFIRMED
            )
            yield "attempt-definitive-rejection", replace(state, knowledge=Knowledge.REJECTED)

        elif state.knowledge == Knowledge.INDETERMINATE:
            retry_enabled = config.provider_idempotent or config.allow_blind_indeterminate_retry
            if retry_enabled:
                if config.provider_idempotent:
                    # Same provider operation: if it already happened, replay does
                    # not create another remote effect.
                    new_count = max(1, state.remote_effect_count)
                else:
                    # Deliberately unsafe/buggy semantics: a retry can create a
                    # second operation if the unknown first request actually won.
                    new_count = state.remote_effect_count + 1
                yield "retry-indeterminate", replace(
                    state, remote_effect_count=new_count, knowledge=Knowledge.CONFIRMED
                )

            if state.remote_effect_count == 1:
                yield "reconcile-hidden-success", replace(state, knowledge=Knowledge.CONFIRMED)
            else:
                yield "reconcile-no-answer", state

        elif state.knowledge == Knowledge.PENDING:
            yield "observe-pending-success", replace(
                state, remote_effect_count=1, knowledge=Knowledge.CONFIRMED
            )
            yield "observe-pending-rejection", replace(state, knowledge=Knowledge.REJECTED)

        elif state.knowledge in {Knowledge.CONFIRMED, Knowledge.REJECTED}:
            # Repeated polls/observations are execution evidence, not new effects.
            yield "reobserve-terminal", state

    if not state.cancelled:
        yield "cancel-local-execution", replace(state, cancelled=True)

    # Cancellation is local scheduler state. Observation/reconciliation of a
    # remote effect can still arrive afterwards.
    if state.cancelled and state.remote_effect_count == 1 and state.knowledge != Knowledge.CONFIRMED:
        yield "observe-success-after-cancel", replace(state, knowledge=Knowledge.CONFIRMED)


def safety_violations(state: ProtocolState, config: ModelConfig) -> list[str]:
    violations: list[str] = []
    if state.effect_request_count > 1:
        violations.append("one LocalOperation created multiple EffectRequests")
    if state.remote_effect_count > 1:
        violations.append("same EffectRequest created duplicate remote effects")
    if state.remote_effect_count > 0 and not state.local_committed:
        violations.append("remote effect exists without local EffectRequest authority in local-first model")
    if state.knowledge == Knowledge.CONFIRMED and state.remote_effect_count == 0:
        violations.append("confirmed knowledge without remote effect")
    if not config.provider_idempotent and not config.allow_blind_indeterminate_retry:
        # This is a transition-enablement law rather than a state invariant; the
        # state graph below also confirms no retry-indeterminate edge exists.
        pass
    return violations


def explore(
    config: ModelConfig,
    *,
    max_depth: int = 8,
    violation: Callable[[ProtocolState, ModelConfig], list[str]] = safety_violations,
) -> tuple[int, list[Step] | None, list[str]]:
    initial = ProtocolState()
    queue: deque[tuple[ProtocolState, list[Step]]] = deque([(initial, [Step("initial", initial)])])
    seen_depth: dict[ProtocolState, int] = {initial: 0}
    explored = 0

    while queue:
        state, trace = queue.popleft()
        depth = len(trace) - 1
        explored += 1
        errors = violation(state, config)
        if errors:
            return explored, trace, errors
        if depth >= max_depth:
            continue
        for name, nxt in transitions(state, config):
            new_depth = depth + 1
            old_depth = seen_depth.get(nxt)
            if old_depth is not None and old_depth <= new_depth:
                continue
            seen_depth[nxt] = new_depth
            queue.append((nxt, trace + [Step(name, nxt)]))
    return explored, None, []


def has_transition(config: ModelConfig, state: ProtocolState, transition_name: str) -> bool:
    return any(name == transition_name for name, _ in transitions(state, config))


def format_trace(trace: list[Step] | None) -> str:
    if not trace:
        return "<no counterexample>"
    return "\n".join(f"{index}: {step.name}: {step.state}" for index, step in enumerate(trace))


def main() -> int:
    safe_nonidempotent = ModelConfig(provider_idempotent=False, allow_blind_indeterminate_retry=False)
    explored, trace, errors = explore(safe_nonidempotent)
    if errors:
        raise AssertionError(f"safe non-idempotent protocol violated safety:\n{format_trace(trace)}\n{errors}")

    unknown = ProtocolState(local_committed=True, effect_request_count=1, remote_effect_count=1, knowledge=Knowledge.INDETERMINATE)
    if has_transition(safe_nonidempotent, unknown, "retry-indeterminate"):
        raise AssertionError("non-idempotent indeterminate effect exposed blind retry transition")

    safe_idempotent = ModelConfig(provider_idempotent=True)
    explored_idem, trace_idem, errors_idem = explore(safe_idempotent)
    if errors_idem:
        raise AssertionError(f"idempotent protocol violated safety:\n{format_trace(trace_idem)}\n{errors_idem}")

    buggy = ModelConfig(provider_idempotent=False, allow_blind_indeterminate_retry=True)
    explored_buggy, trace_buggy, errors_buggy = explore(buggy)
    if not errors_buggy or not any("duplicate remote effects" in error for error in errors_buggy):
        raise AssertionError("model checker failed to find expected blind-retry duplicate-effect counterexample")

    print(
        "ok: bounded model check passed; "
        f"safe-nonidempotent states={explored}, safe-idempotent states={explored_idem}, "
        f"bug counterexample explored-after={explored_buggy}"
    )
    print("expected buggy counterexample:\n" + format_trace(trace_buggy))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
