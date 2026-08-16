---
issue: 27
kind: explanation
fetched: 2026-08-16
decision_state: hypothesis
---

# Candidate CRM laws

Smallest claims that still fit the evidence. Each law names a falsifier. Decision state is never `accepted`.

These are domain laws. They are not RFC-0001 edits. Issue 14 owns party identity. Issue 16 owns offer to order. Issue 3 owns whether Role and Relator become engine categories.

## L1. A Lead is not a party Kind

**Claim.** Lead names qualification work or a marketing staging record. It does not supply the identity of a Person or Organization. The same party can have zero, one, or many Lead records over time.

**Kind.** Candidate law.

**Evidence.** E1, E2, E6, E10, E31. Issue 14 L1 and L6.

**Source artifact that looks like a counterexample.** Salesforce Lead that is consumed into Account and Contact. That is a product conversion, not proof that the person began existing at convert.

**Decision state.** `supported` for "not a Kind." `undetermined` for whether Lead is a phase, a relator, or only a work record.

**Falsifier.** A corpus where deleting the only Lead must delete the legal person, and where that collapse still preserves employment, tax, and prior invoices.

**Runtime consequence.** Qualify and Convert are Actions that may create or select a party and a relationship. They must not treat Lead id as party id.

## L2. Contact means and billed party are different

**Claim.** The human addressed on email, phone, or WhatsApp is a Person in a communication role. The billed or entitled party is a Party in a customer relationship. One person can represent many parties. One party can have many people.

**Kind.** Candidate law.

**Evidence.** E2, E7, E10, E15, E28, E31.

**Decision state.** `supported`.

**Falsifier.** A corpus where deleting the only contact must delete the customer, and where portal or WhatsApp identity is the customer identity after the person changes employer. See `scenarios.md` S12 and S05.

**Runtime consequence.** Inbound routing proposes a Person link. Entitlement and credit check the relationship. Issue 14 already states this. CRM must not reopen it as a new party model.

## L3. An Opportunity is pursued potential, not an accepted order

**Claim.** Opportunity, Deal, or qualified pursuit records expected value, probability, stage, and next action. Acceptance produces a later offer or order. Many pursuits can exist for one party. Lost is a recorded outcome.

**Kind.** Candidate law.

**Evidence.** E3, E6, E10, E24, E25.

**Decision state.** `supported`.

**Falsifier.** A mature order-to-cash system where the Opportunity record is the legally accepted order, and where changing probability after shipment still leaves fulfillment and claims coherent.

**Runtime consequence.** Pipeline stage changes are not Ship or Invoice. Issue 16 owns Quotation, Sales Order, and commitment. This folder must not define those Actions.

## L4. A support work item is not a message

**Claim.** Case, Ticket, or Issue is work that needs a resolution. Messages, calls, and delivery statuses are observations attached to that work or to a party. Many messages can belong to one work item. One message can propose opening a work item.

**Kind.** Candidate law.

**Evidence.** E4, E8, E14, E15, E18, E20.

**Decision state.** `supported`.

**Falsifier.** A production CRM where the email or WhatsApp message id is the case id, and where a later status webhook for the same message can legally close financial or entitlement consequences without a separate resolution Action.

**Runtime consequence.** Ingestion stores observations. Opening a case is an Action. See L10.

## L5. Case, Incident, and Service Request are not yet proven to be one Kind

**Claim.** CRM products usually keep one work record. ITIL splits Incident, Service Request, and Problem. This folder does not pick a winner.

**Kind.** Candidate law, stated as a non-collapse.

**Evidence.** E4, E8, E14, E17.

**Decision state.** `undetermined`.

**Falsifier for collapse.** An independent operational corpus where password resets and outages share one lifecycle, one entitlement rule, and one resolution meaning without hidden type fields.

**Falsifier for split.** A CRM corpus where a single work record plus a classification property never forces contradictory clocks, assignment, or problem-linkage.

**Runtime consequence.** Do not add Incident as an engine primitive from this issue alone. Do not forbid a later domain type either.

## L6. Eligibility and clock compose. They are not the same concept

**Claim.** Entitlement answers whether this party, asset, or named caller may receive a kind of support, sometimes with a remaining count. SLA answers how soon a metric must be fulfilled in working time. A clock can exist without a rich entitlement object. An entitlement can exist without milestones.

**Kind.** Candidate law.

**Evidence.** E5, E9, E11, E14, E16, E28, E29.

**Decision state.** `supported` for the conceptual split. `hypothesis` that both must be first-class in OS.

**Falsifier.** A source family where eligibility, remaining counts, named callers, and response deadlines are one object with no independent failure modes.

**Runtime consequence.** "Customer has Gold support" is not a due timestamp. "First reply in four business hours" is not a named-caller list.

## L7. Pause is a property of a metric, not of a ticket

**Claim.** There is no single paused bit that all service clocks obey. Waiting on the customer, waiting on a third party, holidays, and solved-but-not-closed change different metrics differently.

**Kind.** Candidate law.

**Evidence.** E5, E9, E16.

**Decision state.** `supported`.

**Falsifier.** A first-party SLA product where every published metric shares one pause predicate and still matches Zendesk first-reply plus requester-wait behavior.

**Runtime consequence.** Clock evaluation takes metric kind, status category, public versus internal comment, and calendar. A generic `paused` field on Case is a source artifact.

## L8. Resolved is an agent claim. Closed is a later decision

**Claim.** Agent belief that a solution exists is not the same fact as the work item being finished. Customer acknowledgment, customer close, agent close, and timeout are different ways to finish. A later customer message can reopen.

**Kind.** Candidate law.

**Evidence.** E4, E13, E16, E22.

**Decision state.** `supported` for the split in ERPNext and Zendesk. `hypothesis` as a universal law, because Odoo official docs close by folded stage and do not define native reopen.

**Falsifier.** A support corpus where a single Closed status is set only by the agent, never reopened, and still reports first-close versus last-close and customer-disputed resolutions without extra records.

**Runtime consequence.** ProposeResolution, AcceptResolution, Close, and Reopen are different Actions. Timeout Close is a policy Action, not a silent field update.

## L9. Reopen does not unhappen the first close

**Claim.** Reopen adds a new phase. History of the first resolution remains. Some clocks reset. Some clocks continue. Some clocks treat solved time as a pause. The source chooses per metric.

**Kind.** Candidate law.

**Evidence.** E4, E13, E16.

**Decision state.** `supported` that reopen is not delete. `undetermined` for a single reopen clock rule.

**Falsifier.** A system that deletes the first resolution on reopen and can still answer "when did we first believe it was solved" and "how long until last close."

**Runtime consequence.** Metrics must name whether they reset, continue, or pause across reopen. ERPNext Resolution Time resets. Zendesk total resolution continues from creation.

## L10. Unstructured communication may propose Actions. It does not commit them

**Claim.** A parser, agent, or human may draft Close, Reopen, ConvertToOpportunity, Refund, or Escalate from a message. Commit still requires authority, current state, and provenance. Two messages can propose contradictory Actions and both remain stored.

**Kind.** Candidate law.

**Evidence.** E18, E30, E32. Constitution sections 8, 9, and 11. `docs/open-questions.md` questions 4 and 10.

**Decision state.** `supported` as a standing OS rule applied to CRM channels. `hypothesis` for the proposal record shape. This folder does not design that shape.

**Falsifier.** A channel where the provider's delivered or read receipt is accepted as the customer's legal agreement to a resolution, and where that is correct under audit.

**Runtime consequence.** Ingestion is fail-open for storage of observations and fail-closed for mutation of operational state. See S16, S17, S27.

## L11. Sentiment is an observation

**Claim.** Anger, CSAT, or a model score can be attached to a conversation or work item. It does not set status, entitlement, or priority by itself.

**Kind.** Candidate law.

**Evidence.** E13, E30.

**Decision state.** `hypothesis`. First-party CRM pages fetched here barely define sentiment.

**Falsifier.** A regulated support process where the official case status is the latest sentiment label and that is still auditable.

**Runtime consequence.** Policy may use sentiment as an input to propose escalate. The escalate Action still has an actor.

## L12. Assignment allocates work. It does not own the relationship

**Claim.** Queue, user, and automatic balance can change while the customer relationship and the work-item identity stay the same. Time Off and workload are assignment inputs.

**Kind.** Candidate law.

**Evidence.** E8, E23.

**Decision state.** `hypothesis`.

**Falsifier.** A CRM where changing assignee must create a new customer or a new case, and where that is required for audit.

**Runtime consequence.** Assign is an Action on the work item. Transfer of relationship ownership is a different Action on the relationship.

## L13. Escalation changes authority or priority on the same work item

**Claim.** Escalation is not, by default, a new case. It records that the current work now requires a different queue, role, or priority.

**Kind.** Candidate law.

**Evidence.** E5 priority-as-escalate, E12 `IsEscalated`, E13 business hours on escalation rules.

**Decision state.** `hypothesis`.

**Falsifier.** A first-party case product where every escalation creates a new case id and the original case is never the object of later resolution.

**Runtime consequence.** Escalate cites the work item. Opening a related problem or major-incident record is a different Action. ITIL Problem remains `undetermined` as a required Kind. See L5.

## L14. Duplicate contact means do not prove one pursuit or one case

**Claim.** Same email or phone is a reason to propose merge. It is not proof of one person, one deal, or one incident. Different people at one organization often must remain distinct. Merge of records is irreversible in Odoo and is not legal succession.

**Kind.** Candidate law.

**Evidence.** E7, E31. Issue 14 L5.

**Decision state.** `supported` for "similar ≠ same." `hypothesis` for merge operators in CRM.

**Falsifier.** A source that auto-merges on email with no false-positive family, including shared inboxes and two contacts at one domain.

**Runtime consequence.** Dedup emits a proposed merge. A human or a high-assurance rule commits. Lost-and-active merge that reactivates a pursuit must be explicit. See S01, S02, S03.

## L15. A work item is usually scoped to one operating company

**Claim.** The customer party may span legal entities. The case, ticket, or opportunity is typically owned by one Company or team. Routing to the wrong company is a real failure.

**Kind.** Candidate law.

**Evidence.** E19. Issue 14 L2.

**Decision state.** `hypothesis`.

**Falsifier.** A multi-entity ERP where one case record is the operational object for two legal entities' support obligations at once, without a child work item, and where books and entitlement still post correctly.

**Runtime consequence.** Multi-company customer scenarios must name both the party and the operating scope. See S05, S30.
