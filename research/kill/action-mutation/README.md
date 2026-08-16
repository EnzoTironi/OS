# Action-only mutation kill test

- Artifact ID: `issue-0057-action-mutation`
- Issue: <https://github.com/EnzoTironi/OS/issues/57>
- Parent: <https://github.com/EnzoTironi/OS/issues/2>
- Track: kill
- Retrieved: 2026-08-16
- Contract: Agent output contract in `docs/swarm-research-backlog.md`. `docs/swarm-result-contract.md` is absent on `origin/main`.
- Decision states present: `hypothesis`, `supported`, `rejected`, `undetermined`
- Kind key: domain evidence, source-system artifact, candidate law, counterexample, runtime consequence

This folder does not edit `rfcs/0001-metamodel-hypothesis.md`. It does not invent answers into `docs/open-questions.md`. It does not propose a target schema.

The claim under attack is the working hypothesis that meaningful business mutation should always occur through named Actions. Constitution §7 already says that rule is not frozen. This pass tries to kill the universal reading.

## Question

Which writes are business decisions that require named Actions, and which writes are observations, replicas, derived caches, collaborative drafts, admin edits, or maintenance? Are there legitimate generic mutations, or should those still be explicit low-level Actions? Does forcing a named Action on every persist create empty boilerplate, or does it buy safety?

`docs/open-questions.md` item 4 stays `undetermined` as architecture. Cite this folder. Do not treat the folder verdict as an answer written into that file.

## Verdict

**Folder decision state.** The universal law "every persist is a named business Action" is `rejected`. The narrower law "a business decision that changes operational truth goes through a named Action" is `supported`.

Palantir's own backend already writes objects from datasets and streams without an Action. Funnel indexes datasources and user edits as two inputs. Yjs applies commutative binary updates that are not business verbs. PostgreSQL replaces a materialized view by re-running a query. Fowler rebuilds application state by replaying an event log. Those are real writes. They are not ShipOrder.

ERPNext, Odoo, Moqui, ValueFlows, and accounting notes still protect the other half. After submit, generic field write is how you wreck a ledger. Inventory adjustment is Apply, not `write({qty: n})` on a done move. A ValueFlows EconomicEvent is an observed past flow, not an in-place edit of last week's quantity.

The leftover is not "CRUD is fine." Silent mutation of posted operational truth stays `rejected`. Some write classes need typed, attributable, low-level operations. Ingest, apply-replica, refresh-projection, apply-draft-patch, revise-ontology. Calling every one of those ShipOrder is how Action-first becomes a slogan.

Workflow-as-kernel is already a recurring `rejected` elsewhere. This folder does not reopen it.

## Independence

I did not copy sibling folders. I read them with `git show` on the named branches. Those notes propose Action, Event, Fact, and provenance distinctions. This folder attacks the claim that Action is the only legal write.

Issue 56 kept Action as a required sort. I keep that for decisions. I do not inherit "all writes are Actions." Issue 7 already said Events can arrive with no OS Action. This folder uses that as a kill, not as courtesy.

## Sibling notes, read only

Paths exist on other branches. This folder cites them. It does not write them.

- Foundation actions, `origin/cursor/issue-7-foundation-cfd8` at `08676a1040780eed586288c1a43fa40535e2111d`, `research/notes/issue-0007-action-event-effect.md`, especially L-005
- Foundation facts, `origin/cursor/issue-4-foundation-cfd8` at `905baa0c99f09fd445b9f1bb0eee5435fa814be3`, `research/foundation/facts/`, Observation versus Decision
- Foundation provenance, `origin/cursor/issue-6-foundation-cfd8` at `ad79e365c0133886cdb7957e18dcedc833bbcaf2`, `research/foundation/provenance/`
- Kill unified ontology, `origin/cursor/issue-55-kill-cfd8` at `5f4233579cf3057783775126afa64c39ed631353`, `research/kill/unified-ontology/`
- Kill primitives, `origin/cursor/issue-56-kill-cfd8` at `b44575d3d212c67258bee6ed0013e8409c530a5e`, `research/kill/primitives/`, L-P-02
- Inventory, `origin/cursor/issue-18-domain-cfd8` at `de2bbe3ff71dcabb9ead699854a1b934496affbc`, `research/domain/inventory/`
- Accounting, `origin/cursor/issue-21-domain-cfd8` at `4df1c8b44d8f21cdf23ebfa32bae247cd25aa9dc`, `research/domain/accounting/`, Posting as Action versus LedgerEntry as occurrence

## Files

| File | Mode | Contents |
| --- | --- | --- |
| `sources.md` | reference | Versioned locators used this session |
| `evidence.md` | reference | Evidence cards E-001 through E-022 |
| `taxonomy.md` | explanation | Write classes W1 through W10 |
| `matrix.md` | reference | Convergence, divergence, source artifacts |
| `candidate-laws.md` | explanation | Laws L-AM-01 through L-AM-14 |
| `scenarios.md` | reference | Scenario cards S-001 through S-028 |
| `open-questions.md` | reference | Residual uncertainty. No invented answers |

## Output contract

1. **Question.** This README.
2. **Sources.** `sources.md`.
3. **Evidence.** `evidence.md`.
4. **Source artifacts.** Marked in `evidence.md` and `matrix.md`.
5. **Convergence.** `matrix.md`.
6. **Divergence.** `matrix.md`.
7. **Candidate laws.** `candidate-laws.md`.
8. **Counterexamples.** `scenarios.md`.
9. **Runtime pressure.** Each law names a runtime consequence without selecting a runtime.
10. **Open questions.** `open-questions.md`.
11. **Decision state.** Each card. Never `accepted`.

## How to read this

Start with the verdict and L-AM-01 through L-AM-06. Use `taxonomy.md` when a later issue asks which write class a persist belongs to. Use `scenarios.md` when a later issue asks what would revive universal Action-only. Use `matrix.md` when a later issue asks what Palantir Funnel, Frappe `db_set`, or Yjs actually did.

Do not treat Funnel, `docstatus`, `write()`, or `Y.applyUpdate` as OS vocabulary. They are observations about other systems.

## Licensing

OS is MIT. These notes extract concepts and documented behavior. No copyleft implementation was pasted or translated. ERPNext, Odoo, and Moqui appear through public documentation and sibling notes.

## RFC-0001

Do not edit `rfcs/0001-metamodel-hypothesis.md`. If synthesis later accepts these kills, the pressure is on open question 4 and constitution §7. The candidate laws are evidence, not a primitive list.
