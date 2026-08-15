---
issue: 3
decision_state: hypothesis
kind: explanation
---

# Candidate identity laws

Smallest claims that still fit the evidence in `issue-3-result.md`. Each law names a falsifier. Decision state is never `accepted`.

## L1. A commercial role is not a Kind

**Claim.** Supplier, Customer, Carrier, Shareholder, and Competitor do not supply identity. The same Person or Organization can enter and leave those classifications without becoming a different individual.

**Kind of statement.** Candidate law.

**Evidence.** UFO Role versus Kind (Guizzardi et al. 2022, § on endurant types). ValueFlows Agent versus `is supplier of` on `AgentRelationship`. FIBO IndependentParty versus ContractParty. Odoo one `res.partner`. Scenario S-005.

**Source artifact that looks like a counterexample.** ERPNext Customer and Supplier DocTypes. The Common Party Accounting docs say the two records are kept because module behavior differs, and that Party Link "does not merge the masters."

**Decision state.** `supported` for "not a Kind."

**Falsifier.** A corpus where Supplier identity is independent of any Person or Organization, and where destroying the organization leaves a Supplier that still refers to the same legal party.

**Runtime consequence.** The identity key of an organization must not be the Supplier code. Role membership must be able to start and stop.

## L2. A role is founded by a relationship, not by an Interface

**Claim.** Instantiating Supplier is true because a commercial relationship exists, not because the object implements a shared shape.

**Kind of statement.** Candidate law.

**Evidence.** UFO. Roles instantiate "in the scope of" a relator. ValueFlows. The role is an `AgentRelationshipRole` on an `AgentRelationship`. FIBO. ContractParty is played in a contract. Palantir. Interface "describes the shape of an object type and its capabilities" and does not prescribe a primary key.

**Decision state.** `hypothesis`.

**Falsifier.** A mature operational system where Supplier behavior is complete with only an interface or mixin, and where no mediating contract, account, or relationship record exists.

**Runtime consequence.** Queries of the form "who is a supplier" must be able to name the founding relationship and its validity. An Interface query of the form "who is Priceable" is a different question.

## L3. A relationship earns identity when it is the bearer of attributes, actions, or validity

**Claim.** Use a typed link when the relation is only "A points at B." Use an identifiable relationship-object when the relation has limits, terms, suspension, parties beyond two, or actions aimed at the relation itself.

**Kind of statement.** Candidate law.

**Evidence.** RFC-0001 already states the same threshold. Palantir object-backed links exist specifically to put metadata on the connection. UFO Relator examples are marriage, enrollment, employment, contract. ValueFlows `Agreement` stipulates commitments. ERPNext Supplier hold, payment terms, and scorecard, plus Party Link. Scenario S-006.

**Decision state.** `supported` for the threshold. `undetermined` for a native Relator sort.

**Falsifier.** A domain where those attributes stay correct when stored only as properties of one endpoint, including after the other endpoint is replaced, merged, or split.

**Runtime consequence.** Actions such as SuspendEmployment and HoldSupplier target the relationship-object. Cardinality and exclusivity constraints attach there.

## L4. Interface cannot subsume Role

**Claim.** A shared shape can be an Interface. A contingent, relational classification cannot. Collapsing them loses anti-rigidity, founding dependence, and a single identity principle.

**Kind of statement.** Candidate law.

**Evidence.** Palantir community note that interfaces do not prescribe a primary key, and that `jane.doe@example.com` can be the key of a Contractor and of a Customer. UFO RoleMixin exists because some roles cross Kinds, which is a different problem from shared shape. OS open question 2 asks this directly.

**Decision state.** `supported`.

**Falsifier.** A system that uses only interfaces for Supplier and Customer, keeps one identity per legal party, and still enforces that the party can leave the role without changing identity or colliding keys.

**Runtime consequence.** Do not put Role names in the Interface slot of RFC-0001. `Actor` and `Principal` may still be Interfaces. `Supplier` may not.

## L5. Phase, document status, and relationship hold are three patterns

**Claim.** A Phase is a contingent intrinsic classification of one endurant. A document status is a stored decision or a projection of submit, cancel, and amend events. A hold or suspension is often a phase of the relationship-object.

**Kind of statement.** Candidate law.

**Evidence.** UFO Phase examples are Child, Teenager, hemorrhagic dengue, tenured employment. ERPNext Customer Disabled and Supplier On Hold. ERPNext document submit and cancel. Odoo `active` and document `state`. Constitution rule 8. Requested is not happened.

**Decision state.** `hypothesis`.

**Falsifier.** A single status field that, across two independent corpora, preserves audit, validity time, and role dependence without extra hidden fields.

**Runtime consequence.** Do not add a native Phase category to express Draft. If exclusive intrinsic partitions need engine help, start with a constraint pack on one object, not a new sort.

## L6. Identity is for things that persist through change or that others must cite

**Claim.** A value is equal by its content. An object keeps identity while some properties change. Promote a value to an object only when other objects must cite the same changing thing.

**Kind of statement.** Candidate law.

**Evidence.** UFO quality versus substantial. Palantir property versus object type. Every Palantir object type needs a primary key. ERPNext Address and Contact are cited from many documents and can change under those documents. ValueFlows quantities live on flows. EconomicResource is identifiable.

**Decision state.** `hypothesis`. Address remains contested.

**Falsifier.** A domain where money amounts need lifecycle, merge, and actions of their own, or where a shared Address never needs to be cited independently.

**Runtime consequence.** Equality, hashing, and merge apply to objects. Values copy. If Address is an object, an address edit is an Action with provenance. If it is a value, a new value replaces the old one on the party.

## L7. Record merge, legal succession, and identifier correction are different actions

**Claim.** Combining two records that always named one party is not the same as one legal entity succeeding another, and not the same as changing a surrogate key.

**Kind of statement.** Candidate law.

**Evidence.** Odoo merge is irreversible and chooses a destination contact. Palantir primary-key change deletes edits. ERPNext Party Link is explicitly not a merge. UFO Kind change is loss of the individual. Constitution rule 11. Provenance is part of meaning.

**Decision state.** `hypothesis`.

**Falsifier.** A system that uses one merge operator for all three and still answers "what did we believe then" and "who is liable now" without extra out-of-band notes.

**Runtime consequence.** Three named actions, each writing different provenance. Entity-resolution issues should consume this law rather than invent a fourth operator.

## L8. Events do not change. Endurants do.

**Claim.** An occurrence can have parts and can be superseded by a later correction. It cannot be edited in place while remaining the same occurrence.

**Kind of statement.** Candidate law. Restates the thesis Action versus Event split in UFO terms.

**Evidence.** UFO-B. Perdurants "only exist in the past" and "cannot be the subject of change." ValueFlows EconomicEvent is "something observed, never some potential future event." OS thesis. Action may fail or remain unknown.

**Decision state.** `supported` as a research lean. Not an engine specification.

**Falsifier.** A corpus where correcting an observed event by mutating its fields is the only way to preserve audit, and where a superseding event creates legal or operational falsehoods.

**Runtime consequence.** Correction is a new fact or event plus a derivation link. Not an update-in-place of the occurrence.

## Composition recommendation

**Claim.** Role, Relator, and Phase can be composed from ObjectType, Interface, constrained relationships, validity, and actions. Native engine categories are not earned yet.

**Kind of statement.** Candidate law about the engine, not about the world.

**Evidence.** Constitution rule 1. Prefer composition when meaning and enforcement survive. Palantir already composes object-backed links from an ordinary object type plus two many-to-one links. The missing piece in Palantir is enforcement. UFO's extra categories earn their keep as modeling checks, not as a second storage engine.

**Decision state.** `hypothesis`.

**Falsifier.** See the runtime pressure list in `issue-3-result.md`. If ordinary objects plus constraints cannot refuse two Kinds, keep Role out of the identity key, target relationship-objects with actions, and distinguish the three merge actions, then a native category is back on the table.

**Runtime consequence.** Wave B runtime work should implement the four enforcement points, not a Role opcode.
