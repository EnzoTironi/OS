# Open questions

**Kind:** reference.  
**Decision:** all rows `undetermined` unless marked otherwise.  
**Rule:** none of these answers were written into `docs/open-questions.md`.

## Left open on purpose

| ID | Question | Why it stays open | Owner |
| --- | --- | --- | --- |
| Q-061-01 | `docs/open-questions.md` question 21 as a whole | This folder ranks greenfield cores. It does not pick a durability, policy, or store product. Standing order 8 forbids inventing the doc answer | synthesis after more Wave A |
| Q-061-02 | Which durability worker, if any | Temporal is rejected as a core and only `undetermined` as a worker. No other durable-execution product was opened | Wave B after semantic pressure |
| Q-061-03 | Which policy evaluator, if any | Cedar matches PARC and needs a fail-closed wrapper. OpenFGA is a different shape. Neither is chosen | issue 9 and Wave B |
| Q-061-04 | Which temporal store, if any | XTDB is the strongest public bitemporal candidate opened here. MPL-2.0 and `ERASE` are unresolved. RFC-0001 Fact is still a hypothesis | issue 7, issue 59, Wave B |
| Q-061-05 | Whether a ledger store can evaluate debit-equals-credit without owning accounts | X-002. TigerBeetle LICENSE was not opened | issue 58, issue 21, Wave B |
| Q-061-06 | Whether Frappe MIT can be a surface generator without leaking Document | Matrix cell is `undetermined` | issue 22, issue 64 |
| Q-061-07 | Whether issue 68 already kills or saves an existing platform | `cursor/issue-68-kill-cfd8` was not on origin | issue 68 |
| Q-061-08 | Whether Palantir's closed ontology is a quality counterexample to building the core | Cite-only. Terms not fetched. Sibling issue 35 tree was listed, not opened beyond `research/reference-landscape.md` | issue 35 |
| Q-061-09 | How packages and compilers relate to reuse | Constitution §6 and RFC-0001 already refuse them as primitives. This kill test does not reopen them | issue 16, issue 17, issue 64 |
| Q-061-10 | Whether a planning library may sit behind L-K-08 | No first-party solver docs opened. Sibling issue 58 already says a solver proposes and an Action commits | issue 58, issue 25 |

## Questions this folder does answer, inside this tree only

These are folder decisions. They are not silent edits to the open-questions doc.

| Claim | State | Where |
| --- | --- | --- |
| Building the semantic core from zero is inferior to adopting an existing product core | rejected | L-006, R-001 through R-004 |
| Minimizing new code is a valid ranking key | rejected | R-007 |
| ERPNext, Frappe, Moqui, Open Foundry, ObjectStack, Ontologiq, or Temporal should be the greenfield meaning authority | rejected | alternatives A4 through A8 |
| Physical mechanism behind a replaceable boundary is an allowed class | supported | L-002, A1 |
| Question 21 in `docs/open-questions.md` is now closed | rejected as a move | R-008 |

## Falsifiers that would reopen the ranking

1. An MIT or Apache operational ontology that already implements S-003, S-004, S-007, S-010, and S-012 without a second ERP.
2. A proof that Action, Event, and unknown Effect cannot be stated without Temporal Event History.
3. A proof that posted-history laws cannot be stated without ERPNext DocTypes.
4. Independent sources converging on a Fact representation that is exactly XTDB row bitemporality. Even then, edit RFC-0001 only after that convergence is recorded outside this folder.
