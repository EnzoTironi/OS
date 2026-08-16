# Wave A adversarial review ledger

**Branch role:** `research-corpus` is evidentiary. Landing a PR here preserves research; it does **not** accept its candidate laws, architecture, primitive list, or runtime conclusions.

**Reviewer:** integration/adversarial review pass started 2026-08-16.

## Status vocabulary

- `raw-evidence-ok` — source observations are useful enough to preserve; inferential claims may still be challenged below.
- `challenged` — one or more material semantic/inferential claims must not be consumed as settled evidence.
- `blocked-factual` — a factual/version/source error must be corrected before the artifact can be treated as reliable source archaeology.
- `blocked-deliverable` — the issue's required deliverable is materially incomplete.
- `review-clean` — adversarial findings were incorporated or represented as explicit disagreements; still not an accepted OS decision.

When this ledger conflicts with a candidate-law verdict inside a landed Wave A artifact, synthesis must treat the claim as **challenged/undetermined** until a linked resolution record closes the disagreement.

## Global findings from the first adversarial pass

1. **Source behavior is not a universal domain law.** `ERPNext/Odoo/Palantir does X` is evidence; generalization requires independent convergence or a narrower scope.
2. **Document/record is not automatically occurrence.** Keep business occurrence, observation/assertion, decision, projection, and source-system document distinct until evidence justifies collapse.
3. **Semantic distinction is not automatically a kernel primitive.** A distinction can survive while its encoding remains compositional.
4. **Enforcement requirement is not a storage sort.** Runtime enforcement, metamodel identity, and physical representation must be tested separately.
5. **System/transaction time is not automatically organizational knowledge time.** Preserve the competency question without assuming a field layout.
6. **Approval revalidation uses the decision's declared state/temporal basis.** `Always reread current world` is too strong; frozen-snapshot commitments are legitimate in some domains.
7. **Ambiguous external I/O must not be lied about.** But safe retry with the same idempotency contract can be correct; `retry is always a new decision` is too strong.
8. **Replication is not independent authority.** Materialized/read replicas can be safe; the semantic failure is untracked competing ownership or loss of provenance.
9. **Failure to prove a primitive is not rejection.** Use `undetermined/not-promoted` rather than rewriting an unearned candidate as falsified.
10. **A failed kill test does not prove the opposite thesis.** Preserve open design space.

## PR ledger

| PR | Issue | Topic | Review status | Material review finding |
|---|---:|---|---|---|
| #84 | #74 | swarm result contract | `challenged` | Real-shard cardinality vs empty sentinel needs explicit rule; evidence taxonomy must handle formal/academic sources; coordinate status semantics with #141. |
| #85 | #32 | ERPNext corpus | `raw-evidence-ok` | Corpus is valuable; semantic atlas claims must remain inference unless `corpus.md`/pinned code or docs support them. |
| #86 | #3 | identity/role/relator | `challenged` | UFO/OntoUML distinctions are donors, not automatically OS runtime kinds; native Relator/Role semantics remain open. |
| #87 | #69 | clean-room boundaries | `challenged` | Process guidance is useful; legal/licensing conclusions must remain scoped and implementation reuse decisions explicit. |
| #88 | #34 | Moqui/Mantle corpus | `raw-evidence-ok` | Entity/Service/Screen and Mantle are source architecture; do not promote them to OS primitives. |
| #89 | #35 | Palantir corpus | `raw-evidence-ok` | Palantir is benchmark evidence, not proof of RFC-0001; current docs must be rechecked for fast-moving capabilities. |
| #90 | #7 | Action/Event/Effect | `challenged` | Strong distinction, but a separate `Effect` base primitive is not yet earned; retry/reconcile and observation/outcome cardinality remain open. |
| #91 | #37 | formal ontologies | `challenged` | Formal ontology axioms and operational enforcement are different evidence classes; UFO/REA/FIBO/PROV must not become OS axioms by elegance. |
| #92 | #33 | Odoo corpus | `blocked-factual` | Mixed Odoo generations and an ERPNext comparison against a different branch/generation can manufacture false divergence; pin comparable versions. |
| #93 | #4 | facts/claims/authority | `challenged` | Correct modeling dissolves many apparent conflicts; authority is action/purpose/context scoped, not necessarily a canonical truth store. |
| #94 | #8 | logic forms | `challenged` | `Function/Constraint/Policy` reduction must distinguish pure evaluation from fail-closed enforcement and authority semantics. |
| #95 | #6 | provenance | `challenged` | Provenance vocabulary is useful; do not require exact historical code execution when reproducibility can be satisfied by pinned definitions/evidence. |
| #96 | #5 | temporal | `challenged` | Valid/occurrence/record/system/knowledge times are distinct; no universal bitemporal row/default was established. |
| #97 | #9 | ontology revision | `challenged` | Historical explanation needs definition identity/semantics; replaying old executable code is not universally required. |
| #98 | #36 | operational runtimes | `raw-evidence-ok` | Capability classifications are useful if `implemented/declared/absent/undetermined` remain source-scoped, not product verdicts. |
| #99 | #10 | process/workflow | `challenged` | Studied cases do not require Workflow as a base sort; that does not universally falsify workflow/process semantics. |
| #100 | #12 | state/projections | `challenged` | Reconstructability is a competency requirement in some domains; pure event sourcing is not implied, and not every current state is fully replay-derived. |
| #101 | #11 | principals/delegation | `challenged` | Actor, delegator, principal, workload and task grant must remain separable; `SoftwareAgent as Party` remains hypothesis. |
| #102 | #13 | query/sets/interfaces | `challenged` | Query capabilities can be required without making Set/Interface a base primitive; query-language choice remains toolchain. |
| #103 | #62 | values | `challenged` | Money/unit/time distinctions are strong; reciprocal FX and rounding/measurement semantics must be scoped, not universalized. |
| #104 | #38 | standards | `raw-evidence-ok` | EPCIS/ISA-95/interchange are evidence/adapters, not OS vocabulary. |
| #105 | #14 | party/roles | `challenged` | `LegalPerson` is not automatically a third disjoint Kind; Site is not synonymous with OperatingUnit; customer/supplier role pressure is strong. |
| #106 | #15 | product identity | `challenged` | Specification/SKU/instance/lot/serial distinctions are useful; ownership, packaging and handling-unit identity remain context-specific. |
| #107 | #16 | order-to-cash | `challenged` | Offer/commitment/fulfillment/claim/settlement split is strong; ERP documents and verbs like Cancel/Close are not universal entities/actions. |
| #108 | #17 | procure-to-pay | `challenged` | Demand/sourcing/commitment/receipt/claim/settlement need layer discipline; document/event and ownership/custody transitions must remain explicit. |
| #109 | #18 | inventory | `challenged` | Quantity kinds/reservation/custody/ownership distinctions are strong; ledger/projected/current-state semantics must not be collapsed. |
| #110 | #19 | manufacturing | `challenged` | Specification/authorization/plan/execution/observation must stay distinct; WIP/status/documents are not automatically ontology kinds. |
| #111 | #20 | logistics | `challenged` | Shipment/package/custody/delivery/return distinctions are useful; title, custody, possession, carrier state and visibility events must not collapse. |
| #112 | #21 | accounting | `challenged` | Journal/posting/ledger/reversal are strong domain semantics; accounting occurrence vs representation and period-close encoding remain open. |
| #113 | #22 | finance/payments | `challenged` | Payment instruction/authorization/capture/settlement/bank observation/posting/allocation are distinct; avoid one overloaded Payment object. |
| #114 | #23 | pricing | `challenged` | List/offer/transaction/competitor-observed price and effectivity are distinct; avoid a universal single Price object. |
| #115 | #24 | planning | `challenged` | Forecast/demand/MRP/capacity/schedule are distinct; MRP cannot be reduced to one simplified formula. |
| #116 | #25 | quality | `challenged` | Specification/measurement/inspection/disposition/nonconformance are distinct; regulatory claims need source precision. |
| #117 | #28 | HR | `challenged` | Person ≠ Employment ≠ Position/Post/Assignment ≠ Contract; Employee-as-kind is weak, but encoding remains open. |
| #118 | #27 | CRM/support | `challenged` | Communication endpoint ≠ Party ≠ customer/entitled party; opportunity/case/SLA/process semantics must remain scoped. |
| #119 | #26 | assets/maintenance | `challenged` | Financial asset ≠ functional role/location ≠ installed serial device; maintenance plan/occurrence/execution and failure/diagnosis/repair need separation. |
| #120 | #29 | projects/services | `challenged` | Dependency types/conditions are richer than terminal predecessor; fixed-price cost/consideration law requires amendment scope. |
| #121 | #31 | multi-entity | `challenged` | Legal personality, tax establishment/registration, operating unit, brand and reporting scope are separate dimensions; intercompany event cardinality is not universal. |
| #122 | #30 | Brazil fiscal | `blocked-factual` | Update against current compiled 2026 law; scope DF-e mechanics; distinguish 2026 test-year fields from normal economic incidence; tax determinism requires legal inputs/interpretation fixed. |
| #123 | #67 | GRC | `challenged` | Exceptions/SOD/limits have multiple consequence patterns; Workflow/policy-engine choices are not falsified by this domain pass. |
| #125 | #50 | ontology induction | `challenged` | Independent-source multiplicity is evidence strength, not universal truth gate; benchmark is replay/circular until blinded/fresh-corpus and #77 tests. |
| #126 | #55 | unified ontology kill | `challenged` | Evidence rejects an unscoped overloaded global vocabulary; it does not yet prove federated context ontologies over scoped modules/interfaces. |
| #127 | #73 | unknown unknowns | `challenged` | Continuous performance/IBNR/erasure pressures are valuable; do not collapse probabilistic liability with external-effect `unknown`. |
| #128 | #51 | semantic fuzzing | `blocked-deliverable` | Issue explicitly requires reusable generators; PR incorrectly says generator implementation is out of scope. Add generator/harness or leave issue incomplete. |
| #129 | #56 | primitive reduction | `challenged` | Six-sort proposal conflates semantic distinction, metamodel identity, enforcement and storage; Event/Link/Action/Relator/Property irreducibility not yet proved. |
| #130 | #57 | Action-only mutation kill | `challenged` | Named business Actions govern OS-authoritative decisions, but are not universal persistence API; observations do not automatically append business Events. |
| #131 | #58 | specialized kernels | `challenged` | Semantic second authorities are weak; specialized physical mechanisms may be useful, but external authorities and generic enforcement complicate the proposed boundary. |
| #132 | #59 | Fact/bitemporal kill | `challenged` | Reject universal semantic bitemporal rectangle, but system time ≠ knowledge time; temporal versioning vs business reversal are different; physical history can remain pervasive. |
| #133 | #60 | authority kill | `challenged` | Several alleged irreducible conflicts are actually different observations/times/decisions/projections; resolution need not always be a Decision Action. |
| #134 | #61 | build vs reuse | `challenged` | Separate semantic ownership from implementation reuse; architecture ranking is premature; mechanisms have semantics and need compatible explicit contracts, not semantic emptiness. |
| #135 | #68 | existing-platform kill | `challenged` | Re-score against competency scenarios, not thesis primitives; Palantir capability/history/multi-source claims need current-doc corrections; absence of proof is not proof no platform can host the contract. |
| #136 | #76 | information gain | `challenged` | Dated queue snapshot is already superseded; #77 data exists outside repo; kill verdicts under review must not become scheduling truth. |
| #137 | #72 | semantic duplication | `challenged` | Replication/materialization ≠ independent authority; choose placement per statement/SLO; external legal authority ≠ OS cannot own durable evidence/representation. |
| #138 | #78 | literature watch | `challenged` | Update A2A to current 1.0; RDF 1.2 maturity; OCEL/AuthZEN findings are useful but do not imply primitives; unevaluated projects are not negative evidence. |
| #139 | #79 | cross-industry stress | `challenged` | Breaks ERP defaults, but three cuts do not prove industry generality; occurrence/observation/decision and standing right/commitment need finer separation. |
| #140 | #81 | failure archive | `blocked-factual` | Converts assumption-withdrawn/not-promoted hypotheses (H1/H2 Pack/Compiler/Kernel) into `rejected`; draft sibling kill verdicts cannot be archived as fact. |
| #141 | #82 | decision discipline | `challenged` | Separate artifact kind, epistemic state, evidence status, experiment result and governance adoption; `accepted decision` must not be forced into a Wave-A truth verdict. |
| #142 | #83 | leakage audit | `challenged` | Domain invariants like balanced journal must not leak into engine as generic duties; distinguish generic enforcement facility from domain law; draft sibling verdicts are not findings. |

## Integration rule

Wave A artifacts may land in `research-corpus` while `challenged` **only as preserved research**, provided this ledger is present and synthesis/index tooling propagates the challenge. `blocked-factual` and `blocked-deliverable` artifacts should not be treated as reliable/complete until fixed. Nothing in this branch is normative for `main` unless separately promoted by an explicit decision/governance PR.
