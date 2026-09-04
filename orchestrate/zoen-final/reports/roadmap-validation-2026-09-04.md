# Roadmap completion audit — 2026-09-04

## Verdict

The 44-unit GitHub issue range `#626` through `#669` is not 11/44 complete. At `main@6fae261e475576d2ec858ead6082bd985487f837`, `#630`, `#631`, `#632`, and repaired `#633` have a completion verdict. Seven audited issues remain reopened, leaving 40 open.

A merge, a passing build, or a green scenario is supporting evidence. Completion requires the issue's named product journey, including negative, replay, isolation, and recovery behavior. Historical ledger rows remain immutable records of what passed at their exact heads; they do not override this current audit.

## Evidence run

- `cargo build --workspace` passed on the audited main.
- `./e2e/run.sh run world-release` passed 99/99 assertions.
- `./e2e/run.sh run agent-parity` passed 18/18 assertions.
- `./e2e/run.sh run governed-clinic` passed 27/27 assertions.
- GitHub Actions run `33862675772`, attempt 2, passed after rerunning the failed artifact-download job.
- Pull request #686 run `33860956145`, attempt 3, passed after rerunning its failed concurrent-journey job.
- Pull request #688 exact head `28b5e72ddf114ee5a7c38b0f0688b882eaf1dff2` passed `world-release` 132/132 across all six J1 dimensions, two independent reviews, and every required remote check before squash merge.
- `node orchestrate/zoen-final/verify-roadmap-state.mjs` matched all 44 live GitHub issues to canonical units and confirmed 40 open / 4 verified closed.

Those green results do not exercise the defects below, so they cannot close the affected units.

## Reopened findings

| Issue | Unit | Current verdict | Blocking evidence |
| --- | --- | --- | --- |
| #626 | W1-03 | Proof pending | The production Rust ZoenEffect substrate landed, but the issue also names the full J6 and J8 recovery ceremonies, which are owned by downstream work and are not yet complete. |
| #627 | W1-04 | Proof pending | Eve owns the intended runtime boundary and legacy paths were removed, but the issue's complete J5 and J8 proof is still downstream. |
| #628 | W1-06 | Rejected | `crates/zoen-adapters/src/integrity.rs` still derives readiness from legacy active DefinitionRevision state, while `apps/zoend/src/ready.rs` still treats a boot-manifest Cedar path as authority instead of the active WorldRelease and PolicyCatalog. |
| #629 | W1-07 | Rejected | The one-Fly governed-release scenario still publishes and activates legacy DefinitionRevision state and does not prove the four-catalog WorldRelease preview/decide/activate path. |
| #634 | W2-05 | Rejected | `authorize_verb` ignores its verb argument and authorizes every call as `Discover`. The parity journey labels repeated local CLI calls as separate surfaces. |
| #635 | W2-06 | Rejected | Cursor integrity is an unkeyed SHA-256 digest of public inputs, so a client can forge it. Ordinary granted members can query without active-release Cedar authorization, and the recovery/parity proof is synthetic. |
| #636 | W2-07 | Rejected | A caller can select a larger published BudgetClass without principal-to-class policy authority. Literal MCP/Eve parity is not exercised. |

## Active pull-request blockers

- #686 / W2-08: a receipt can commit before TypeAssignment materialization, permitting an orphaned replay; assignment integrity is not bound to the identifier's World and object; the journey does not traverse real Eve, Connect, or MCP surfaces.
- #683 / W3-01: production Eve still calls the old resolve-context contract; provisional bindings are accepted as bound ingress; migration backfill can reject a valid unconsumed invite; the claimed Web path is synthetic.

## Remediated finding

- #633 / W2-04: PR #688 replaced suffix authority with an opaque, move-only authorization bound to the exact Membership, actor, workload, World, release, operation, policy, and preview; made mutation and immutable evidence atomic; and serialized first activation on a stable per-World lock. Exact-head J1 passed 132/132 and all required CI passed before merge.

## Next landing order

Repair W1-06, W1-07, W2-05, W2-06, and W2-07 on the verified W2-04 authority base, while bringing #686 and #683 onto that same base. Only then advance the dependent waves.
