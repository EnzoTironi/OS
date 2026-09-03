# W1-04 validation

## Current state

- Unit: `W1-04`
- Pull request: `#618`
- Branch: `codex/w1-04-eve-runtime-boundary`
- Product head at merge: `b1a9ab0717d2a1a7a070861ea0139ee0d98ae0b6`
- Product merge on `main`: `c9779377e2144d17846dbabb09974a3947049005` at `2026-09-03T11:30:11Z`
- Exact journey-proof head: `4dc06a4ac3161ce747f3d46c88d47e101dcdb4b3`
- Verdict: `journey-verified`
- State: product already squash-merged via `#618`; this closeout records exact-tip journey proof only

No verdict is inherited from pre-merge candidacy heads such as `aa07dce8`. The ledger head and merge SHAs name the exact main tip that was exercised.

## Exact-head journey evidence

Proof worktree: `/workspace/tmp/w104-proof-4dc06a4` on `4dc06a4ac3161ce747f3d46c88d47e101dcdb4b3`.

- messaging-boundary: PASS, 27 assertions
  - Artifact: `artifacts/messaging-boundary/messaging-boundary.json`
  - SHA-256: `296bddaaa9822e46d6d6e79291780455e40cd5516f7991130836014e69c03311`
  - `sourceCommit`: `4dc06a4ac3161ce747f3d46c88d47e101dcdb4b3`
- s3-workbench: PASS
  - Artifact: `artifacts/s3-workbench/s3-workbench-proof.md`
  - SHA-256: `7c6c0d7ab820da7bcf9513c2252b27d0ad4a17a7fd7bfb4c7afc368cfdfc90f7`
- effect-runtime: PASS, 44 assertions, exit 0
  - Artifact: `artifacts/effect-runtime/effect-runtime.json`
  - SHA-256: `55188a788c4cfa0f75aaba0ed9d97ba84eabcf23fc797758427fc626d1ebdbaa`
  - `sourceCommit`: `4dc06a4ac3161ce747f3d46c88d47e101dcdb4b3`

These artifacts cover the W1-04 runtime-boundary and recovery surface that `#618` landed (Eve internal Ontology URL, retired legacy conversation / channel ingress paths, preserved `/live` and workload credential governance) together with the J8-shaped effect-runtime recovery already required beside W1-03.

## Honest remaining gaps

These belong to later units and do not reopen W1-04:

- Live J5 end-to-end across Telegram / Kapso origin delivery → `W5-03` / `W5-04` / `W5-05`
- Composite `/ready` covering policy, release, projection, ZoenEffect, Eve, Auth, and storage → `W1-06`
- One-Fly image CI and restored live scenarios → `W1-07`

## Independent review

Independent Shipping review returned PASS on the exact proof tip before this ledger closeout. Scope covered Eve-owned conversation boundary, deleted Ontology Conversation / `whoCan` surfaces, preserved `/live` and workload credential governance, and the recorded messaging-boundary / s3-workbench / effect-runtime artifacts.

## Remote evidence

- Product PR `#618` squash-merged to `c9779377e2144d17846dbabb09974a3947049005`
- Tracker: issue `#627`
- Landing order after this closeout: `W1-06`, then `W2-01` (both unblocked). Do not restart `W1-04`.

## Notes

- Keep W1-05 live Telegram ceremony pins unchanged
- Live WhatsApp personal inbox remains banned; Kapso sandbox only
