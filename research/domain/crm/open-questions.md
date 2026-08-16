---
issue: 27
kind: reference
fetched: 2026-08-16
decision_state: undetermined
---

# Open questions

Residual uncertainty after this pass. None of these answers `docs/open-questions.md`. When a repo question is adjacent, this file cites it and leaves it open.

Kind of every item: open question. Decision state of every item: `undetermined` unless a narrower state is written.

## Q1. Is Lead a phase of a party, a work record, or a consumed staging object?

**Why it is open.** Salesforce consumes Lead into Account and Contact. ERPNext keeps Lead and can raise later Opportunities against the Customer. Odoo can turn the Lead gate off. E1, E6, E10.

**Adjacent repo question.** `docs/open-questions.md` question 12, relationship-entities. Issue 14 L1 already says Customer is not a Kind.

**What would close it.** Independent first-party sources that agree on whether the person exists before convert, and whether a leftover Lead id is ever the party id.

**Must not invent.** A target Lead type.

## Q2. Must OS native-split Case, Incident, Service Request, and Problem?

**Why it is open.** CRM products use one work record. ITIL splits practices. Dynamics uses "incident" in everyday English. E14, E17, L5, S29.

**Standing order.** Lead-versus-party and case-versus-incident stay `undetermined` unless independent first-party sources agree.

**What would close it.** A later corpus pass that shows contradictory clocks, entitlements, or cause-linkage when the four share one Kind, or that shows the split is only ITSM vocabulary.

## Q3. Is Entitlement a required concept, or can SLA policy conditions replace it?

**Why it is open.** Salesforce and Dynamics document eligibility objects. ERPNext, Odoo, and Zendesk attach clocks to customer, team, tags, or ticket fields. E5, E9, E11, L6.

**What would close it.** A multi-source pass on named callers, per-incident remaining counts, and asset-based support that cannot be expressed as SLA conditions.

## Q4. Which actor may close, and is customer close authoritative?

**Why it is open.** ERPNext Resolved waits for acknowledgment. Odoo can let customers close. Timeout close exists in both ERPNext and Odoo. E4, E22, S11, S12.

**Adjacent repo question.** `docs/open-questions.md` question 4, what an Action is, and question 11, actors and principals.

**What would close it.** Evidence that one close actor is always sufficient, or that close is always a pair of agent claim plus customer claim.

## Q5. What is the one reopen rule for clocks?

**Why it is open.** ERPNext resets Resolution Time on reopen. Zendesk reply metrics start new targets. Work and wait reactivate remaining time. Total resolution continues from creation. E4, E16, L9, S10.

**What would close it.** A proof that one rule covers all published metrics, or a decision that metric definitions must stay domain data.

## Q6. Does converting support work into a pursuit end the support work?

**Why it is open.** Odoo archives the ticket. HubSpot associates ticket and deal. E21, S09.

**Cross-link.** Issue 16 owns the pursuit-to-order side after convert.

## Q7. How should channel identity relate to Person?

**Why it is open.** WhatsApp `wa_id`, email address, and phone are used for merge and routing. They are also shared inboxes and survive employer change. E7, E18, S01, S06.

**Cross-link.** Issue 14 L8, contact means are citeable. This folder does not rewrite that law.

## Q8. Is escalation sticky?

**Why it is open.** Salesforce `IsEscalated` exists. The Case narrative page was empty this session. Community pages disagree and are not first-party. E12, L13.

**What would close it.** A first-party Case or escalation-rule page that states whether de-escalation exists.

## Q9. Is sentiment in the CRM core?

**Why it is open.** The issue asked for sentiment as observation. Fetched first-party pages only show CSAT as a dashboard measure. L11 is `hypothesis`.

**What would close it.** First-party docs that store sentiment on the conversation or case and use it in policy.

## Q10. What is the proposal object for message-to-Action?

**Why it is open.** L10 is `supported` as a rule and `hypothesis` for shape. Dynamics release-plan pages show agents drafting case fields. That is a source artifact.

**Adjacent repo question.** `docs/open-questions.md` questions 4, 5, and 10. This folder does not answer them.

**Must not invent.** A schema for Proposal, Preview, or Effect.

## Q11. Moqui, Frappe CRM, and Palantir CRM cells

**Why it is open.** Not fetched. Matrix cells that depend on them are `undetermined`.

**What would close it.** A later pass. Do not wait on corpus PRs, but do not fill the cells from memory.

## Q12. Per-incident remaining count versus reopen

**Why it is open.** Salesforce decrements `RemainingCases` on case create. Reopen consumption was not fetched. E29, S23.

## Questions this folder refuses to close

The following `docs/open-questions.md` items were touched only as citations:

- Question 3, disagreeing sources. See S16 and E30.
- Question 4, Action preview and commit. See L10 and S19.
- Question 5, unknown external outcome. See S18.
- Question 6, status as stored decision versus projection. See lifecycle section 3.
- Question 8, provenance. See L10 and E18.
- Question 10, what an agent may propose versus commit. See L10 and S27.
- Question 12, relationship-entities. See L1 and L3.

If a synthesis agent needs an answer, it must cite a later artifact or leave the question `undetermined`.
