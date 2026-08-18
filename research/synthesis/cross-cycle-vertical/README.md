# Issue #71 — cuts against the existing kernel

**Issue:** #71  
**Kernel:** `os_kernel` on PR #169 (`cursor/kernel-v001-v3-a60c`)  
**Decision:** none

`Kernel.apply` / `Kernel.query` / `Kernel.explain` already is the suite interface. The command list is in `schemas/command.schema.json`.

This folder does not grow another runtime.

A previous revision of this PR shipped `adapters/reference.py`: a second in-memory world with its own commit, grants, effects, and inventory. That duplicated the kernel. It is gone.

## What V-001 already runs

Rival claims, proposal, approval, stale replan, commit, replay, effect `unknown`, unsafe retry, reconcile, `known-then` vs `now-believed-for-then`, causal explain. Domain lives in `fixtures/v001/definitions.json`.

Run it there, not here:

```text
cd research/experiments/kernel-v001
python3 -m unittest tests.test_v001_properties -v
```

Those files are on the kernel branch, not on `research-corpus`.

## What #71 still needs

New fixture on that same kernel, same command types. Missing cuts in `suite/cuts.json`:

- human and agent commit the same `action_id`
- `InstallDefinitionRevision` mid-cycle, historical explain pinned
- receivable/settlement after fulfillment
- return that does not rewrite the shipment

Do that as `fixtures/cross-cycle-71/` next to `fixtures/v001/`. Definitions, not a new `class Kernel`.
