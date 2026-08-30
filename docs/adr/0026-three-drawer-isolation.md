# ADR-0026: Three drawers stay isolated at runtime

**Status:** Accepted for V1
**Date:** 2026-08-25

## Context

ADR-0010 and ADR-0016 already split transactional authority from rebuildable Parquet/DataFusion reads. ADR-0017 already puts Restate behind a port. `apps/zoend/state-classification.yaml` names the tables. `StateClassification::validate()` only rejects a table listed as both authority and rebuildable.

That is a label, not a door. `zoen-projection` opened `PostgresAuthorityStore::connect` with `DATABASE_URL`, the same `zoen_app` role that owns `semantic_claims` and `authority_heads`. A leaked projection worker credential could write canonical state.

PostgreSQL 18, the Parquet worker, and the production Restate worker already ship. This ADR does not invent a second evidence log, a new query engine, or a new orchestrator.

## Decision

Durable state has three drawers. Each has one write role.

1. **Authority.** PostgreSQL 18. Role `zoen_app`. `zoend` and `zoen-effect-dispatcher` write here. Tables listed under `authority.postgresTables` are canonical. They are not rebuilt from Parquet or Restate journals.

2. **Evidence.** Immutable Arrow/Parquet objects plus DataFusion. PostgreSQL holds only rebuildable `projection_manifests` and `projection_watermarks`. Role `zoen_projection` may `SELECT` any public table and may `INSERT`/`UPDATE` only those two watermark tables. It has no `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE` on authority tables. `PostgresAuthorityStore::connect` re-applies migration `0021` after every migrate so a role created after sqlx records that checksum still receives table grants.

3. **Orchestration.** Restate. Fly runs `zoen-effect-dispatcher`. Journals are rebuildable. Restate retry must not become semantic truth.

`zoen-projection` migrates with `DATABASE_URL` (`zoen_app`). That migrate credential stays in the process. The worker pool requires `ZOEN_PROJECTION_DATABASE_URL`. An unset or empty value fails closed. A URL that can `INSERT` into `semantic_claims` fails closed.

## Consequences

A stolen projection worker password cannot insert claims or move heads. Classification YAML remains the backup/readiness inventory. It is not the isolation mechanism.

`semantic-query` proves the door: `zoen_projection` receives `42501` on authority writes, can update watermarks, and the worker still publishes Parquet under that role. PostgreSQL 18 is already asserted in that scenario.

## Revisit if

A drawer needs a second write role, or projection metadata moves out of PostgreSQL.
