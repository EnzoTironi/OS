# W1-01 architecture arena

## Arena phases

- [x] Frame
- [x] Fan out
- [x] Cross-judge
- [x] Pick
- [x] Graft
- [x] Verify

## Artifact

Design the governed definition-publication boundary for `W1-01-governed-publish` before product code changes. Each candidate must produce caller-first usage, domain types, function signatures, a module map, transaction and replay semantics, policy bootstrap semantics, and a one-page rationale in the Architect template.

## Grounding

- Product target and pilot contract: `orchestrate/zoen-final/reports/w0-synthesis.md`
- Current revision: `d530f622141149f564a22e2f03051c34690426f4`
- The existing `DefinitionEngine::publish` receives a policy evaluator but does not evaluate it.
- `PolicyOperation` has no Publish variant.
- `CedarPolicyEvaluator` keys policy by definition digest and Action ID.
- Publish must deny before storage, persist exact policy evidence in the same transaction, authorize every replay against current caller authority, and remain compatible with the W2 replacement of boot policy by `WorldRelease` candidate policy.
- The product is pre-launch. Migrate callers atomically. Add no compatibility path.

## Structurally distinct candidates

1. Engine-owned admission. `DefinitionEngine::publish` evaluates candidate-scoped Publish authority and hands a typed admitted publication to the transactional store.
2. Application-owned command admission. A catalog/application boundary turns an external publication request into a typed authorized command before the definition engine can persist it.

Candidates may refine their assigned direction but must not converge by merely renaming the other direction.

## Rubric

Score each candidate from 0 to 5 on these criteria.

1. Fail-closed authority. Denied or absent candidate policy cannot reach a write-capable store call.
2. Atomic evidence. Revision, authority commit, policy evidence, outbox, and head share one transaction and recover together.
3. Replay semantics. Identical replay re-evaluates current authority, then returns the original revision without a new commit.
4. Bootstrap path. Candidate policy lookup works today without making boot policy a second authority, and can be replaced atomically by `WorldRelease` in W2.
5. Interface depth. Callers make one domain call, transport types stay at boundaries, and tracing the operation crosses no more than three files.
6. Migration fit. The shape can be implemented and proven in `e2e/definition-publication.ts` without unit tests, mocks, compatibility aliases, or an applied-migration rewrite.

Any design that permits a raw publication write without an authorization-bearing type is ineligible. Any design that stores a boolean authorization result instead of auditable policy evidence is ineligible.

## Throughput checkpoint

After the first allow/deny journey slice, stop and inspect the work. If more than one same-shaped Cedar fixture edit or policy-digest edit has been done manually, build a deterministic fixture generator or checker before continuing. Do not continue a repetitive manual path.

## Decision authority

The arena is autonomous. No human checkpoint is required. The judge recommends a base. The coordinator reads both candidates and the judgment, chooses one coherent shape, records grafts and rejections, then freezes the worker brief.
