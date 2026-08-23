# verify-activation gate contract fixtures

These directories are **gate contract fixtures**, not production evidence.

- `complete/` — minimal passing evidence graph for the aggregate gate.
- `fail-closed/` — deliberately incomplete/wrong evidence that must FAIL.

Commit fields use the placeholder `__CANDIDATE_SHA__`. The gate substitutes the candidate SHA in memory only for paths under this testdata tree. It never rewrites real `artifacts/`.

Official named PASS command:

```text
just verify-activation-fixtures
```

Default `just verify-activation` still reads real `artifacts/` and fails closed when production-shaped AD evidence is missing or stale.
