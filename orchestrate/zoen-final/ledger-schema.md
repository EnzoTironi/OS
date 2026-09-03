# Verification ledger schema

`ledger.tsv` records one immutable verdict for one exact pull request head. A later head needs a new row.

| Column | Contract |
| --- | --- |
| `unit_id` | A unit ID from `program.json`. |
| `pr` | The GitHub pull request number. |
| `head_sha` | The exact reviewed and exercised source commit. |
| `merge_sha` | The resulting commit on `main`. Leave this field empty before merge. |
| `verdict` | The bounded proof verdict. Current values are `journey-verified` and `live-ui-verified`. |
| `evidence` | A repository-relative evidence document. |
| `verifier` | The named independent verifier. |
| `verified_at` | The UTC time of the verdict. |
| `merged_at` | The UTC merge time. Leave this field empty before merge. |

The ledger does not infer a verdict from a green check. The evidence document states the positive, denial, recovery, and exact-head proof that supports its verdict.

Every implementation unit after wave 0 needs exactly one ledger row that matches its pull request, head SHA, merge SHA, verdict, and evidence before its status can become `done`. A merged implementation without that row remains `proof_pending`; merge metadata alone is not verification.
