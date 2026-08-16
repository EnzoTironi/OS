---
issue: 27
kind: explanation
fetched: 2026-08-16
decision_state: hypothesis
---

# Scenario cards

Each card tries to kill a law or force a hidden convention into the open. Happy paths are omitted.

Kind of every card: counterexample. Decision state of the suite: `hypothesis`. A card is not itself `accepted`.

## S01. Two people share a support inbox

**Setup.** `support@buyer.example` is a shared mailbox. Ana and Ben both write from it about different products.

**Attack.** Auto-merge on email into one Contact and one Case.

**Questions.** Is email a person key? Do two incidents become one work item?

**Laws under test.** L2, L14.

**Expected pressure.** Merge must stay a proposed Action. Shared inboxes are a known false positive. E7 warns that similar-but-not-exact emails can still be different people. A shared exact email is worse.

## S02. Two salespeople already working the same person

**Setup.** Robin appears twice with the same personal email. Each record has a different owner and a different next step.

**Attack.** Silent merge into the first-created record.

**Questions.** Who owns the pursuit after merge? Are both next actions preserved as history?

**Laws under test.** L12, L14.

**Source.** E7 says tag the other salesperson rather than assume merge.

## S03. Lost lead merged into an active opportunity

**Setup.** A lost lead from last year shares a phone with this week's opportunity.

**Attack.** Merge. Odoo documents that the result becomes active.

**Questions.** Did we revive a dead pursuit? Is that a new Opportunity or the old one? What happens to the lost reason?

**Laws under test.** L3, L9, L14.

**Kind of risk.** Source artifact (irreversible merge) colliding with domain law (lost is a recorded outcome).

## S04. Same company, two contacts, two needs

**Setup.** Facilities wants a maintenance contract. Finance wants a license expansion.

**Attack.** Merge because the company name matches.

**Questions.** Is this one Opportunity or two? Does one Case cover both?

**Laws under test.** L3, L4, L14.

**Source.** E7 says do not merge different contacts at one organization when needs differ.

## S05. One person, two legal entities

**Setup.** Maya is AP at Buyer US and Buyer BR. She emails from the same phone WhatsApp about an invoice in each company.

**Attack.** One Customer, one Case, one entitlement.

**Questions.** Which LegalPerson is entitled? Which Company owns the work item? Which books take a credit?

**Laws under test.** L2, L6, L15.

**Cross-link.** Issue 14 L2. Scenario S-005 in `scenarios/README.md` is supplier-and-customer, a sibling shape.

## S06. Contact changes employer

**Setup.** A named caller on a Gold entitlement leaves Buyer and joins Competitor. The WhatsApp `wa_id` is unchanged.

**Attack.** Inbound message still opens cases against Buyer and decrements Buyer's remaining cases.

**Questions.** Does channel identity outlive the communication role? When does named-caller eligibility end?

**Laws under test.** L2, L6, L10.

**Source.** E28 named callers. E18 `wa_id`.

## S07. Lead convert without a deal

**Setup.** Salesforce-style convert with `setDoNotCreateOpportunity(true)`.

**Attack.** A model that says convert always equals Opportunity.

**Questions.** Did we only establish Account and Contact? Is qualification complete without a pursuit?

**Laws under test.** L1, L3.

**Source.** E10.

## S08. Opportunity on an existing customer, no Lead

**Setup.** ERPNext and Odoo both allow this.

**Attack.** A model that requires Lead as a previous phase of every Opportunity.

**Questions.** Is Lead optional work or a required Kind?

**Laws under test.** L1, L3.

**Source.** E3, E6.

## S09. Ticket converted to opportunity, then the outage continues

**Setup.** Odoo archives the ticket on convert. The customer writes again about the same outage.

**Attack.** Treat convert as proof the support work ended.

**Questions.** Is the archived ticket still the work item? Must a new ticket open? Does the SLA continue?

**Laws under test.** L4, L5, L8. Evidence E21.

**Decision state of the fork.** `undetermined`. HubSpot associates ticket and deal without archiving.

## S10. Customer replies after Close

**Setup.** ERPNext. Issue was Closed by timeout. Customer replies on the same thread.

**Attack.** Keep Closed because an agent already finished.

**Questions.** Is reopen automatic? Do Resolution Time and User Resolution Time reset? Does the SLA start over?

**Laws under test.** L8, L9, L7.

**Source.** E4, E5.

## S11. Resolved, no acknowledgment, timeout Close

**Setup.** Agent sets Resolved. Customer is silent. Close Issue After Days fires.

**Attack.** Treat Resolved as Closed at the moment the agent wrote the solution.

**Questions.** When did closure happen? Who was the actor? What if the customer later disputes?

**Laws under test.** L8, L9.

**Source.** E4, E22.

## S12. Customer closes, agent disagrees

**Setup.** Odoo Closure by Customers. Customer hits Close Ticket. The agent still sees a defect.

**Attack.** Customer close is the only authority.

**Questions.** Can the agent reopen? Is this a new case? Does CSAT of 5 block reopen?

**Laws under test.** L8, L11, L10.

**Source.** E22.

## S13. Pending pauses wait and does not pause first reply

**Setup.** Zendesk ticket is Pending. No public agent reply yet.

**Attack.** One `paused=true` on the ticket stops every clock.

**Questions.** Is first reply still running? Is requester wait paused?

**Laws under test.** L7.

**Source.** E16. This card is a direct falsifier of a single pause bit.

## S14. Hold for a vendor, then resume

**Setup.** ERPNext Pause SLA On includes Hold. Agent waits on a vendor, not the customer.

**Attack.** User Resolution Time subtracts all Hold as if it were customer wait.

**Questions.** Is vendor wait the same as customer wait? Does Total Hold Time hide the difference?

**Laws under test.** L7, L8.

**Source.** E4 User Resolution Time is defined as wait for the customer. E5 hold is any configured status.

**Kind of risk.** Source artifact (one Hold status) versus domain (who we wait on).

## S15. Holiday in the middle of a four-hour SLA

**Setup.** SLA is four business hours. The clock starts at 16:00 Friday. Monday is a holiday.

**Attack.** Calendar-hour due at 20:00 Friday.

**Questions.** Which calendar applies? Which company's working hours in a multi-company customer?

**Laws under test.** L7, L15.

**Source.** E5, E9, E13.

## S16. Two messages, two promised dates

**Setup.** Email from sales says Friday. WhatsApp from the customer says they were promised Thursday. The ERP promised date is next Tuesday.

**Attack.** Last message wins and overwrites promised date.

**Questions.** Are these the same property? Which observation is operationally authoritative? Can all three remain?

**Laws under test.** L10.

**Source.** E30. `scenarios/README.md` S-011.

**Decision state.** This folder does not answer `docs/open-questions.md` question 3. It only shows CRM channels produce the conflict.

## S17. WhatsApp delivered is treated as customer agreement

**Setup.** Agent sends "I will close this as resolved." Status webhook is `delivered`, then `read`.

**Attack.** Auto-close because the customer read the message.

**Questions.** Is read a resolution acceptance? What if the next inbound text says no?

**Laws under test.** L4, L8, L10.

**Source.** E18. Status webhooks carry no outgoing body and are not a business Event of agreement.

## S18. Failed send, then a retry, then a late delivered

**Setup.** WhatsApp status `failed`. Provider retries for days. A `delivered` arrives after the agent already called the customer.

**Attack.** Two outbound attempts become two cases, or the late delivered reopens a closed case.

**Questions.** What is the identity of the send? Is retry the same Action? Constitution question 5 (`unknown` versus failed) applies.

**Laws under test.** L4, L10.

**Decision state.** `undetermined` for Effect versus Action. Do not invent an answer.

## S19. Agent proposes a resolution the customer rejects

**Setup.** An agent or a model drafts ProposeResolution with a workaround. Customer replies "that does not fix it."

**Attack.** Draft commit, or treat the draft as Closed.

**Questions.** Does the proposal remain visible? Must commit re-read state? Who is the actor of reject?

**Laws under test.** L8, L10.

**Cross-link.** `scenarios/README.md` S-003 stale approval. `docs/open-questions.md` question 4.

## S20. Escalation after a missed first reply

**Setup.** First-reply SLA fails. A rule proposes escalate to tier 2.

**Attack.** Create a second case and close the first, losing the thread.

**Questions.** Is escalation the same work item? Does the failed SLA tag remain? Who is now assigned?

**Laws under test.** L13, L7, L12.

**Source.** E9 failed tag stays red. E5 priority change as escalate.

## S21. Angry CSAT on an already Closed case

**Setup.** Case Closed. Survey returns CSAT 1. The comment says the issue remains.

**Attack.** Overwrite status with the sentiment label, or ignore the survey as non-case.

**Questions.** Is the survey a new observation on the old case? Does it propose Reopen? Does it open a new case?

**Laws under test.** L11, L8, L9.

**Source.** E13 CSAT by channel is a dashboard observation.

## S22. Named caller not on the entitlement

**Setup.** An employee of a Gold account writes in. They are not an Entitlement Contact.

**Attack.** Open a Gold-SLA case because the Account is Gold.

**Questions.** Is eligibility account-wide or named-caller? What work item opens on refusal?

**Laws under test.** L6, L2.

**Source.** E11, E28.

## S23. Remaining cases hits zero, then the customer reopens

**Setup.** `IsPerIncident` entitlement has `RemainingCases = 0`. A closed case reopens, or a new email arrives.

**Attack.** Reopen for free, or refuse a reopen that is the same incident.

**Questions.** Does consumption attach to case creation, to first close, or to incident identity?

**Laws under test.** L6, L9.

**Source.** E29. Gap is first-party reopen-versus-count. Decision state: `undetermined`.

## S24. Reset SLA after the customer sends new logs

**Setup.** ERPNext allows reset until the SLA has failed. New information arrives on day two of a three-day SLA.

**Attack.** Reset after fail, or never reset when the request changed.

**Questions.** Is this the same work item with a new clock, or a new work item? Who may reset?

**Laws under test.** L7, L8.

**Source.** E5.

## S25. Assignment while the only eligible agent is on Time Off

**Setup.** Odoo Automatic Assignment. The only team member with the skill is on Time Off.

**Attack.** Assign anyway, or leave the ticket with no owner and a running first-reply clock.

**Questions.** Does Time Off pause assignment only, or also the clock? When no employee is available, Odoo looks ahead. Is that domain or product convenience?

**Laws under test.** L12, L7.

**Source.** E8.

## S26. Two agents accept the same new ticket

**Setup.** A queue shows one unassigned ticket. Two agents assign themselves.

**Attack.** Last write wins and the first agent's draft reply is orphaned.

**Questions.** Is Assign exclusive? Is the draft reply an observation on the case?

**Laws under test.** L12, L4.

**Decision state.** Concurrent Actions stay with `docs/open-questions.md` question 4. This card only shows the CRM shape.

## S27. Chat text "please refund 200" becomes a Posted Credit

**Setup.** A model reads WhatsApp and posts a credit memo.

**Attack.** Message body is treated as an authorized Action.

**Questions.** Who is the principal? Was entitlement or order state re-read? What is the provenance of the amount?

**Laws under test.** L10.

**Source.** E30, E32. Constitution sections 8 and 11.

**Cross-link.** Issue 16 owns refund and credit. This card only forbids message-as-posting.

## S28. Internal note used to stop a public-reply clock

**Setup.** Agent writes an internal "I looked at this" note. No public comment.

**Attack.** First-reply SLA fulfills.

**Questions.** Who can see the note? Did the customer receive a response?

**Laws under test.** L4, L7, L10.

**Source.** E20. Zendesk public comment fulfills reply metrics. Autoreply is an explicit exception.

## S29. Duplicate tickets for one outage, then a Problem

**Setup.** 40 customers open tickets about one outage. ITIL would want one Problem and many Incidents.

**Attack.** Merge all 40 into one Case, or keep 40 with no shared cause.

**Questions.** What is the identity of the cause? Do 40 SLAs still run? Does resolving the Problem resolve the Cases?

**Laws under test.** L5, L14, L8.

**Decision state.** `undetermined`. This is the Case-versus-Incident fork.

## S30. Case opened on the wrong company team

**Setup.** Buyer is a multi-company customer. A US Helpdesk team opens the case. The entitlement and the asset live on the BR company.

**Attack.** SLA and entitlement from the US default policy.

**Questions.** Which Company is the operating scope? Can the case move without becoming a new case?

**Laws under test.** L15, L6, L12.

**Source.** E19.

## Extra cards if a later pass needs more

The thirty cards above meet the issue minimum. The next four are recorded so they are not lost.

### S31. Side conversation with a vendor

A Zendesk-style side conversation is not a public reply. Does it pause agent work? Does it create a second work item?

### S32. Autoreply fulfills first reply

Zendesk documents that an autoreply can fulfill first reply. Is that domain-correct, or a clock cheat?

### S33. Opportunity first-response clock versus support first-response clock

ERPNext times both. Are they the same metric kind on different work items?

### S34. Sentiment model score used as priority

A high anger score auto-sets Urgent and applies a tighter SLA. Is that policy over an observation, or hidden mutation?
