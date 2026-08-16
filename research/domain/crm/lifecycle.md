---
issue: 27
kind: explanation
fetched: 2026-08-16
decision_state: hypothesis
---

# Lifecycles

These are causal stories, not a schema. Each phase names what kind of thing it is. Decision state of the whole file is `hypothesis`.

## 1. Party and relationship

Issue 14 owns identity. CRM only uses the relationship.

```text
Person or Organization exists
        |
        +--> communication role (ContactPerson, channel address)
        |
        +--> commercial relationship (Customer role, terms, books)
        |
        +--> operating scope (which LegalPerson or Company the work is for)
```

**Kind.** Domain evidence plus candidate cut.

**What is not this lifecycle.** A Lead record. A phone number. A WhatsApp `wa_id`. Those can point at a person. They do not create the billed party.

**Runtime consequence.** A message inbound on a number proposes a link to a Person. It does not create a Customer. See L1 and L2 in `candidate-laws.md`.

**Decision state.** `supported` that contact means ≠ billed party. `undetermined` for Lead as a phase of Party.

## 2. Qualification and pursuit

```text
Enquiry observed (form, email, event, referral)
        |
        v
Qualification work (often called Lead)
        |
        +--> discarded or Do Not Contact
        |
        +--> qualified pursuit (Opportunity or Deal)
                |
                +--> lost, with a reason
                |
                +--> offer (Quotation). Issue 16 owns this
                |
                +--> accepted order. Issue 16 owns this
```

**Kind.** Domain evidence.

**Facts that stay true across sources.**

- Qualification can be skipped when the party is already a customer. E3, E6.
- Many pursuits can exist for one party. E3.
- Pipeline stage is how the team currently classifies the pursuit. E24.
- Lost is a recorded outcome, not a delete. E25.
- First response can be timed on a pursuit. E26.

**Facts that diverge.**

- Salesforce conversion consumes the Lead and usually mints Account, Contact, and Opportunity together. E10.
- ERPNext conversion can create a Customer while the Lead status becomes Converted, and later Opportunities can be raised against that Customer. E1, E3.
- Odoo can keep the whole Lead gate turned off. E6.

**Runtime consequence.** An Action such as Qualify or Convert must say whether it creates a party, a relationship, a pursuit, or all three. It must not hide those as one field write.

**Decision state.** `supported` for pursuit ≠ order. `undetermined` for Lead object death.

## 3. Support work item

```text
Inbound communication or agent-logged request
        |
        v
Work item opened (Issue, Ticket, Case)
        |
        +--> eligibility checked (Entitlement, or implicit by customer)
        |
        +--> assigned (queue, user, rule)
        |
        +--> waiting on customer or third party (Hold, Pending)
        |
        +--> agent proposes resolution
        |
        +--> resolved or solved (agent belief)
        |
        +--> closed (customer ack, customer close, agent close, or timeout)
        |
        +--> reopened if a later customer message disputes closure
```

**Kind.** Domain evidence.

**Resolved is not closed.** ERPNext states this in words. Zendesk uses Solved then Closed. Odoo uses a folded stage as closed and can let the customer close. E4, E16, E22.

**Reopen does not erase the first close.** Salesforce first-close and last-close metrics exist. Zendesk treats Solved time as a pause on some clocks and starts new reply targets. ERPNext resets Resolution Time on reopen. E4, E13, E16.

**Incident versus request.** ITIL splits them. CRM work items usually do not. E14, E17. Decision state for a native split: `undetermined`.

**Runtime consequence.** Closure is an Action with an actor. Reopen is an Action that cites the new observation. Status is a projection over those Actions plus policy, or it is at least explainable as one. `docs/open-questions.md` question 6 stays open.

## 4. Clocks

```text
Eligibility (may be absent)
        |
        v
Policy selected (customer, priority, team, tags, named caller)
        |
        v
Metric instances
        |
        +--> first reply
        +--> next reply
        +--> agent work
        +--> requester wait
        +--> total resolution
        +--> reach-stage deadline
```

**Kind.** Domain evidence.

Each metric has its own start, pause, fulfill, and reopen rule. E16. Working hours and holidays bound some metrics. E5, E9, E13.

**Pause** is not one flag on the work item. A ticket can be Pending, which pauses requester wait and does not pause first reply. E16.

**Fail** can be sticky. Odoo keeps a red failed tag after the stage is later reached. E9. ERPNext forbids reset after fail. E5.

**Runtime consequence.** A runtime that stores one `sla_due_at` and one `paused` boolean cannot express Zendesk and will lie about ERPNext User Resolution Time. If this claim survives, clocks are functions over events, business hours, and metric definitions.

**Decision state.** `supported` that one boolean pause is false. `hypothesis` for how OS stores clocks.

## 5. Communication

```text
Channel payload received
        |
        v
Observation stored
        from, to, channel, message id, timestamp, body or status
        |
        +--> proposed identity link (which Person, which Company)
        |
        +--> proposed work-item link (which Case or Opportunity)
        |
        +--> proposed Action (close, reopen, refund, escalate, convert)
        |
        v
Human or policy commits or refuses
```

**Kind.** Candidate cut, grounded in E18, E20, E30, E32.

Incoming WhatsApp content and outgoing WhatsApp status are different observations. A public reply is a different observation from an internal note. A CSAT score is a different observation from case status.

**Messages are not authoritative state.** Constitution section 11 and scenario S-011 already say this. CRM channels add delivery status, retry, and unread-as-not-agreed.

**Runtime consequence.** Ingestion writes observations with provenance. It may emit proposed Actions. It must not silently set Resolved, Won, or Customer created because a parser liked the text.

**Decision state.** `supported` for observation versus state. `hypothesis` for the exact proposal object. That question lives in `docs/open-questions.md` questions 4 and 10.

## 6. Escalation

```text
Work item in progress
        |
        +--> priority change (ERPNext documents this as escalate)
        |
        +--> rule fires after elapsed business time (Salesforce escalation rules)
        |
        +--> agent proposes escalate
        |
        v
Authority or queue changes
        |
        v
Escalated is a fact about the work item
```

**Kind.** Domain evidence plus gap.

Fetched Salesforce pages name `IsEscalated` and escalation rules bound by business hours. They do not settle whether escalation ever clears. Community pages disagree and are not first-party.

**Runtime consequence.** Escalation is an Action on the work item. It is not automatically a new case. A new case is a different Action.

**Decision state.** `hypothesis`.

## 7. Happy path that proves little

A new email becomes an Issue, an agent replies inside the SLA, the customer says thanks, the Issue closes. That path is true and almost useless. The cards in `scenarios.md` are the ones that can kill a law.
