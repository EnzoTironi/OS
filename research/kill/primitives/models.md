# Competing minimal cores

**Kind:** explanation  
**Retrieved:** 2026-08-16  
**Decision:** per model. None accepted.

Four cores. Each one tries to express the RFC-0001 list with fewer base sorts. For every deleted sort I name what enforcement, ergonomics, auditability, static checking, optimization, or meaning is lost. Then I try to kill the core with accounting, inventory, employment, approvals, time, and external effects.

This is not a schema. Names inside a core are research labels.

## How to score a core

A core is `rejected` when a required distinction becomes a hidden convention, or when an independent corpus already failed the same collapse.

A core is `hypothesis` when it survives the attacks in this folder and still has a named falsifier.

A core is never `accepted`.

## M1. Operational quartet

```text
Type
Link
Function
Action
```

**Intent.** Palantir, Open Foundry, and the H1 notes already sell objects, links, actions, and permissions. Fold Event, Fact, Interface, Constraint, Policy, Property, and Relator into those four.

**Kind:** candidate model fragment

### Encoding of the RFC list

| RFC form | M1 encoding |
| --- | --- |
| Type | Type |
| Property | field on Type |
| Interface | Type with no instances, or a flag on Type |
| Link | Link |
| Relator | Type with two required Links |
| Action | Action |
| Function | Function |
| Constraint | Function returning Bool, called from Action |
| Policy | Function returning Bool, called from Action |
| Event | Type implementing an Event flag or Interface |
| Fact | current fields on Type, plus optional history table |

### What looks cheap

Authoring stays close to products people already know. Surfaces generate from Types and Actions. Relator-as-object matches issue 3's composition advice. Derived totals look like Functions. Seed S-006 employment can be a Type.

### Loss table

| Removed form | Enforcement lost | Ergonomics lost | Auditability lost | Static checking lost | Optimization lost | Meaning lost |
| --- | --- | --- | --- | --- | --- | --- |
| Event as nature | Immutability and append-only correction become house style. A planner can add `status` to ShipmentCreated. | Modelers stop seeing occurrence as a different question. | "What happened" and "what we tried" share one object log. | The compiler cannot refuse mutation of an occurrence. | Ledgers cannot assume append-only layout. | Action success becomes the Event. E-001, E-007, E-021 |
| Fact | Rival observations cannot stay live on one property. E-023 | No place to hang valid time and provenance except ad-hoc fields. | S-011 chat versus ERP versus spreadsheet collapses to one winner. | No type for "same predicate, two provenances". | No shared assertion index. | Observation versus decision versus derived collapse. E-015 |
| Interface | None if it was only shape. Role enforcement is already lost if you used it for Supplier. E-011 | Capability queries need another mechanism. | Who implemented what becomes a search over flags. | Cross-kind `Priceable` queries need structural typing elsewhere. | Interface-based indexes go away. | Almost nothing, if Role stays out of this slot |
| Constraint | Odoo-style trigger holes. SQL bypass. Save versus submit. Issue 8 R1.6 | Authors write `if not balanced: throw` inside every Action. | Why a write was legal then is buried in Action code. | Cardinality and balance are not declarable. | The engine cannot push constraints to a store. | Obligated party. Pre versus post versus invariant. E-008, E-020 |
| Policy | Cedar skip-on-error, OpenFGA 400≠false, K8s false versus error. E-002, E-014 | PARC requests become ad-hoc Function args. | Determining policy IDs disappear. | Delegation and SOD cannot be checked as data. | Relation-tuple engines cannot be used honestly. | Authority versus validity. E-012 |
| Property | Units and currency become conventions on numbers. E-018 | Money looks like `float`. | Posted FX cannot cite amount plus currency as a value. | Adding USD to EUR type-checks. | Decimal and unit indexes are optional. | Value versus object. Issue 3 L6 |

### Adversarial hits

**Accounting.** `PostJournalEntry` as Action plus `BalancedJournal` as Function still lets an agent call a different Action that writes LedgerEntry rows directly, unless Bind is mandatory at commit. Draft totals computed by Function will leak into trial balance if someone stores them. E-008.

**Inventory.** On-hand as a field on Stock is the classic lie. L-INV-05 wants movements. M1 can model Movement as a Type. Nothing stops Movement from growing an `editQty` Action. E-009.

**Employment.** Employment as Type works. `Employee` as Interface fails E-011. M1 invites that mistake because Interface is how the quartet usually fakes roles.

**Approvals.** Function-as-policy evaluated at propose cannot see the 10:06 receipt. Palantir validate already refuses to read existing objects. E-003, E-012.

**Time.** One `updatedAt` on Type answers neither valid-then nor known-then. E-017.

**External effects.** Action apply returns success after local commit. The carrier call is a Function with I/O, which issue 8 already said is an Effect, not logic. Timeout becomes `false`. E-004, E-006.

### Verdict

**Decision state:** `rejected` as a sufficient semantic core.

It remains a plausible authoring surface over a richer core. That is a toolchain thought. Wave B waits.

**Falsifier that would revive it.** A first vertical where Event immutability, policy algebra, and rival observations are all enforced by convention plus linters, with no repeated operational failure. Not seen.

## M2. Fact-rule core

```text
typed Fact
Rule
```

Objects are projections over Facts. Actions are rules that assert Facts. Events are Facts with an occurrence predicate. Constraints and policies are rules with a fail-closed flag. Types are schemas over Fact shapes.

**Kind:** candidate model fragment

This is the datalog, RDF, and "just event-source it" temptation. Issue 12 already rejected pure event sourcing as a kernel requirement. I still have to run the reduction. Irreducibility, not politeness.

### Encoding of the RFC list

| RFC form | M2 encoding |
| --- | --- |
| Type | projection schema, a named bundle of Facts |
| Property | predicate |
| Interface | query over predicates |
| Link | binary Fact |
| Relator | n-ary Fact or a Fact about a surrogate id |
| Action | rule that, if Bind-like conditions hold, asserts Facts |
| Function | rule that derives Facts |
| Constraint | rule that forbids a Fact set |
| Policy | rule over principal, action name, resource Facts |
| Event | Fact with `occurred` or a perdurant predicate |
| Fact | the atom |

### What looks cheap

One information atom. Bitemporal clocks attach uniformly. Rival values are extra Facts, not object-merge losers. Current stock is a sum. S-007 late receipt is another Fact with an earlier valid time. PROV-style provenance hangs on every atom.

### Loss table

| Removed form | Enforcement lost | Ergonomics lost | Auditability lost | Static checking lost | Optimization lost | Meaning lost |
| --- | --- | --- | --- | --- | --- | --- |
| Type as identity sort | Kind rigidity and one identity principle become query conventions. Issue 3 L1, L6 | Modelers write predicates instead of things. Employment looks like a pile of triples. | "Which individual" is a query, not a key. Merge and split become graph rewrites. | Cardinality and exclusive phase need extra rule packs. | Object indexes and primary keys are optional caches. | Endurant versus value. Address fights return. |
| Action | Attempt versus assertion collapse. A proposed purchase is a Fact. A posted receipt is a Fact. | Humans and agents lose a shared verb. Surfaces must invent verbs on top. | Who tried, who approved, what was unknown, sit in optional predicates that authors forget. | The compiler cannot require an Action to name an Actor. Issue 11 L1 | Command routing and idempotency keys have no sort. | Constitution §8. E-021, E-004 |
| Event as nature | Same as Action loss, plus immutability is a rule someone must remember to write per predicate. | Economic Event, audit log, and UI click share one atom. | Correction versus compensation needs a `corrects` predicate used everywhere. E-001, E-007 | Occurrence predicates are strings. | Ledger append paths cannot be assumed. | Intent versus Commitment versus Economic Event. E-001 |
| Function versus Rule | Purity is a comment. A rule can call a webhook. | Authors cannot tell Eval from Effect. | Historical replay re-calls the world. Issue 8 L5 | External-read versus pure is unchecked. | Materialization versus live derive is untyped. | Search status, agent uncertainty. E-020 |
| Policy | Graph authorization becomes a pile of implication Facts. OpenFGA 400 becomes false. | SOD and delegation are more rules. | Determining policies are whatever the rule tracer says, if one exists. | Unknown relation is not a type error. | Tuple engines are hidden. | Authority versus validity. E-002 |
| Bind loci | Read, preview, commit, effect, projection become rule metadata that M2 pretends not to need. | One rule file does all jobs. | Preview-pass cited as commit-pass. E-012 | Locus is a string. | Store-level constraints cannot be placed. | Issue 8 five loci |

### Adversarial hits

**Accounting.** A posted unbalanced journal is a Fact set plus a broken rule. If the rule is not bound at commit, the Facts exist and the books move. Failed posting as a durable unposted-with-reason state is an Action outcome, not a missing Fact. Issue 21 L18.

**Inventory.** M2 is strongest here. Movements as Facts, on-hand as a rule. It still fails reservation identity if the claim is only a derived remainder with no Fact to target for release. L-INV-04, L-INV-15. It also wants every descriptive field, including a counted official snapshot, to be a fake event. Issue 12 CL-2.

**Employment.** You can encode Employment as Facts. Promote then needs a rule that asserts new Facts and maybe invalidates old ones. The Action `Promote` still exists in the business. Hiding it behind "assert title Fact" loses who attempted it and whether approval was stale.

**Approvals.** An approved Fact is a current assertion. S-003 needs the approval to stay in the history while commit refuses. That is an Action stage, not a Fact rewrite.

**Time.** Universal Fact clocks over-claim. Issue 5 L2. Draft notes and caches do not want four timestamps.

**External effects.** A timeout is not a Fact about the supplier order. It is a Fact about knowledge. If M2 has only one atom, authors will store `orderCancelled=false` and retry with a new key. E-006.

### Verdict

**Decision state:** `rejected` as the sole kernel.

The weaker claim, that a Fact-shaped encoding is useful for dated sourced assertions, stays `hypothesis`. Issue 4 already said that. Objects as projections over facts is `supported` for remainders and `rejected` as a universal law. Issue 12 CL-3 versus CL-2.

**Falsifier that would revive the strong core.** A first vertical where every reconstructability failure traces to a stored current field with no event, and where adding Events is cheaper than a ledger of effects or a mixed model. Issue 12 looked and did not find it. Neither did I.

## M3. UFO natures plus verbs

```text
Kind
Role
Relator
Event-nature
Action
Policy
```

**Intent.** Keep the ontological sorts that issue 3 and UFO actually use. Add Action and Policy because an executable OS is not a conceptual model. Delete Interface, Fact, Function, Constraint, Link, Property.

**Kind:** candidate model fragment

### Encoding of the RFC list

| RFC form | M3 encoding |
| --- | --- |
| Type | Kind, or Phase, or Role |
| Property | Quality on an endurant |
| Interface | RoleMixin or a banned idea |
| Link | material relation derived from Relator |
| Relator | Relator |
| Action | Action |
| Function | unnamed, hidden in Action and Policy bodies |
| Constraint | existential dependence and cardinality on Relator |
| Policy | Policy |
| Event | Event-nature, a perdurant |
| Fact | qualities and relators at a time |

### What looks cheap

Supplier as Role founded by a Relator is the cleanest story in the folder. Employment is the textbook Relator. Event-nature is not a tag. Seed S-005 and S-006 stop looking like schema fights.

### Loss table

| Removed form | Enforcement lost | Ergonomics lost | Auditability lost | Static checking lost | Optimization lost | Meaning lost |
| --- | --- | --- | --- | --- | --- | --- |
| Link as a cheap edge | Every "mentions" or "tagged with" becomes a Relator or is inexpressible. | Modelers drown in relationship-objects. | Simple associations look as heavy as Employment. | The compiler treats every edge as mediated. | Graph hops pay Relator costs. | RFC-0001's own threshold. Issue 3 L3 |
| Function or Eval | Deterministic totals live inside Action code. Agents can "help" with debit math. | Thesis journal example has nowhere honest to live. | Replay cannot pin a Function revision separate from the Action. | Purity unchecked. | Shared derived-property engines go away. | Determinism as a property of logic. Thesis, E-008, E-020 |
| Constraint as Bind | UFO cardinality is real in the conceptual model and unenforced in Palantir. Issue 3 divergence 3. Conceptual necessity is not commit refusal. | Authors think the Relator forbids two current employers. The store does not. | Historical illegal states can exist with a valid-looking Relator type. | Dependence is documentation. | Store constraints unused. | Constitution rule 1. A sort that does not enforce is decoration |
| Fact | Same rival-value hole as M1 if qualities are single-valued. | Observations become qualities of the Event or the object. | S-011 still needs multiple assertions. | No assertion type. | No assertion index. | Issue 4 Class D clashes |
| Interface | Cross-kind capabilities need RoleMixin, which UFO already warns is a different problem. | `Priceable` becomes a Role, which it is not. | Capability audit mixes with employment audit. | Structural share disappears. | Interface indexes disappear. | E-011, but in the other direction |
| Policy as a sort without algebra | Same Cedar hole as M1 unless Policy secretly grows Bind. | One Policy object per rule, no fold. | Determining policies optional. | SOD as a Relator between powers is pretty and incomplete. E-014 | Engine pick smuggled in. | Issue 67 L-13 |

### Adversarial hits

**Accounting.** Journal balance is not a Relator between debit and credit. It is Eval plus Bind. Event-nature helps posted rows. It does not compute totals. M3 hides Function and then smuggles it back.

**Inventory.** Transformation, transfer, and packing are three relations. L-INV-11. Relator can name them. Reservation as Relator is possible and still `undetermined` in issue 18. The missing Eval still hurts available-to-promise.

**Employment.** Strongest showing. Then issue 28 L4 and issue 3 refuse to pay a native Relator sort until composition fails. M3 pays that cost up front.

**Approvals.** Policy as a sort does not give revalidation loci. E-012.

**Time.** Event-nature versus endurant validity is good. Issue 5 L5 is still only `hypothesis`. M3 over-commits.

**External effects.** UFO has no unknown-after-dispatch. Action plus Policy cannot record `unknown` without an invocation record that M3 treats as just another endurant.

### Verdict

**Decision state:** `rejected` as a kernel.

Keep the distinctions. Do not mint the sorts. Role, Relator, and Phase stay patterns. Event-nature stays a real nature and is why M1 dies. That nature can be a required aspect of the Event sort in M4 without importing the rest of UFO into the engine.

**Falsifier that would revive it.** A domain where ordinary objects plus constraints cannot refuse two Kinds, keep Role out of the identity key, and target relationship-objects, and where that failure appears in more than one corpus. Issue 3 named that test. HR did not meet it.

## M4. Bind-aware six

```text
Type
Link
Action
Event
Eval
Bind
```

**Intent.** Keep only the sorts whose collapse already failed in this folder or in siblings I re-checked. Encode the rest.

**Kind:** candidate model fragment

### Encoding of the RFC list

| RFC form | M4 encoding |
| --- | --- |
| Type | Type, with an identity principle and a rigidity flag if issue 3 still wants one |
| Property | typed attribute, including money and quantity value types |
| Interface | structural contract or query, not a sort. `undetermined` |
| Link | Link, no independent lifecycle |
| Relator | Type with mediation and dependence Binds, plus Links |
| Action | Action, the attempted intervention |
| Function | Eval, purity declared, versioned |
| Constraint | Bind of Eval at a locus, obligation=system |
| Policy | Bind of Eval or a relation query, obligation=authority, combination specified |
| Event | Event, occurrence nature, append-correction |
| Fact | encoding or optional later sort. Not required to run M4 |

Derived property is Eval bound at projection, plus a read-authority fold. Issue 8 L6.

Effect is an Action execution record plus later Events. Issue 7 L-008 remains `hypothesis`. Unknown lives on the attempt. E-004.

Search is Eval with a mandated `{unsat, sat, bound, optimal}` result, or a later extra job. Not a seventh sort today.

### What this still is not

It is not a schema. It is not Wave B storage. It is not "the" metamodel. Issue 55 still says context ontologies sit on top of whatever kernel survives.

### Loss table versus the RFC list

M4 deletes Interface, Property, Constraint, Policy, and Fact as base sorts. Costs that remain honest:

| Removed form | What is actually lost if M4 is wrong |
| --- | --- |
| Interface | Capability indexes and a shared authoring node. Recoverable if structural typing is weak. |
| Property | A place to hang units as a sort rather than a value type. Issue 62 says value type is enough. |
| Constraint | A user-facing word. The job remains. Ergonomics may suffer if authors only see Bind. |
| Policy | A user-facing word and a default algebra. If combination stays unspecified, Cedar and OpenFGA cannot be targeted later. |
| Fact | A single assertion index for rival observations. If Class D clashes dominate the first vertical, M4 must grow a Fact sort. Issue 4 F5. |

### Adversarial hits that M4 is supposed to survive

**Accounting.** `DebitTotal` and `CreditTotal` are Eval. `BalancedJournal` is Bind at commit, obligation=system. `user in Finance` is Bind at commit, obligation=authority. `PostJournalEntry` is Action. Posted `LedgerEntry` rows are Events or append-only Types with Event nature. Draft is Type state that Bind refuses to project into trial balance. E-008.

**Inventory.** Movement is Event. On-hand is Eval at projection. Reservation is a Type with Links and Binds, not a Relator sort. Ownership and custody are Links or relationship-objects. Negative qty is Bind with a declared scope. L-INV-07. Valuation Event is not the quantity Event. L-INV-10, issue 21 L11.

**Employment.** Person is Type. Employment is Type with Links to Person and Organization. `Employee` is a Role pattern founded by Employment, not an Interface. Promote is Action on Employment. History is valid time on Employment, not mutation of Person. E-010.

**Approvals.** Propose is an Action stage or a proposal Type. Approve is a later Action. Bind at preview is not Bind at commit. E-012.

**Time.** Event has occurrence time. Employment has a validity interval. Knowledge time is runtime-owned on commit. Not every Type is bitemporal. E-017.

**External effects.** Action invocation records `unknown`. Later carrier Event or lookup Event reconciles. Retry uses the same invocation identity. E-004, E-006, E-024.

### Remaining attacks on M4

1. Fact Class D. Two same-type, same-identity, same-valid-time observations. M4 can store two Events. If consumers need an accepted assertion with its own identity, Fact grows back. Issue 4 law 8.
2. Interface queries. `Priceable` across Kinds may be ugly without a node.
3. Search. Planning and ATP may force a seventh job. Issue 8 R3 already worried.
4. Relator enforcement. If dependence Binds become hidden conventions, M3's Relator sort revives.
5. Event as a sort versus Event as a required nature on some Types. If the engine can refuse mutation from a nature flag, the extra word Event might die. I do not grant that yet. Palantir and Foundry objects mutate by default. The word has to force the other default.

### Verdict

**Decision state:** `hypothesis`.

Smallest core that this pass could not reject. Still smaller than RFC-0001. Still larger than M1 and M2. That is the point of a kill test. The list shrank. It did not collapse to a slogan.

**Falsifier.** A domain in the first four research verticals that needs a seventh sort after Bind, Event, and relationship-object patterns are used in good faith. Or a proof that Event is only a Bind on Type mutability. Or a proof that Fact Class D is common and inexpressible as two Events plus a Decision Action.
