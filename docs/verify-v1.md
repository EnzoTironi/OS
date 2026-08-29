# `zoen.verify.v1` release evidence

Official commands:

```text
just verify-v1
```

Production evidence under `artifacts/`. Missing, stale, unsigned, wrong-commit, surviving-mutant, RPO/RTO, or advertised-live-absent evidence fails closed.

Named gate-contract PASS (fixtures, not production evidence):

```text
ZOEN_VERIFY_EVIDENCE_DIR=e2e/verify-v1/testdata/complete just verify-v1
```

or:

```text
just verify-v1-fixtures
```

Fail-closed fixture check:

```text
ZOEN_VERIFY_EVIDENCE_DIR=e2e/verify-v1/testdata/fail-closed just verify-v1
```

## Role

`verify-v1` is the V1 release gate. It aggregates immutable scenario evidence into one signed machine-readable bundle. Prose status, unit-test counts, and agent self-reports are not substitutes.

The gate is aggregate-only. It does not rerun Docker Compose scenarios. Operators produce scenario evidence with `just e2e` or `just verify`, then ask `just verify-v1` for the release decision.

## Inputs

- Evidence root: `artifacts/` or `ZOEN_VERIFY_EVIDENCE_DIR`
- Candidate SHA: `git rev-parse HEAD` or `ZOEN_VERIFY_CANDIDATE_SHA`
- Optional signing material: `ZOEN_VERIFY_SIGNING_KEY_PEM` and `ZOEN_VERIFY_SIGNING_PUB_PEM`

Required scenario directories match the live Compose BUILD tickets still listed in `e2e/verify-v1.ts`.

Live Brazil fiscal vendors (Systax, PlugNotas, Protheus) are **not** advertised V1 capabilities while #214 is parked. The default advertised live list is empty until #214 unparks real vendor evidence. Un-advertising parked vendors is Spec/Wayfinder-allowed; it is not a sandbox-pass invent.

When an advertised live provider is present in the gate config, satisfaction is commit-bound. Unbound or foreign-commit `fiscal-fault-matrix.liveEvidence` strings do not clear live slots.

## Output

`artifacts/verify-v1/zoen.verify.v1.json` plus `SUMMARY.md` and `verify-v1.pub`.

Schema id: `zoen.verify.v1`.

Fixture runs under `e2e/verify-v1/testdata/` still write the signed bundle to `artifacts/verify-v1/`. The gate substitutes `__CANDIDATE_SHA__` placeholders in memory for fixture paths only. It never rewrites real `artifacts/` scenario evidence.

STRICT production evaluation rejects scenario evidence marked `fixture: true` or `fixtureContract: true` unless the evidence root is under `e2e/verify-v1/testdata/`. Copying fixture JSON into `artifacts/` and running `just verify-v1` fails with `fixture-as-production`; it cannot mint a ship attestation.

The bundle records candidate identity, per-scenario digests/commits/status, live-provider slots, semantic survivors, verification-layer mutant results, RPO/RTO targets, warnings, failures, final verdict, manifest digest, and an ed25519 signature. Secrets and private keys are never embedded.

## Failure path

The gate fails closed on:

- missing required scenario evidence
- evidence from another candidate commit
- missing source commit (including fiscal-fault-matrix)
- scenario bodies without an explicit PASS `verdict`/`status`
- fixture-marked scenario evidence outside `e2e/verify-v1/testdata/`
- surviving semantic mutants
- advertised live provider evidence absent or not commit-bound
- any verification-layer mutant that is not killed in-process

## Verification-layer mutants

In-process mutants the gate must kill:

- ignore failed scenario
- accept evidence from wrong commit
- skip live-provider requirement (injects an advertised live provider while #214 is parked)
- ignore surviving semantic mutant
- accept fixture evidence as production (would treat `fixture: true` outside testdata as a ship bundle)

## Resume

Scenario evidence is immutable and commit-bound. A crashed aggregator may resume from existing artifacts only when source/artifact digests match the candidate. It cannot reuse another candidate's results.
