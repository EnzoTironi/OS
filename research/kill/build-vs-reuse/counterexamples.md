# Counterexamples

**Kind:** counterexample.  
**Decision:** per card.

These cards attack the candidate laws and the reuse-as-core alternatives. A card that lands weakens a law. A card that fails supports the law.

## X-001. A distinction that only exists as a DocType

**Attacks.** L-001.  
**Decision.** does not land on current evidence.

If lot recall, three-way match, or close-versus-cancel could be stated only by importing ERPNext DocTypes, the semantic core would have to be that schema. Sibling issue 32 treats those as domain laws that can be restated. REA, ValueFlows, and ISA-95 exist as independent vocabularies. Until a distinction has no restatement, L-001 holds.

## X-002. TigerBeetle cannot post without owning accounts

**Attacks.** L-002.  
**Decision.** hypothesis. does not yet kill physical reuse.

TigerBeetle requires `debit_account_id`, `credit_account_id`, `ledger`, and `code` on every transfer. If those identifiers must be TigerBeetle's meaning, L-002 forbids the reuse. If they are opaque ids minted by OS Functions, the engine is still a worker. The live question is whether a two-account transfer can express a multi-line journal without becoming a second book. Sibling issue 58 already allows composing transfers. This session did not prove that composition preserves OS journal identity.

## X-003. Read-only ERP as a projection

**Attacks.** L-003.  
**Decision.** does not land against L-003. it is the allowed exception.

A warehouse or ERP that OS never writes, used only to ingest observations, is not a second posting authority. Ontologiq is this shape. It still fails as a core because it cannot be the system of record for a greenfield OS. L-003 survives. A3 still loses.

## X-004. Historical Actions pin engine execution ids

**Attacks.** L-004.  
**Decision.** hypothesis.

S-012 asks whether an old discount can be explained under the ontology revision that ran then. If the pin is an OS content hash, Temporal or Cedar can be replaced. If the pin is `WorkflowType:ShipOrderV3` or a Cedar policy id with no OS digest, replaceability is gone. This is a design trap, not current code.

## X-005. Skip-on-error is inseparable from Cedar

**Attacks.** L-005 and Cedar-as-worker.  
**Decision.** does not land.

The authorization page specifies skip-on-error and says the application can read diagnostics and choose another decision. OS can wrap Cedar and Deny on any error. The property is specified, not hidden. Adaptation is required. The class "PARC evaluator with default deny" remains reusable.

## X-006. An existing platform already is the executable ontology

**Attacks.** L-006 and the whole kill test.  
**Decision.** does not land. issue 68 branch was missing this session.

The inspected open runtimes share objects, links, and actions. None of them jointly provide Action versus Event versus unknown Effect, bitemporal explanation, fail-closed policy, posted-history laws, and a license OS can take as a core. Palantir is the mature closed reference and is cite-only. If issue 68 later shows a platform that does all of that, redo this ranking.

## X-007. Temporal Entity Workflow is already an operational ontology

**Attacks.** R-004.  
**Decision.** fails.

The first-party page models orders as Workflows with Signals as mutations. That is a process runtime holding object state. It does not distinguish requested, promised, planned, and actual. It does not give valid time versus known time. It retries Activities. Scenario S-004 loses. R-004 stands.

## X-008. H1 is good enough because AGI can keep two models in sync

**Attacks.** A6 and L-003.  
**Decision.** fails.

Thesis and constitution assume AGI reduces implementation cost. They do not assume two authorities stay aligned. Dual-write of Product and Order is the failure H1 already recorded. AGI making the sync cheaper does not make the fork semantically correct. A stale ERP submit and a stale ontology Action are still two meanings.

## X-009. Build-everything A2 is safer because dependencies cannot fork meaning

**Attacks.** A1.  
**Decision.** does not land as a quality win.

A2 avoids license and version risk. It does not improve Action versus Event. It spends capacity on replay and policy evaluation that already have specified interfaces. Question 21 rejects that spend unless the interface cannot be wrapped. X-005 shows Cedar can be wrapped. Temporal can be wrapped if Workflow Types never become OS types. A1 stays ahead.

## Scenario pressure

| Scenario | Reuse-as-core that breaks | Why |
| --- | --- | --- |
| S-003 stale approval | Open Foundry, ObjectStack, Temporal Activity without a proposal record | Approval of a world, not of hashed arguments. Ontologiq is the donor, not the core |
| S-004 unknown effect | Open Foundry, Temporal retries, Frappe `on_submit` side effects | Timeout becomes fail or retry. Local commit already happened |
| S-007 backdated stock | Ontologiq live state, Frappe current row, Temporal Workflow variables | Valid time versus known time is missing or is an ad hoc field |
| S-010 cancel after posting | Generic graph store, XTDB `ERASE`, any CRUD core | History must gain compensating facts, not disappear |
| S-012 ontology revision | Temporal Workflow versioning as the only pin | Engine version is not ontology revision |
