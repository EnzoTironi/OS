---
issue: 27
kind: reference
fetched: 2026-08-16
decision_state: hypothesis
---

# Evidence

Each block is one observation. Kind is `domain evidence` or `source-system artifact`. Interpretation is not a law. Decision state is never `accepted`.

## E1. ERPNext Lead is an unqualified prospect

**Kind.** Domain evidence.

**Source.** S-EN-LEAD, S-EN-DIFF, S-EN-CRM.

**Observed model.** A Lead is a potential customer. It may be a person or an organization. Status moves through Lead, Open, Replied, Opportunity, Quotation, Lost Quotation, Interested, Converted, and Do Not Contact. Some statuses are set by later records. Creating an Opportunity sets Opportunity. Creating a Sales Order against a quotation sets Converted.

**Observed behavior.** A Lead can carry many Contacts and Addresses in a B2B deal. Comments, emails, and events attach to the Lead. An Opportunity, Customer, or Quotation can be created from the Lead. Assignment Rules can auto-assign Leads.

**Invariant suggested by the source.** Conversation history must survive a change of salesperson.

**Interpretation.** Lead is a qualification record, not yet the commercial party used in selling and accounting.

**Alternative.** Lead is a phase of a Party. Issue 14 owns that cut.

**Decision state.** `supported` as ERPNext documented behavior. `undetermined` as an OS Kind.

## E2. ERPNext Contact is a person, Customer is the billed party

**Kind.** Domain evidence.

**Source.** S-EN-DIFF, S-EN-CRM.

**Observed model.** Contact stores a person and communication details. It can link to a Customer, Supplier, Lead, or another party. Creating a Contact does not create a customer account. Customer is the commercial party used in quotations, orders, invoices, pricing, and credit.

**Observed behavior.** A Contact may be linked to more than one organization when the same person represents more than one party. The docs warn against creating a new Customer for every contact or branch unless the branch is a separate commercial or accounting party.

**Cross-reference.** Issue 14 L6. A contact person is not the billed party.

**Decision state.** `supported` as a domain distinction. Identity mechanics stay with issue 14.

## E3. ERPNext Opportunity is a qualified potential sale

**Kind.** Domain evidence.

**Source.** S-EN-OPP, S-EN-CRM, S-EN-PIPE.

**Observed model.** Opportunity is documented as a qualified lead. Opportunity From can be Lead, Customer, or Prospect. Fields include amount, probability, currency, items, source, sales stage, next contact date, and lost reason. Multiple Opportunities can exist against one Lead or Customer.

**Observed behavior.** A Quotation and a Supplier Quotation can be created from an Opportunity. Stale Opportunities can auto-close after a Selling Settings day count. First email reply writes Minutes to First Response.

**Interpretation.** Opportunity is pursued potential revenue. It is not an accepted order. Quotation and Sales Order belong to issue 16.

**Decision state.** `supported` for "qualified potential sale, many per party." `undetermined` for whether Opportunity is a Relator.

## E4. ERPNext Issue is an incoming customer query

**Kind.** Domain evidence.

**Source.** S-EN-ISSUE, S-EN-SUP.

**Observed model.** An Issue is an incoming query, usually email or website. Statuses are Open, Replied, Hold, Resolved, and Closed. Resolved means the team believes it has a solution and has not received customer acknowledgment. Closed means the customer acknowledged, a user closed it, or a timeout fired.

**Observed behavior.** A sender reply sets status Open again, including after Close. Comments are internal and not visible to customers. Emails form a thread keyed by ticket number in the subject. Issues can link Lead, Contact, Email Account, Project, and Company. Assignment Rule can auto-assign.

**Metrics.** Minutes to First Response, First Responded On, Average Response Time, Resolution Time, User Resolution Time. User Resolution Time subtracts wait for the customer. Resolution Time and User Resolution Time are set on Close and reset when the Issue reopens or splits.

**SLA note.** If an SLA exists, fulfillment updates on both Closed and Resolved.

**Decision state.** `supported` as ERPNext documented behavior.

## E5. ERPNext SLA is a clock attached to a customer, group, or territory

**Kind.** Domain evidence.

**Source.** S-EN-SLA, S-EN-SUP, S-EN-ISSUE.

**Observed model.** An SLA defines expected response and resolution times. The docs say SLAs are output-based and do not define how the service is delivered. Entity Type is Customer, Customer Group, or Territory. A default SLA applies when no particular SLA is assigned. Priorities carry Time to Respond and Time to Resolve. Holiday List and Support Hours bound the clock. Validity has start and end dates.

**Observed behavior.** Pause SLA On lists statuses that unset response and resolution fields and accumulate Total Hold Time. Leaving a hold status adds hold time back into the deadlines. Reset is allowed until the SLA has failed, and only if Support Settings allow reset. Priority change is documented as escalation.

**Source artifact.** The Service Level DocType was removed in version 13. That is an implementation rename, not a domain cut.

**Decision state.** `supported` for clock, pause, holiday, and reset-before-fail.

## E6. Odoo Lead is an optional qualifying step

**Kind.** Domain evidence.

**Source.** S-OD-CONV, S-OD-CRM.

**Observed model.** Leads can be turned on in CRM Settings. They apply to all teams by default and can be turned off per team. Convert to Opportunity can create a customer, link an existing customer, or link no customer. Merge with existing opportunities is a conversion action.

**Observed behavior.** A Similar Leads button appears when email or phone already exists. Merge prefers the first-created record, except a lead merged with an opportunity is named an opportunity.

**Interpretation.** Lead is a configurable pipeline gate, not a required party Kind.

**Decision state.** `supported` as Odoo documented behavior. `undetermined` as an OS primitive.

## E7. Odoo merge is irreversible and can revive a lost record

**Kind.** Source-system artifact with domain pressure.

**Source.** S-OD-MERGE.

**Observed behavior.** Similar records are detected by contact email and phone. Merge writes other-record data into chatter. A lost lead or opportunity can merge into an active one. The result is marked active. Different contacts at one organization should often stay unmerged. Similar-but-not-exact emails should stay independent. Two salespeople already working duplicates should be notified rather than silently merged.

**Invariant suggested by the source.** Merge must not drop history. Merge is irreversible.

**Cross-reference.** Issue 14 L5. Record merge is not legal succession.

**Decision state.** `supported` as Odoo documented behavior.

## E8. Odoo Helpdesk ticket is team-pipeline work

**Kind.** Domain evidence.

**Source.** S-OD-HD, S-OD-STG, S-OD-CLOSE.

**Observed model.** A ticket lives on a team pipeline of stages. Folded in Kanban marks a closing stage. Temporary Kanban fold does not close tickets. Visibility can be private, company, or public to invited portal users.

**Observed behavior.** Automatic assignment can balance total tickets or open tickets. Time Off removes an employee from assignment. Convert to Opportunity or Lead archives the ticket and links it in the new record's chatter. Merge of duplicate tickets requires the Data Cleaning app. Customers can be allowed to close their own tickets. Automatic closing moves inactive tickets in selected stages after a day count that ignores the working calendar.

**Decision state.** `supported` as Odoo documented behavior.

## E9. Odoo SLA is a policy to reach a stage in working hours

**Kind.** Domain evidence.

**Source.** S-OD-SLA.

**Observed model.** One policy applies to one Helpdesk team. Criteria include priority, tags, customers, and optional sales-order service lines. Target is Reach Stage plus allotted working time. Excluding Stages are omitted from the deadline calculation.

**Observed behavior.** Deadline is computed from ticket creation and working hours. If several policies match, the earliest deadline is shown, then the next after it passes. A failed SLA tag stays red after the ticket later reaches the stage.

**Decision state.** `supported` for stage-target clocks and excluding-stage pause.

## E10. Salesforce Lead conversion creates Account, Contact, and optional Opportunity

**Kind.** Domain evidence.

**Source.** S-SF-TH, S-SF-LC.

**Observed model.** Convert uses Lead data to create a business account, a contact, and optionally an opportunity. Person accounts are used when person accounts are enabled and the lead has no company name. Convert can attach to an existing account or contact. `setDoNotCreateOpportunity(true)` skips the deal.

**Observed behavior.** Activities on the lead move to the new account, contact, and opportunity. Converted leads leave the Leads tab and remain in reports. Company Name becomes Account Name. Lead Name becomes Contact Name.

**Interpretation.** Salesforce Lead is a staging record that is consumed on qualification. That is a stronger object split than ERPNext, where Lead can remain and still spawn later Opportunities against the new Customer.

**Decision state.** `supported` as Salesforce documented behavior. `undetermined` whether OS should consume a Lead record on qualification.

## E11. Salesforce Entitlement is eligibility, SLA process is the timeline

**Kind.** Domain evidence.

**Source.** S-SF-ENT, S-SF-ENTP, S-SF-ENTG.

**Observed model.** An Entitlement is a unit of customer support such as phone or web support. It associates with account, asset, contact, and service contract. `IsPerIncident` plus `CasesPerEntitlement` and `RemainingCases` limit case count. `SlaProcessId` points at an entitlement process. Named callers can be listed as Entitlement Contacts. A simple entitlement can state eligibility without a process. A process adds milestones such as first response.

**Observed behavior.** Web-to-Case and Email-to-Case do not auto-apply entitlements unless extra automation is added. Eligibility models include any contact on the account, or only named contacts.

**Interpretation.** Eligibility to receive support is not the same object as the response clock.

**Decision state.** `supported` for the eligibility-versus-clock split in Salesforce. `hypothesis` that OS needs both as distinct concepts.

## E12. Salesforce Case closedness is a status classification

**Kind.** Source-system artifact.

**Source.** S-SF-CS, S-SF-CF.

**Observed model.** Case has `Status`, `IsClosed`, and `IsEscalated`. CaseStatus rows mark which status values count as closed. Many status values can be closed.

**Gap.** The Case object narrative page returned empty HTML this session. Reopen and de-escalation defaults are `undetermined` from first-party narrative.

**Decision state.** `supported` for closed-as-classification. `undetermined` for reopen semantics.

## E13. Salesforce business hours bound escalation and milestones

**Kind.** Domain evidence.

**Source.** S-SF-BH, S-SF-REP.

**Observed behavior.** Business hours attach to cases, escalation rules, milestones, and entitlement processes. Holidays suspend associated clocks. Service Rep Dashboard distinguishes average time to first close from average time to last close, and counts first-contact resolution as one response.

**Interpretation.** Reopen is real enough that first close and last close are different metrics. Sentiment-like CSAT is reported by channel as a dashboard observation.

**Decision state.** `supported` for first-close versus last-close. `hypothesis` for CSAT as observation.

## E14. Dynamics Case is one incident of service that needs an answer

**Kind.** Domain evidence.

**Source.** S-D365-CASE.

**Observed model.** A case is a single incident of service. The same paragraph also says it is anything in a customer interaction that requires a resolution or answer. Multiple cases can exist for one customer. Activities are interactions such as a phone call. Entitlements are described as support contracts. SLAs define what should happen when a case is opened, such as time to respond. Queues hold waiting work. Routing rules send a case to a queue or user. Business process flows guide stages.

**Interpretation.** Dynamics uses "incident" in the everyday sense, not as a proof that ITIL Incident is the Case Kind.

**Decision state.** `supported` as Dynamics documented behavior. `undetermined` for Case versus ITIL Incident.

## E15. HubSpot Ticket is a support request associated with other CRM objects

**Kind.** Domain evidence.

**Source.** S-HS-TIX, S-HS-ASSOC.

**Observed model.** A ticket is a customer request for help. It moves through pipeline statuses until closed. Associations include contact, company, deal, email, call, meeting, note, task, communication (SMS, WhatsApp, or LinkedIn), thread, and conversation. Conversation is a separate object.

**Source artifact.** Pipeline and stage are stored as internal numeric IDs. That is an implementation handle.

**Decision state.** `supported` that conversation and ticket are associated, not identical.

## E16. Zendesk SLA metrics do not share one pause rule

**Kind.** Domain evidence.

**Source.** S-ZD-SLA, S-ZD-PAUSE, S-ZD-EVT, S-ZD-STS.

**Observed model.** An SLA policy has conditions and priority-based targets. Metrics include First reply time, Next reply time, Periodic update, Pausable update, Requester wait time, Agent work time, and Total resolution time. Custom statuses map to categories New, Open, Pending, On-hold, Solved, Closed. Clocks use categories, not custom names.

**Observed behavior.** First reply and next reply start from a customer comment and stop on a public agent comment. They do not pause on Pending. Requester wait pauses on Pending. Agent work pauses on Pending and On-hold. Total resolution does not pause on Pending. Autoreply can fulfill first reply. On reopen, reply metrics can start new targets. Work and wait metrics reactivate remaining time and treat Solved as a pause. Total resolution continues from creation, ignoring time spent Solved.

**Decision state.** `supported` that "SLA pause" is metric-specific.

## E17. ITIL Incident, Service Request, and Problem are different practices

**Kind.** Domain evidence.

**Source.** S-ITIL-G, S-ITIL-AX.

**Observed definitions.** Incident is an unplanned interruption or reduction in service quality. Incident management restores normal operation as quickly as possible. Service request is a user-initiated request for a service action agreed as a normal part of delivery. Problem is a cause or potential cause of one or more incidents. Resolution is the action of solving an incident or problem. Workaround reduces impact when full resolution is unavailable. Service desk captures demand for incidents and requests.

**Interpretation.** CRM Issue, Ticket, and Case records routinely mix these three. A password reset and an outage can share one ticket DocType.

**Decision state.** `supported` as ITIL vocabulary. `undetermined` whether OS must native-split Case from Incident.

## E18. WhatsApp incoming content and outgoing status are different payloads

**Kind.** Domain evidence.

**Source.** S-WA-WH, S-WA-WEB, S-WA-ST.

**Observed model.** Incoming user messages arrive in a `messages` array with `from`, `id`, `timestamp`, and typed body. Outgoing delivery arrives in a `statuses` array. Status values include sent, delivered, read, played, and failed. Status webhooks do not include outgoing message contents. One outgoing message can produce up to three status webhooks. Failed delivery retries for up to 7 days when the receiver does not return HTTP 200.

**Interpretation.** A channel report of delivered is not a business Event that the customer agreed to a resolution. A text body is a claim with provenance, not operational state.

**Decision state.** `supported` for payload split and non-authoritative status.

## E19. ERPNext Issue Company and Odoo Helpdesk Company are operating scopes

**Kind.** Domain evidence.

**Source.** S-EN-ISSUE, S-OD-HD.

**Observed model.** ERPNext Issue can be filtered by Company. Odoo Helpdesk team has a Company field.

**Interpretation.** A support work item is usually scoped to one operating company even when the customer party spans several legal entities. Issue 14 L2 owns legal person versus operating unit.

**Decision state.** `hypothesis`.

## E20. Internal comment is not a customer-visible reply

**Kind.** Domain evidence.

**Source.** S-EN-ISSUE, S-ZD-SLA.

**Observed behavior.** ERPNext Issue comments are internal and hidden from customers. Zendesk first-reply and next-reply clocks require a public agent comment. An internal note does not fulfill those clocks, except some first-reply start rules when a light agent or agent-created ticket uses notes.

**Decision state.** `supported`.

## E21. Ticket-to-opportunity conversion changes work kind

**Kind.** Domain evidence.

**Source.** S-OD-HD.

**Observed behavior.** Odoo can convert a helpdesk ticket to an opportunity or lead. The ticket is archived. The new CRM record keeps a chatter link.

**Interpretation.** Support work and sales pursuit can start from the same message. They do not stay the same object.

**Decision state.** `supported` as Odoo behavior. `hypothesis` as a domain law.

## E22. Customer close and agent close can disagree

**Kind.** Domain evidence.

**Source.** S-OD-CLOSE, S-EN-ISSUE, S-EN-SUP.

**Observed behavior.** Odoo can let portal customers close their tickets. ERPNext Resolved waits for acknowledgment. ERPNext Close can be manual or after days in Replied or Resolved. A later customer reply reopens.

**Interpretation.** Closure is a decision with an actor. Customer satisfaction and agent belief can diverge.

**Decision state.** `supported` that both actors exist. `hypothesis` for which actor is authoritative.

## E23. Assignment is workload, not relationship ownership

**Kind.** Domain evidence.

**Source.** S-EN-LEAD, S-EN-OPP, S-EN-ISSUE, S-OD-HD.

**Observed behavior.** Assignment Rules and Helpdesk Automatic Assignment allocate work. Odoo can balance open tickets and skip people on Time Off. A Lead or Opportunity still has an owner for the relationship.

**Interpretation.** Who works the next reply can change without ending the customer relationship.

**Decision state.** `hypothesis`.

## E24. Pipeline stage is a process projection

**Kind.** Domain evidence.

**Source.** S-EN-CRM, S-OD-WIN, S-HS-TIX, S-OD-STG.

**Observed model.** Sales Stage and ticket stage are team-defined steps. Odoo Won and Lost are reported against stages. HubSpot ticket status is a pipeline stage id.

**Interpretation.** Stage is how a team currently classifies work. It is not the deal or the incident.

**Decision state.** `hypothesis`.

## E25. Lost reason is an observation about a failed pursuit

**Kind.** Domain evidence.

**Source.** S-EN-OPP, S-OD-WIN.

**Observed behavior.** ERPNext captures lost reason, competitors, and detail. Odoo Pipeline Analysis groups Won and Lost.

**Decision state.** `supported` that loss is recorded, not deleted.

## E26. Minutes to first response appear on both sales and support records

**Kind.** Domain evidence.

**Source.** S-EN-OPP, S-EN-ISSUE, S-ZD-SLA.

**Observed behavior.** ERPNext writes Minutes to First Response on Opportunity and Issue. Zendesk First reply time is an SLA metric.

**Interpretation.** First response is a communication clock. It is not unique to support.

**Decision state.** `supported`.

## E27. ERPNext CRM module removal is not a domain finding

**Kind.** Source-system artifact.

**Source.** S-EN-CRM.

**Observed behavior.** Develop docs say the CRM workspace will be removed in version 17 in favor of Frappe CRM. Selling transactions remain.

**Decision state.** `supported` as a product roadmap note. `rejected` as evidence that Lead or Opportunity are unreal.

## E28. Named-caller entitlement can refuse a contact

**Kind.** Domain evidence.

**Source.** S-SF-ENTP.

**Observed model.** Entitlement Contacts list who may request support. The guide says a business may refuse support unless the caller is on the entitlement.

**Decision state.** `supported` as Salesforce documented eligibility.

## E29. Per-incident entitlement decrements remaining cases

**Kind.** Source-system artifact with domain pressure.

**Source.** S-SF-ENT.

**Observed model.** `RemainingCases` decreases by one when a case is created with that entitlement.

**Gap.** Reopen versus a new case after a count decrement was not fetched.

**Decision state.** `hypothesis` that case-count entitlements consume on case creation.

## E30. Constitution already treats chat extraction as weaker authority

**Kind.** Domain evidence.

**Source.** S-OS-CON section 11, S-OS-OQ question 3, S-OS-SC S-011.

**Observed claim.** A signed invoice and an extracted chat message can carry the same value with different authority. Scenario S-011 already asks how contradictory promised dates from ERP, spreadsheet, and chat coexist.

**Decision state.** `supported` as a standing OS research rule. This folder supplies CRM channel evidence for it. It does not close question 3.

## E31. Sibling party laws already cover Customer as role and merge

**Kind.** Domain evidence, cited not copied.

**Source.** S-OS-P14 laws L1, L5, L6.

**Observed claim.** Customer is not a Kind. Record merge, legal succession, and identifier correction are different actions. A contact person is not the billed party.

**Use here.** CRM Lead conversion and ticket customer-linking must not invent a second party model.

**Decision state.** `supported` as a cross-link. This folder does not re-prove those laws.

## E32. Agent-proposed case work is already a product pattern in Dynamics

**Kind.** Source-system artifact.

**Source.** S-D365-CASE related Copilot summaries, plus Dynamics release-plan pages found in search for Case Management Agent.

**Observed behavior.** Dynamics documents Copilot case summaries and, in release-plan pages, agents that draft case fields from email or chat and send SLA follow-ups. Email classification can skip case creation for thank-you or spam mail.

**Interpretation.** Unstructured communication is being turned into proposed case fields. The official overview still treats the Case as the work record, not the email.

**Decision state.** `hypothesis`. Release-plan pages are weaker than the case-overview page.
