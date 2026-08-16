---
issue: 3
decision_state: hypothesis
kind: reference
---

# Counterexamples

Twelve cases that try to break the laws in `candidate-laws.md`. A useful counterexample names the law, the move that should break it, and what we actually observed. None of these closes the issue.

## CX-001. One organization, five roles

**Attacks.** L1, L2.

**Move.** Treat Supplier, Customer, Carrier, Shareholder, and Competitor as five Kinds. Create five objects. Ask what happens when the Company number stays the same.

**Observed.** Scenario S-005. ERPNext needs two masters plus Party Link and still cannot put carrier, shareholder, and competitor on that link. Odoo keeps one partner. ValueFlows keeps one Agent and many `AgentRelationship` rows. UFO forbids two Kinds.

**Result.** L1 holds. The ERPNext split is a source artifact.

## CX-002. Employment changes position and stays itself

**Attacks.** L3, L5.

**Move.** Model `worksFor` as a link with a position property. Promote the person in March, change pay in May, suspend in June, terminate in July. Ask which object the Promote action targets.

**Observed.** Scenario S-006. UFO Employment is a relator that can itself have phases such as tenured. Palantir would want an object-backed link. ERPNext and Odoo both give Employee its own record, linked to a person-like party.

**Result.** L3 holds. The employment record is the relationship-object. Position change is not a new Person.

## CX-003. Supplier relationship with contracts, limits, validity, and hold

**Attacks.** L3, L1.

**Move.** Store credit limit, payment terms, hold type, release date, and scorecard on the Organization Kind. End the supply relationship. Ask whether the organization still exists and whether the old limit is still true.

**Observed.** ERPNext puts those fields on the Supplier master and can set On Hold indefinitely. The legal party, if it is also a Customer, still exists as a second master. ValueFlows would put terms on an `Agreement` and the role on an `AgentRelationship`.

**Result.** Limits belong on the relationship-object. Putting them on Supplier-as-Kind is why ERPNext then needs Party Link.

## CX-004. Interface-as-Supplier key collision

**Attacks.** L4.

**Move.** Make `Supplier` and `Customer` Interfaces. Give each implementer its own primary key. Ingest a contractor and a customer that both use `jane.doe@example.com` as the key.

**Observed.** Palantir community modeling note. Interfaces do not prescribe a primary key. Overlapping keys across object types are a documented hazard.

**Result.** L4 holds. Shared shape is not shared identity.

## CX-005. Draft invoice as a Phase of the Customer

**Attacks.** L5.

**Move.** Classify the Customer as Draft while its first invoice is unsaved. Submit the invoice. Ask whether the Customer changed Kind or Phase.

**Observed.** ERPNext Customer is saved, not submitted. Draft lives on the sales document. UFO Phase examples are intrinsic conditions of one endurant, not document control.

**Result.** Document Draft is not a Phase of the party. L5 holds for this case.

## CX-006. Adult as a stored status field

**Attacks.** L5 from the other side.

**Move.** Treat Adult as a boolean on Person, updated by a nightly job. Backdate a birth date. Ask what the system believed last year.

**Observed.** UFO Child and Adult are phases defined by an intrinsic condition. OS open question 6 asks whether status is a stored decision or a function of other facts. Constitution rule 10 asks for valid time and known time.

**Result.** A stored boolean loses the derivation. Adult should be a derived predicate or a phase partition over birth date and valid time. This does not yet force a native Phase category.

## CX-007. Address as a value, then reused

**Attacks.** L6.

**Move.** Store address as a value on the party. Two suppliers share a warehouse gate. The gate's street number changes. Ask how many records must be edited and whether old invoices reprint the new gate.

**Observed.** ERPNext makes Address a DocType with Dynamic Links so many parties can share it. The Customer doc warns that sales documents fetch the primary address and that edits can surprise later prints.

**Result.** Shared, changing locations lean toward object identity. A one-off billing line on one invoice can stay a value. L6 stays `hypothesis`.

## CX-008. Money as an object

**Attacks.** L6 from the other side.

**Move.** Give every `100.00 USD` instance an identity. Merge two invoices. Ask whether the amounts must be merged as records.

**Observed.** No corpus in this set treats a currency amount as an identifiable master. Amounts sit on documents, moves, and flows. UFO treats such things as qualities projected into a value space.

**Result.** Money stays a value. If a later payments issue finds an amount-with-lifecycle, revisit L6.

## CX-009. Odoo contact merge of a customer who is also a vendor

**Attacks.** L7, L1.

**Move.** Two `res.partner` rows, both with positive customer and supplier ranks, one with journal items. Merge them. Ask whether the destination is a legal succession or a duplicate cleanup.

**Observed.** Odoo merge is irreversible. Dedup can exclude partners that already have journal items. Ranks are not role objects, so the merge cannot say "keep the supplier relationship, drop the mistaken customer duplicate."

**Result.** L7 is needed. One merge button cannot carry legal meaning. This is also why ranks are a weak Role encoding.

## CX-010. Palantir primary-key rewrite

**Attacks.** L7.

**Move.** An employee ID was wrong. Change the primary key. Expect history to follow the person.

**Observed.** Palantir docs. Edits are permanently attached to the primary key. Changing it prompts deletion of existing edits. Non-deterministic keys also drop links.

**Result.** Identifier correction is not merge and not succession. If OS binds history to a surrogate the way Palantir binds edits to a primary key, correction will destroy audit.

## CX-011. ERPNext Party Link as identity

**Attacks.** L3, L7.

**Move.** Treat Party Link as the real party identity. Expect one General Ledger filter for the combined party.

**Observed.** Common Party Accounting FAQ. Party Link does not merge masters. Customer and Supplier remain different party types. The generated Journal Entry offsets ledgers. Combined presentation needs a custom report.

**Result.** Party Link is a relationship-object for a narrow accounting workflow. It is not the Kind. L3 holds. L7 holds.

## CX-012. Employee as both receivable and payable

**Attacks.** L1, L2.

**Move.** Make Employee a Kind because payroll, advances, and expense claims need a master. Then ask whether the same human can also be a Customer.

**Observed.** ERPNext Party Type includes Employee. PR 49079 exists because Employee advances are receivable and salary is payable. Odoo keeps `hr.employee` distinct from `res.partner` and links them with `work_contact_id`. Duplicating an employee without `copy=False` on that link caused two employees to share one contact and overwrite each other's email (commit ea96e51).

**Result.** Employee is a role or a relator, not a Kind. The human can still be a Customer. The Odoo bug is what happens when the relationship-object and the party share identity by accident.

## Adversarial case from the issue, restated

One organization is supplier, customer, carrier, shareholder, and competitor. Employment changes position while employment identity stays. The supplier relationship has contracts, limits, validity, suspension, and actions.

CX-001, CX-002, and CX-003 are that case split so each law can fail on its own. None of the three required a native Role, Relator, or Phase category. All three required a Person or Organization Kind, a relationship-object with identity, and role membership that is not the identity key.
