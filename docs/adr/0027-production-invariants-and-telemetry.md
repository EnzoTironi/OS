# ADR-0027: Production invariants expose JCS mismatch and admit latency

**Status:** Accepted for V1
**Date:** 2026-08-25

## Context

ADR-0023 already fail-closes definition admission on non-RFC 8785 bytes. CI already pins shared JCS fixtures. Operators still could not see a mismatch count from a running `zoend` without reading logs.

The process itself did not export a latency histogram. Adding an OpenTelemetry or Prometheus crate would grow the kernel for scrape text.

ADR-0021 names eleven semantic mutants. The eleven laws have proofs on live default-CI scenarios plus one `cargo test` in `zoen-engine`. The gap was an inventory that would fail if those proofs moved out of the release suite.

## Decision

1. `zoen-engine` keeps process-local atomics. `admit` always records latency. It increments `zoen_jcs_mismatch_total` only on `PublishError::NonCanonicalDefinition`. Digest mismatch and invalid exact integers do not increment that counter.
2. Histogram `zoen_admit_duration_seconds` uses cumulative Prometheus buckets 0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, and +Inf.
3. `zoend` serves `GET /metrics` as Prometheus 0.0.4 text without authentication, the same class as `/ready`. The body has no tenant, document, or digest bytes. `/ready` keeps its own router state. `/metrics` does not open the database.
4. `definition-publication` proves the door: a digest mismatch and non-canonical integers leave the counter unchanged, spaced JSON increments it, and the histogram count moves.
5. `testdata/semantic-mutants.json` maps the eleven ADR-0021 laws to named assertions on the executed `e2e/<scenario>.ts` runner, plus one `cargo test`. `scripts/check-semantic-mutants.mjs` runs from `e2e/run.sh lint`. Empty needles fail. An e2e proof whose entrypoint is not that runner fails.

This ADR does not add a scrape crate, a new CI matrix job, or a second evidence log.

## Consequences

A scraper can hit `/metrics` on the listen address. A stolen token is not required. The series stay process-local. Restart resets them.

The mutant inventory is the release list. Moving a proof to an archive or optional scenario fails lint. Deleting the named assertion or the exact `await verify*(scenario)` invocation also fails lint. An unused import is not a proof.

## Revisit if

Admission latency must be labeled by tenant, or scrape must survive process restart, or the histogram must leave the process through OTLP.
