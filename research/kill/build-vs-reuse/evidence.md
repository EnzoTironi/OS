# Evidence

**Status:** labeled notes, 2026-08-16.  
**Decision:** none.

Interpretation is not the source. Each block names its kind.

## E-001. The stated objective forbids effort-minimizing reuse

**Kind:** domain evidence inside this repo's research rules.  
**Decision:** supported as a description of the rules. undetermined as a product pick.  
**Source:** `docs/constitution.md` §5, `docs/thesis.md` "AGI changes the optimization target", `docs/open-questions.md` question 21, issue 61 body.

Constitution §5 says a worse semantic model must not be chosen because a framework saves implementation effort. Thesis says a large implementation is acceptable if it protects a cleaner model. Question 21 says reuse is justified when it preserves or improves the best semantics, and that reimplementing solved infrastructure with no semantic benefit is not.

**Interpretation.** The kill test cannot be won by counting lines. A reuse that forces DocType, Workflow, or relationship-tuple meaning into the core fails even if it ships faster.

## E-002. Earlier architectures already tried reuse-as-core and were weakened

**Kind:** source-system artifact of OS hypothesis history.  
**Decision:** supported as history.  
**Source:** `docs/hypothesis-history.md` H0 through H4.

H0 treated ERPNext as the product. Rejected as top-level framing. H1 put an operational ontology over ERP transactions and kept two authorities for Product, Order, Action, and permissions. Weakened as the ideal greenfield. H3 would extend Frappe with first-class links, actions, and provenance. Rejected as an assumed foundation because it inherits schema, storage, and lifecycle. H4 is the leading research hypothesis. The executable ontology is the primary system.

**Interpretation.** Issue 61 is not a new temptation. The project already walked the reuse path and dropped it as the meaning authority.

## E-003. Frappe makes Document the unit of meaning

**Kind:** source-system artifact.  
**Decision:** supported.  
**Source:** [Controllers](https://docs.frappe.io/framework/user/en/basics/doctypes/controllers), fetched 2026-08-16.

A Controller extends `frappe.model.Document`. The base class loads values from the database, parses them, and saves them back. A Document "usually maps to a single row in the database table." Lifecycle hooks are insert, save, submit, cancel, and update after submit. `on_change` also runs when `db_set` is performed and the docs say that work should be idempotent.

**Interpretation.** Mutation is a document lifecycle, not a named business Action. Submit and cancel are closer to verbs than generic save. They are still hooks on a row. Adopting Frappe as the core forces DocType, `docstatus`, and form-shaped objects into the ontology.

## E-004. ERPNext production use forced posted-history laws

**Kind:** domain evidence, reported by sibling corpus.  
**Decision:** supported inside the sibling scope. not a foundation proposal.  
**Source:** `git show origin/cursor/issue-32-corpus-cfd8:research/erpnext/invariants.md` cards INV-DOC-01 through INV-LEDGER-02. Do not copy that file.

The sibling cards claim a submitted document cannot return to draft, amend replaces a cancelled document rather than reviving it, close is not cancel, downstream posted work blocks cancel, ledger rows are not independently cancellable, and cancel of a posted voucher adds compensating ledger facts.

**Interpretation.** Those distinctions are why ERPNext is a corpus. They are not a reason to inherit `docstatus` integers or DocType names. Constitution §2 forbids mapping a source table to an ontology type.

## E-005. ERPNext reuse is a copyleft event. Frappe reuse is a separate decision

**Kind:** source-system artifact.  
**Decision:** supported as license facts.  
**Source:** `git show origin/cursor/issue-69-ops-cfd8:research/licensing/corpus-license-register.md`.

ERPNext code is GNU GPL v3. Default extraction is concept and behavior. Reuse class is `copyleft-link-needs-decision`. Frappe Framework is MIT. Reuse class is `permissive-reuse-needs-decision`. The register says it does not answer whether OS should build from scratch. That question is question 21.

**Interpretation.** Even a semantically perfect ERPNext fork would need an explicit linking decision. Semantic quality already fails E-003 and E-004. License is a second, independent stop.

## E-006. Moqui treats Service as the main unit of logic

**Kind:** source-system artifact.  
**Decision:** supported.  
**Source:** [Service Definition](https://www.moqui.org/m/docs/framework/Logic+and+Services/Service+Definition), fetched 2026-08-16.

The page says the main unit of logic is the service. Services are transactional, authenticated, authorized, and validated. A name is path, verb, and optional noun. The example `mantle.party.PartyServices.create#Person` writes Party, Person, and optional PartyRole. Implicit and entity-auto CRUD exist. SECA rules can trigger other services at phases of execution.

**Interpretation.** Named verbs are closer to RFC-0001 Action than Frappe save. The facade still invents create, update, and delete from an entity. Adopting Moqui as the core makes Entity, Service, Screen, XML Actions, and SECA the metamodel.

## E-007. Moqui implicit CRUD is not Action-like

**Kind:** source-system artifact, sibling classification.  
**Decision:** supported as a classification of Moqui, not of OS.  
**Source:** `git show origin/cursor/issue-34-corpus-cfd8:research/moqui/service-action-pattern-catalog.md`.

The sibling catalog marks implicit entity CRUD and `type="entity-auto"` as not Action-like. It marks `place#Order`, `pack#Shipment`, and `authorize#Payment` as closest. It marks EECA on entity write as not Action-like. Official docs, per that catalog, say not to use EECA for process.

**Interpretation.** A service-oriented framework can still hide business verbs behind table writes. Reuse of Moqui does not automatically give OS a clean Action primitive.

## E-008. Open Foundry commits local objects, then fires side effects

**Kind:** source-system artifact and counterexample.  
**Decision:** supported as a description of the inspected executor.  
**Source:** sibling `origin/cursor/issue-36-corpus-cfd8:research/operational-runtimes/evidence.md` E-005, pinned `syzygyhack/open-foundry` `f29bcb9ed819` `packages/actions/src/executor/action-executor.ts`. This session did not re-open that file.

Order reported there: validate, permission, optional consent, CEL preconditions, apply effects and commit, then run side effects. Compensation is a second transaction. A lost webhook is a failed side effect, not an unknown outcome.

**Interpretation.** The object-link-action vocabulary is cheap. The commit-then-notify order fails scenario S-004. Adopting this runtime as the core imports that order.

## E-009. Ontologiq records lost I/O as unknown and revalidates after approval

**Kind:** source-system artifact.  
**Decision:** supported as a description of that runtime.  
**Source:** sibling issue 36 evidence E-001 through E-004, pinned `ontologiq/ontologiq` `5a087250f5ee`.

The sibling notes say `propose` stores a hashed proposal, MCP cannot approve, `execute_approved` re-runs evaluation on live data, and outcomes include `executed`, `effect_failed`, and `unknown`. After bytes leave the process, a missing response is `unknown` and the note says do not retry. `state` is a live CASE over source columns. History is deferred.

**Interpretation.** The protocol matches S-003 and S-004 better than any other inspected open runtime. The product still refuses to own writes and has no valid-time store. Adopting it as the core forces warehouse-as-truth.

## E-010. ObjectStack can elevate past caller authority inside a shared Action

**Kind:** source-system artifact and counterexample.  
**Decision:** supported as reported by sibling issue 36.  
**Source:** sibling issue 36 README and steal-improve-reject. ObjectStack docs `content/docs/permissions/system-context.mdx` at `716ac9bf8f74`.

The sibling finding is that `script` and `body` actions pass an invoke-time gate, then run trusted engine calls that skip caller row-level security. Sharing an Action name is not enough for human and agent parity.

**Interpretation.** ObjectStack is evidence for "one Action, many surfaces." It is a warning against treating that slogan as a safety property. Adopting it as the core imports trusted-script elevation.

## E-011. Temporal Workflows must be deterministic. Activities may run more than once

**Kind:** source-system artifact.  
**Decision:** supported.  
**Source:** [Workflows](https://docs.temporal.io/workflows), [Understanding Temporal](https://docs.temporal.io/evaluate/understanding-temporal), and [Activity Definition](https://docs.temporal.io/activity-definition), fetched 2026-08-16.

Temporal reconstructs Workflow state by replaying code against Event History. Workflow code must emit the same Commands given the same history. Network calls, database queries, and LLM calls belong in Activities. Activities are retried. The Activity definition page says Temporal guarantees an Activity is observed as completed exactly once when retries are allowed, and that the Activity may execute multiple times and may partially complete more than once.

**Interpretation.** This is a durability machine. It is not an ontology. If OS stores business meaning as Workflow code, ontology revision becomes Workflow versioning, and "unknown external outcome" becomes "keep retrying."

## E-012. Temporal Event History is a replay log, not an OS Event

**Kind:** source-system artifact.  
**Decision:** supported.  
**Source:** same Temporal pages as E-011. Entity Workflow pattern at [entity-workflow](https://docs.temporal.io/design-patterns/entity-workflow).

Event History records TimerStarted, Activity scheduled, Activity completed, Signal received. The Entity Workflow pattern models a user, account, or order as a long-lived Workflow whose variables are the entity state. The page says that pattern is a poor fit for entities that only need CRUD, and a poor fit above about 100 updates per second per entity.

**Interpretation.** Temporal "Event" is a platform command journal. RFC-0001 Event is an occurrence in the modeled world. Collapsing them creates a second vocabulary that looks similar and means something else. Entity Workflow makes the process runtime the object store.

## E-013. Cedar decides Allow or Deny from principal, action, resource, and context

**Kind:** source-system artifact.  
**Decision:** supported.  
**Source:** [What is Cedar?](https://docs.cedarpolicy.com/) and [How Cedar authorization works](https://docs.cedarpolicy.com/auth/authorization.html), fetched 2026-08-16.

A request is PARC. Policies are separate from application code. Schema validates policies when they are written. Schema is not used when evaluating a request. Combination rules:

1. Any satisfied `forbid` yields `Deny`.
2. Else any satisfied `permit` yields `Allow`.
3. Else `Deny`.

Named properties: default deny, forbid overrides permit, skip on error. Skip on error means an erroneous policy does not factor into the decision. The page says deny-on-error was considered and rejected because a new broken policy could start denying all requests.

**Interpretation.** PARC matches the RFC-0001 Policy sketch. Default deny and forbid-wins are close to fail-closed authority. Skip-on-error is not fail-closed. Cedar also does not own business objects. The application must supply entities. That is a clean boundary if OS remains the entity authority. It is a leak if Cedar entities become a second graph of Employment and Ownership.

## E-014. OpenFGA stores relationship tuples as authorization facts

**Kind:** source-system artifact.  
**Decision:** supported.  
**Source:** [Concepts](https://openfga.dev/docs/concepts), fetched 2026-08-16.

A check asks whether a relationship exists between a user and an object. An authorization model plus stored tuples answer that question. A tuple is user, relation, object, and an optional condition. Direct and implied relationships are different. The Read API returns stored tuples and does not traverse the model.

**Interpretation.** OpenFGA is a relationship store with a check API. If OS already has Relationships, Relators, and Facts, writing Employment into OpenFGA as well creates a second source of meaning. Using OpenFGA as a projection of OS relationships is a different design and stays `hypothesis`.

## E-015. XTDB gives every row system time and valid time. Valid time is row validity

**Kind:** source-system artifact.  
**Decision:** supported.  
**Source:** [Time in XTDB](https://docs.xtdb.com/about/time-in-xtdb.html) and [SQL Quickstart](https://docs.xtdb.com/quickstart/sql-overview.html), fetched 2026-08-16.

Every table has `_system_from`, `_system_to`, `_valid_from`, and `_valid_to`. Default queries look like an atemporal database. `FOR VALID_TIME` and `FOR SYSTEM_TIME` recover history. The quickstart says valid-time "is specifically about the validity (or 'effective from' time) of a given row in the table, and not necessarily some other domain conception of time (unless you carefully model it 1:1)." `ERASE` hard-deletes history after commit. License file is MPL-2.0.

**Interpretation.** This is the strongest public bitemporal store in the candidate list. It does not give OS Fact, provenance, contradictory claims, or Action pinning. Treating XTDB rows as the metamodel collapses requested, promised, planned, and actual into whichever columns the row happens to have. `ERASE` can destroy the audit the thesis wants unless OS forbids it.

## E-016. TigerBeetle enforces immutable double-entry transfers in the database

**Kind:** source-system artifact.  
**Decision:** supported as a description of the docs. reuse grant `undetermined` until LICENSE is opened.  
**Source:** [Transfer](https://docs.tigerbeetle.com/reference/transfer/) and [Debit/Credit](https://docs.tigerbeetle.com/concepts/debit-credit/), fetched 2026-08-16.

A transfer is an immutable record between two accounts. Transfers are never modified once created. There is at most one transfer with a particular `id`. A pending transfer resolves at most once. Reversals are new transfers. The debit-credit page says the schema of OLTP is built into the data model. `code` "should map to an enum or table of all the possible business events." A transfer has exactly one debit and one credit.

**Interpretation.** Immutability and refuse-closed balance are hard to recreate as a correct production store. The schema is also a second chart of accounts. If OS Functions and Constraints already state debit equals credit, TigerBeetle may evaluate that law. It must not invent accounts or event codes the ontology cannot see. Sibling issue 58 L-K-01 and L-K-03 say the same cut.

## E-017. Specialized physical engines are allowed. Semantic kernels are not

**Kind:** candidate law already argued on a sibling kill test.  
**Decision:** supported as a cross-link, not re-proved here.  
**Source:** `git show origin/cursor/issue-58-kill-cfd8:research/kill/specialized-kernels/candidate-laws.md` L-K-01, L-K-02, L-K-12.

Those laws say business meaning stays in the ontology, semantic specialization is not physical specialization, and a specialized store is allowed only if it cannot become a second authority.

**Interpretation.** Issue 61 is the same cut applied to whole products. ERPNext as core is a semantic kernel. Temporal as a durability worker is a physical engine. Cedar as an Allow or Deny evaluator can be physical if OS supplies PARC from ontology Actions.

## E-018. Graphs, RDF, and temporal stores are not an operational ontology

**Kind:** domain evidence stated on this branch.  
**Decision:** supported as a claim already recorded on this branch.  
**Source:** `research/reference-landscape.md` section "What is not a substitute for an operational ontology by itself."

That document says knowledge graphs, graph databases, semantic search, RAG memory, vector stores, RDF or OWL engines, and temporal databases do not automatically provide business identity, executable actions, authority, invariants, real-world effects, and reconciliation.

**Interpretation.** Reusing TypeDB, Neo4j, or an RDF stack as the OS core would optimize storage shape. Constitution §6 says those mechanics are not ontology concepts.

## E-019. Cedar skip-on-error can authorize a request after a broken forbid is ignored

**Kind:** counterexample to "Cedar is already the OS Policy primitive."  
**Decision:** supported as a Cedar property. undetermined as an OS wrapper policy.  
**Source:** E-013 authorization algorithm, property 3.

If a `forbid` policy errors, it is skipped. A matching `permit` can then yield `Allow`. The designer rationale is availability. OS constitution §9 and the Policy hypothesis in RFC-0001 want fail-closed enforcement.

**Interpretation.** Reuse of Cedar is still plausible if OS treats any evaluation error as Deny, or if OS never loads a policy that fails schema and runtime checks. The engine as shipped does not give that. Adaptation is required.

## E-020. Shared object-link-action vocabulary is already commodity

**Kind:** domain evidence across independent products.  
**Decision:** supported.  
**Source:** `research/reference-landscape.md`, sibling issue 36 README, RFC-0001 candidate forms.

Palantir, Open Foundry, ObjectStack, Ontologiq, and Moqui independently treat a business mutation as a named operation over typed objects. Issue 36 calls the shared vocabulary cheap and the hard part "what happens after someone says yes."

**Interpretation.** Reusing one of those products to obtain Objects, Links, and Actions buys little unique semantics. The remaining gaps are authority, stale approval, unknown effects, time, provenance, and posted-history laws. Those gaps are exactly the OS research program.
