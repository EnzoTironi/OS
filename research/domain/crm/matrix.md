---
issue: 27
kind: reference
fetched: 2026-08-16
decision_state: hypothesis
---

# Convergence and divergence

The goal is evidence of semantic agreement or disagreement. This is not a feature matrix. Cells are `yes`, `no`, `partial`, or `undetermined`.

Kind of this file: reference. Decision state of the matrix: `hypothesis`.

## Legend

- `yes` means the source documents the distinction.
- `partial` means a nearby concept exists or the source mixes two cuts.
- `no` means the source documents the opposite or omits the cut on a page that should have mentioned it.
- `undetermined` means this session did not fetch a first-party page that settles the cell.

## Concept matrix

| Distinction | ERPNext | Odoo 18 | Salesforce | Dynamics 365 | HubSpot | Zendesk | ITIL 4 | WhatsApp API |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Lead as pre-qualification record | yes | yes, optional | yes, consumed on convert | undetermined | yes, separate object id `0-136` | no | no | no |
| Contact person ≠ billed party | yes | partial, partner model not re-fetched | yes, Contact vs Account | partial, customer on case | yes, ticket to contact and company | undetermined | no | no, `wa_id` is a channel identity |
| Customer as role vs Kind | partial, Customer DocType | undetermined here, see issue 14 | partial, Account is the company record | undetermined | partial, Company object | undetermined | no | no |
| Many opportunities per party | yes | yes | yes | undetermined | yes, Deal associated to ticket | no | no | no |
| Opportunity ≠ accepted order | yes, Quotation and Sales Order sit later | yes, quotation is a later step | yes, Opportunity is the deal | undetermined | yes, Deal ≠ Ticket | no | no | no |
| Pipeline stage as process label | yes, Sales Stage | yes, CRM and Helpdesk stages | undetermined | yes, business process flow | yes, `hs_pipeline_stage` | partial, status categories | no | no |
| Activity or message ≠ work item | yes, thread on Issue or Lead | yes, chatter | yes, activities move on convert | yes, Activity vs Case | yes, Conversation vs Ticket | yes, comments vs ticket | yes, call vs incident | yes, message vs business record |
| Case or ticket as work needing resolution | yes, Issue | yes, Ticket | yes, Case | yes, Case | yes, Ticket | yes, Ticket | partial, Incident or Request | no |
| Incident ≠ service request | no on Issue page | no on Helpdesk page | no on fetched Case pages | partial, "incident of service" used loosely | no | undetermined | yes | no |
| Problem as cause of many incidents | no | no | undetermined | undetermined | no | undetermined | yes | no |
| Entitlement as eligibility | no, SLA binds customer or group | no, SLA criteria include customer | yes | yes, support contract | undetermined | partial, policy conditions | partial, agreed service | no |
| SLA as response or resolve clock | yes | yes, reach-stage clock | yes, entitlement process and milestones | yes | undetermined | yes | yes, service level management named | no |
| Pause is metric-specific | partial, pause-on-status for the Issue SLA | partial, excluding stages | undetermined | undetermined | undetermined | yes | undetermined | no |
| Holiday or business hours bound the clock | yes | yes, working hours | yes | undetermined | undetermined | yes | undetermined | no |
| Resolved ≠ Closed | yes | partial, folded stage is closed, customer close is separate | yes, CaseStatus.IsClosed | undetermined | partial, pipeline until closed | yes, Solved vs Closed | undetermined | no |
| Customer reply reopens | yes | undetermined in official close docs | undetermined | undetermined | undetermined | yes, reopen effects documented | undetermined | no |
| Assignment ≠ relationship owner | partial | yes, auto-assign plus Time Off | undetermined | yes, queue and routing | undetermined | undetermined | yes, support team vs user | no |
| Internal note ≠ public reply | yes | undetermined | undetermined | undetermined | undetermined | yes | undetermined | no |
| Sentiment as observation | no | no | partial, CSAT by channel on a dashboard | undetermined | undetermined | undetermined | no | no |
| Message status ≠ message content | n/a | n/a | n/a | n/a | n/a | n/a | n/a | yes |
| Merge of similar CRM records | undetermined | yes, irreversible | yes, lead merge mentioned on Trailhead | undetermined | undetermined | undetermined | no | no |
| Ticket convertible to opportunity | undetermined | yes, archives ticket | undetermined | undetermined | yes, ticket to deal association | no | no | no |
| Multi-company scope on the work item | yes, Issue Company | yes, team Company | undetermined | undetermined | undetermined | undetermined | no | no |

## Source artifacts that must not become OS types

| Source artifact | Why it is an artifact | Domain cut it is trying to express |
| --- | --- | --- |
| ERPNext Lead, Opportunity, Issue, SLA DocTypes | Product records. CRM module itself is scheduled for removal | Qualification, pursuit, support work, clock |
| ERPNext Service Level DocType removal in v13 | Rename | Same clock |
| Odoo `crm.lead` used for both lead and opportunity | One table, two pipeline gates | Qualification versus pursuit |
| Odoo Folded in Kanban | UI flag that also means closed | Closing stage |
| Odoo Data Cleaning app required to merge tickets | Product packaging | Duplicate work items |
| Salesforce Lead consumed on convert | Product lifecycle | Qualification complete |
| Salesforce `SlaProcessId` on Entitlement | Foreign key | Clock attached to eligibility |
| Salesforce `IsPerIncident` | Field name uses "incident" for case count | Consumption of entitled cases |
| HubSpot numeric pipeline ids | Storage handles | Stage as process label |
| Zendesk custom status versus status category | Display versus clock category | Phase versus label |
| WhatsApp `statuses` webhook | Channel delivery report | Observation of send outcome |
| Dynamics phrase "incident of service" | Everyday English | Work item needing an answer |

## Convergence that survives the artifacts

1. A person you talk to is not automatically the commercial party. E2, E10, E15, E31.
2. A pursued deal is not an accepted order. E3, E10. Issue 16 owns the order side.
3. Support work is a record that needs a resolution, and many such records can exist for one customer. E4, E8, E14, E15.
4. Communication is attached to work. It is not the work. E4, E15, E18, E20.
5. Some clock measures response or resolution against working time. E5, E9, E13, E16.
6. Closedness is a classification of status, and reopen is common enough to force first-close versus last-close metrics. E4, E13, E16.
7. Duplicate detection uses contact means and still needs a human decision. E7.

## Divergence that must not be averaged away

1. **Is Lead a staging object that dies on convert, or a prospect that remains?** Salesforce consumes the Lead. ERPNext keeps it and can create later Opportunities against the Customer. Odoo makes the whole Lead step optional. Decision state: `undetermined`.
2. **Is entitlement a first-class eligibility object?** Salesforce and Dynamics say yes. ERPNext, Odoo, and Zendesk attach clocks more directly to customer, team, or ticket conditions. Decision state: `hypothesis` that eligibility and clock can compose.
3. **What does pause mean?** ERPNext pauses the Issue SLA on listed statuses. Odoo excludes stages from a reach-stage clock. Zendesk pauses only some metrics. Decision state: `supported` that one boolean pause is false.
4. **Does customer reply reopen by default?** ERPNext yes. Odoo official close docs do not define a native reopen. Zendesk documents reopen effects. Decision state: `undetermined` as a universal law.
5. **Are Case, Incident, and Request one Kind?** CRM products use one work record. ITIL splits practices. Decision state: `undetermined`.
6. **Does converting a ticket to an opportunity end the support work?** Odoo archives the ticket. HubSpot associates ticket and deal without saying the ticket ends. Decision state: `undetermined`.

## Mapping from issue words to source words

| Issue word | Closest source words | Do not silently treat as identical |
| --- | --- | --- |
| Relationship | ERPNext Customer plus Contact links. Salesforce Account-Contact. Issue 14 relator | Lead |
| Opportunity | ERPNext Opportunity. Odoo opportunity. Salesforce Opportunity. HubSpot Deal | Quotation, Sales Order |
| Case | ERPNext Issue. Odoo Ticket. Salesforce Case. Dynamics Case. HubSpot Ticket. Zendesk Ticket | ITIL Incident, Problem |
| Communication | Email thread, chatter, Activity, Conversation, WhatsApp message | Case status |
| SLA | ERPNext SLA. Odoo SLA policy. Zendesk SLA policy. Salesforce entitlement process | Entitlement eligibility |
| Resolution | ERPNext Resolved and Closed. Zendesk Solved. Odoo folded stage | Workaround, lost reason |
| Sentiment | Salesforce CSAT by channel | Case priority |
| Escalation | ERPNext priority change. Salesforce `IsEscalated` and escalation rules | New case |
