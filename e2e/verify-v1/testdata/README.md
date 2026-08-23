# verify-v1 gate contract fixtures

These directories are **gate contract fixtures**, not production evidence.

- `complete/` — minimal passing evidence graph for the aggregate gate.
- `fail-closed/` — deliberately incomplete/wrong evidence that must FAIL.

Commit fields use the placeholder `__CANDIDATE_SHA__`. The gate substitutes the candidate SHA in memory only for paths under this testdata tree. It never rewrites real `artifacts/`.

Official named PASS command:

```text
ZOEN_VERIFY_EVIDENCE_DIR=e2e/verify-v1/testdata/complete just verify-v1
```

or:

```text
just verify-v1-fixtures
```

Default `just verify-v1` still reads real `artifacts/` and fails closed when KIND/production evidence is missing or stale.
