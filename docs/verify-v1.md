# `zoen.verify.v1` release evidence

Official command:

```text
just verify-v1
```

## Role

`verify-v1` is the V1 release gate. It aggregates immutable scenario evidence into one signed machine-readable bundle. Prose status, unit-test counts, and agent self-reports are not substitutes.

The gate is aggregate-only. It does not rerun KIND, Docker Compose scenarios, or the 100M reference scale suite. Operators produce scenario evidence with `just e2e`, `just release-drill`, `just scale`, or `just verify`, then ask `just verify-v1` for the release decision.

## Inputs

- Evidence root: `artifacts/` or `ZOEN_VERIFY_EVIDENCE_DIR`
- Candidate SHA: `git rev-parse HEAD` or `ZOEN_VERIFY_CANDIDATE_SHA`
- Optional signing material: `ZOEN_VERIFY_SIGNING_KEY_PEM` and `ZOEN_VERIFY_SIGNING_PUB_PEM`

Required scenario directories match BUILD tickets #191–#205 and #211–#218. Live Brazil fiscal vendors are advertised slots. When dedicated live artifacts are absent, the gate reads `fiscal-fault-matrix.liveEvidence` and still fails closed if a vendor is not confirmed.

## Output

`artifacts/verify-v1/zoen.verify.v1.json` plus `SUMMARY.md` and `verify-v1.pub`.

Schema id: `zoen.verify.v1`.

The bundle records candidate identity, per-scenario digests/commits/status, live-provider slots, semantic survivors, verification-layer mutant results, RPO/RTO targets, warnings, failures, final verdict, manifest digest, and an ed25519 signature. Secrets and private keys are never embedded.

## Failure path

The gate fails closed on:

- missing required scenario evidence
- evidence from another candidate commit
- unsigned OCI metadata where signatures are required
- surviving semantic mutants
- RPO/RTO above target
- advertised live provider evidence absent
- any verification-layer mutant that is not killed in-process

## Verification-layer mutants

In-process mutants the gate must kill:

- ignore failed scenario
- accept evidence from wrong commit
- skip live-provider requirement
- ignore surviving semantic mutant
- ignore RPO threshold
- accept unsigned artifact
- reuse stale scale results

## Resume

Scenario evidence is immutable and commit-bound. A crashed aggregator may resume from existing artifacts only when source/artifact digests match the candidate. It cannot reuse another candidate's results.
