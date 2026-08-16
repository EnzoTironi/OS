---
issue: 51
kind: reference
fetched: 2026-08-16
decision_state: hypothesis
---

# Evidence

Labeled observations. Kind is tagged on each block. Decision state is never `accepted`.

A source system's documented behavior is a source-system artifact until two independent families agree on the distinction. Then it may become domain evidence. A generated scenario that would break a law is a counterexample even if no engine exists yet.

## E1. Happy paths do not test an ontology

**Kind.** domain evidence  
**Decision state.** `supported`  
**Claim.** Constitution rule 13 and `scenarios/README.md` already require partial completion, late data, concurrency, and other adversarial cases. Issue 51 is the method that generates those cases instead of writing them by hand.

**Citation.** `docs/constitution.md` rule 13. `docs/research-program.md` Semantic fuzzing. `scenarios/README.md` principles. S-ISSUE-51.

**Observation.** The seed suite has twelve cards. Domain siblings already added dozens more by hand. The issue asks for generators across named dimensions, not another static list.

**Limits.** Hand cards remain useful seeds. Generators need them as level-7 models in McKeeman's sense.

## E2. Properties need generators and an oracle

**Kind.** source-system artifact of the testing literature, used as method evidence  
**Decision state.** `supported`  
**Claim.** Claessen and Hughes test properties on random inputs. The human supplies a checkable criterion. Custom generators are first-class.

**Citation.** S-QC. ICFP 2000 abstract and later surveys that restate the loop.

**Observation.** A candidate law is the property. A scenario generator is the input strategy. Without an oracle, a generated case cannot fail.

**Limits.** QuickCheck targeted pure Haskell functions. Enterprise actions have external effects and unknown outcomes. Constitution rule 9.

## E3. Type-based shrink can change the error

**Kind.** source-system artifact  
**Decision state.** `supported`  
**Claim.** If shrink ignores how a value was generated, a failing even-integer case can shrink to an odd integer and fail a different assertion.

**Citation.** S-HYPO-INT. Even-number example. "classic shrinkers are fuzzers problem."

**Observation.** A business generator that only emits balanced journals, or only emits lot-tracked issues against reserved lots, must shrink inside those constraints. Otherwise the minimized case is a different ontology question.

**Limits.** The page argues for property-based libraries. The same validity problem applies to scenario shrink.

## E4. Internal reduction keeps generated validity

**Kind.** source-system artifact  
**Decision state.** `supported`  
**Claim.** Hypothesis shrinks the choice sequence and re-runs the generator. The reduced case is one the generator could have produced. MacIver and Donaldson call this internal test-case reduction and contrast it with external `ddmin` on the concrete artifact.

**Citation.** S-HYPO-RED, abstract and section 1. Shortlex order on the choice sequence.

**Observation.** For OS research, the generator should own quantity bounds, identity grains, and action legality. Shrink then deletes or lowers choices. It does not rewrite a scenario into an illegal world.

**Limits.** Internal reduction quality is not claimed to beat C-Reduce on C. The paper's advantage is validity, not size.

## E5. External minimize still has a role

**Kind.** source-system artifact  
**Decision state.** `hypothesis`  
**Claim.** Zeller and Hildebrandt's `ddmin` produces a 1-minimal failing input. `dd` isolates the difference from a passing case. McKeeman also requires shortening a random test before a human looks at it.

**Citation.** S-DD, abstract and `ddmin` / `dd`. S-DIFF, "Test Reduction" and the third issue on noise.

**Observation.** After internal shrink, a second pass can drop whole timeline steps that the choice sequence still includes, if the generator allows empty regions. Isolation against a passing neighbor tells a researcher which dimension actually broke the law.

**Limits.** External shrink on a YAML dump will reintroduce E3 unless each deletion is re-validated by the generator or by the same legality predicates.

## E6. The oracle problem is the normal case

**Kind.** domain evidence  
**Decision state.** `supported`  
**Claim.** Chen et al. state that many programs have no feasible oracle for a single input. Metamorphic testing checks a relation across several inputs and outputs.

**Citation.** S-MT, section 1. Oracle problem and metamorphic relations.

**Observation.** "What is the correct stock after this backdated receipt" often has no unique number until valuation method, negative-stock policy, and period freeze are named. A better check is a relation. Example. Inserting a receipt valid on day 8, known on day 12, must change "stock as believed now for day 10" and must not change "stock as known on day 10." Seed S-007.

**Limits.** A metamorphic relation is a necessary property. It can miss faults that preserve the relation. Chen et al. say this.

## E7. Differential oracles find disagreement, not truth

**Kind.** candidate law supported by method evidence  
**Decision state.** `supported`  
**Claim.** McKeeman feeds the same generated case to comparable systems. A difference is a candidate bug. He also says two results can differ and both be allowed, and that majority-per-million is a quality metric the losing author may still refute.

**Citation.** S-DIFF, Differential Testing section and false-positive issue. Table of compiler differences.

**Observation.** ERPNext cancel-and-reverse versus Odoo reverse-transfer-plus-credit-note is a disagreement about surfaces. It is not proof that either encoding is the domain law. Issue 51 already forbids treating source behavior as correct semantics.

**Limits.** Differential testing still needs a third reader. Constitution rule 4. Induction L-IND-06 types the disagreement.

## E8. Competency questions evaluate, they do not invent primitives

**Kind.** domain evidence  
**Decision state.** `supported`  
**Claim.** Gruninger and Fox start from motivating scenarios, write informal competency questions, then formalize them. The questions evaluate ontological commitments. They do not generate those commitments.

**Citation.** S-CQ, sections 1 and 2, and the paragraph that begins "These competency questions do not generate ontological commitments."

**Observation.** Semantic coverage for this issue is the fraction of competency questions a candidate fragment can answer after a generated attack, plus the distinctions the attack kept independent. It is not statement coverage of a runtime.

**Limits.** TOVE used first-order logic and completeness theorems. Wave A has neither a formal language nor an engine. Informal questions still work as coverage cells.

## E9. ERPNext cancel keeps history and may repost later stock

**Kind.** source-system artifact  
**Decision state.** `supported` as ERPNext behavior. `hypothesis` as a domain law  
**Claim.** A cancelled posting document keeps original ledger rows and adds opposite rows. Deleting the cancelled document is blocked when ledger rows exist. A permitted backdated stock transaction can create a Repost Item Valuation job. Closed periods can block cancel, amend, or repost.

**Citation.** S-ERPN-IMM. S-ERPN-LED. S-ERPN-REP. S-ERPN-ACC.

**Observation.** Posting Date is the valid-time-like accounting period. Creation and submission can differ. That is a source encoding of constitution rule 10, not a proof that every fact must carry both times.

**Limits.** Docs updated 2026-07-30 and 2026-08-14. Behavior depends on Stock Settings, negative stock, serials, and freeze. Do not treat "always allowed" or "always blocked" as the ERPNext rule.

## E10. Odoo return after done is a new transfer, not an in-place cancel

**Kind.** source-system artifact  
**Decision state.** `supported` as Odoo Sales 19 documented path  
**Claim.** After a validated delivery, Return opens a Reverse Transfer. After invoice, reverse transfer is not enough. A credit note is required because validated invoices cannot be changed.

**Citation.** S-ODOO-RET, Before invoicing and After invoicing.

**Observation.** Sibling o2c S-O2C-07 records the same split. ERPNext cancel-when-links-permit versus Odoo return-plus-credit is divergence about the verb, not about whether history stays.

**Limits.** Inventory 18 return pages 404'd this session. Barcode `CANCEL` applies before validate. Do not cite marketplace cancel-done modules as official Odoo.

## E11. ValueFlows splits rights, custody, and location

**Kind.** domain evidence  
**Decision state.** `supported`  
**Claim.** `transferAllRights` moves rights without custody. `transferCustody` moves possession without rights. `move` changes location without changing agent rights or custodianship. `raise` and `lower` are adjustments when the real action is unknown.

**Citation.** S-VF-ACT, those action definitions. S-VF-CORE, Knowledge, Plan, Observation.

**Observation.** A generator that only mutates one party field on a quantity cannot express consignment, loan, or FOB-in-transit. Sibling inventory L-INV-01 and L-INV-13 already state this. The fuzzer must emit the three actions as independent choices.

**Limits.** ValueFlows is a model, not a production ERP. Observation-layer events are not proof of accounting recognition.

## E12. EPCIS events carry five dimensions and separate transformation from aggregation

**Kind.** domain evidence  
**Decision state.** `supported`  
**Claim.** EPCIS 2.0 names Object, Aggregation, Transaction, and Transformation events. Each event has what, when, where, why, and how. Quantity lists exist on class-level identification. `Action` on an aggregation says add, delete, or observe, and is independent of `bizStep`.

**Citation.** S-EPCIS, sections 7.2.2, 7.3.2, 7.4.2 through 7.4.5.

**Observation.** A generator that only posts "stock moved" cannot attack lot recall or pack-and-unpack. Sibling inventory L-INV-11. Seed S-008.

**Limits.** EPCIS is a visibility standard. It is not an inventory valuation engine.

## E13. Provenance is a first-class handle for contradictory observations

**Kind.** domain evidence  
**Decision state.** `hypothesis` as OS vocabulary. `supported` that PROV distinguishes Entity, Activity, and Agent  
**Claim.** PROV-O starting point classes are Entity, Activity, and Agent. Activities use and generate entities. Agents bear responsibility.

**Citation.** S-PROV, Starting Point category. Seed S-011. `docs/open-questions.md` item 3.

**Observation.** A fuzzer that overwrites a promised date when a chat arrives has already collapsed the question. The scenario must keep three claims and their agents.

**Limits.** RFC-0001 has not adopted PROV terms. This folder does not add them.

## E14. Stale approval is already a seed and a vendor pattern

**Kind.** domain evidence  
**Decision state.** `supported` as a required attack. `hypothesis` as the exact revalidation rule  
**Claim.** Seed S-003 approves a purchase after a receipt has already changed the assumption. `research/reference-landscape.md` records Ontologiq as propose, approve, re-read, execute.

**Citation.** S-SCEN S-003. S-LAND Ontologiq paragraph. `docs/open-questions.md` item 4.

**Observation.** An adversarial-agent generator must be able to change the world between proposal and commit. That is not a special Agent primitive. It is interleaving.

**Limits.** Ontologiq is early. Palantir public docs were not re-fetched as an approval protocol this session.

## E15. Induction already typed contradictions and forbade intrinsic promotion

**Kind.** research artifact  
**Decision state.** `supported` as sibling protocol. Not re-validated here  
**Claim.** Issue 50 requires typed disagreements, a human promotion gate, and a ban on intrinsic self-correction as the way a law becomes `supported`.

**Citation.** `origin/cursor/issue-50-agi-cfd8:research/agi/induction/candidate-laws.md` L-IND-04, L-IND-05, L-IND-06, L-IND-07. `protocol.md` contradiction types.

**Observation.** A fuzz failure that is only "ERPNext said X, Odoo said Y" is unfinished. The next step is homonym, collapsed modality, genuine conflict, implementation accident, or missing corpus.

**Limits.** This folder does not rerun the induction benchmark.

## E16. No engine means no executable suite this wave

**Kind.** runtime consequence  
**Decision state.** `supported` as a stop rule  
**Claim.** Standing order 7 parks Wave B runtime and toolchain. Issue 51 allows a scenario schema as research. It forbids designing a target engine and forbids implementing a fuzzer.

**Citation.** S-ISSUE-51. `docs/research-program.md` exit criteria. Standing orders 7 and 15.

**Observation.** Success for this issue is queryable cards, generators described as recipes, metrics that do not need a process, and a shrink process that names E3 through E5. "It compiles" is not a criterion.

**Limits.** A later Wave B note may execute the schema. That note is not this one.
