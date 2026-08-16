# Lifecycles for projects and professional services

- Artifact ID: `issue-0029-projects-lifecycle`
- Issue: https://github.com/EnzoTironi/OS/issues/29
- Kind: domain evidence
- Decision state: hypothesis as a merged picture. Each phase cites source evidence.

No target schema. Phases are real-world stages the sources keep separating. Sibling issue #16 owns offer, commitment, claim, and settlement. This note only states where project work touches those stages.

---

## Commercial cycle

Kind: domain evidence. Decision state: supported as a sequence of different milestones. E-004, E-005, E-018, E-023, E-025.

```text
offer
  -> commercial commitment
  -> optional work container
  -> observed work / expense / material
  -> billable quantity
  -> invoice / claim
  -> settlement
```

ERPNext names the documents Quotation, Sales Order, Project plus Timesheet, Sales Invoice, Payment Entry. None of those documents posts the same economic fact. Quotation and sales order do not post the ledger. Delivery note posts stock. Invoice posts receivable. Payment clears it. E-004.

Dynamics says a project contract is the billing authority and is not interchangeable with a sales order even when built on one. E-003, E-025.

Valueflows says Intent, then Commitment, then Economic Event, then optional Claim if no commitment already covers reciprocity. E-023.

### Phase notes

- Offer. Versioned commercial proposal. Skipping it loses a versioned offer. E-004. Owned by #16.
- Commercial commitment. Confirmed quantity, price, billing method, and billing progress. Sales order or project contract. E-002, E-025.
- Work container. Project and tasks. Optional in ERPNext. Often generated from the order in Odoo. Required to invoice in Dynamics only when associated to a contract. E-002, E-019, E-025.
- Observed work. Time entry, expense, material use. Past tense. E-013, E-017, E-021.
- Billable quantity. Policy projection over observations and billing method. E-013, E-018, E-020.
- Invoice or claim. Receivable. Not acceptance. E-005, E-023.
- Settlement. Payment. Owned by #16.

---

## Work-container cycle

Kind: domain evidence. Decision state: hypothesis.

```text
planned
  -> approved or scheduled
  -> in progress
  -> on hold
  -> complete
  -> closed
  -> cancelled
```

Moqui Default StatusFlow uses In Planning, Approved/Scheduled, In Progress, Complete, Closed, On Hold, Cancelled, plus a separate resolution. E-009, S-Moqui-01.

ERPNext Project status starts Open and later Completed or Cancelled. Is Active can flip independently. E-002.

Odoo task statuses include Waiting when blocked. E-011.

Actual start and end in ERPNext are projections from the first and last timesheet, not the status field. E-002, E-010.

### What status is not

Percent complete is a function of tasks or a manual override. It is not the same as status and not the same as billed percent. E-026.

---

## Work-item cycle

Kind: domain evidence. Decision state: supported for decomposition and blocking. hypothesis for one status enum.

```text
created
  -> optional blocked / waiting
  -> working
  -> pending review
  -> completed | cancelled | won't complete
```

ERPNext Task statuses include Open, Working, Overdue, Pending Review, Completed, Cancelled. E-010.

Odoo successor cannot enter In Progress while predecessors are unfinished, unless those predecessors are Cancelled. E-011.

Moqui resolution is a second axis. Completed, Incomplete, Won't Complete, Duplicate, Cannot Reproduce, Insufficient Information. S-Moqui-01.

A parent or group task is a source-system grouping. It is not automatically a commercial deliverable. E-008, E-010.

---

## Assignment cycle

Kind: domain evidence. Decision state: supported in Moqui. hypothesis as a required relator.

```text
offered
  -> assigned | declined
  -> unassigned
  -> delegated with reason
```

Moqui records availability and expectation on the same association. Delegation reasons include Need Support, My Part Finished, Completely Finished. S-Moqui-01, E-012.

Reassignment is a new association or a status change on the old one, not a silent overwrite of who did historical time. Historical TimeEntry still points at the party who worked. E-014.

Capacity of the assigned party belongs to issue #24. Employment of that party belongs to issue #28.

---

## Time-entry cycle

Kind: domain evidence. Decision state: supported that observation, approval, and billing are different stages. undetermined which correction model wins.

```text
draft observation
  -> submitted or completed
  -> approved for billing   (Moqui timesheet; not pinned in Odoo)
  -> referenced by invoice item
```

ERPNext locks billing and costing rates on submit. E-016.

Moqui marks billed when invoice item fields are populated. E-014.

Valueflows would treat the observation as an Economic Event at the moment it is recorded as past fact, then refuse mutation. E-017.

### Two clocks

Kind: domain evidence. Decision state: supported. E-017, E-013.

- Effort quantity. Hours worked, billing hours, break hours.
- Calendar interval. From time and to time, used to schedule and to detect overlap.

Moqui says hours plus break hours should match the from-to duration when both are set. S-Moqui-01.

### Correction fork

Kind: counterexample. Decision state: undetermined.

- ERPNext. Cancel, then amend, then resubmit. Dependents first. E-016.
- Valueflows. New event with `corrects`, possibly negative. E-017.

A later synthesis must not pick one in this folder.

---

## Milestone cycle

Kind: domain evidence. Decision state: undetermined as one kind. supported as three observed uses.

```text
defined
  -> associated to work
  -> reached or complete
  -> optionally invoiced
```

Use A. Task flag. ERPNext `Is Milestone`. E-008.

Use B. Peer checkpoint. Moqui milestone work effort associated to many tasks over time. E-009.

Use C. Billing trigger. Odoo Reached fills Delivered. Dynamics billing rule or invoice schedule. ERPNext decimal quantity on a service item. E-006, E-007, E-025.

Reached is not acceptance. E-005, E-007.

---

## Billing-method cycle

Kind: domain evidence. Decision state: supported. E-018, E-020, E-006.

### Time and materials

```text
observe time / expense / material
  -> mark billable
  -> optional not-to-exceed check
  -> invoice observed quantity
```

More cost creates more sales unless a cap applies. E-018.

### Fixed price or milestone

```text
commit a total
  -> reach a checkpoint or invoice a fraction
  -> invoice that fraction of the committed total
```

More cost does not raise the committed sales value. E-018.

### Mixed order

```text
one commercial commitment
  -> stock lines follow inventory fulfillment   (#18)
  -> service lines follow work observation or milestone
  -> one invoice may include both
```

E-004, E-021.

---

## Acceptance gap

Kind: domain evidence. Decision state: undetermined as a type. supported as a missing control.

ERPNext says the team needs another way to verify that a purchased service was accepted before invoice approval, and that a sales invoice is not acceptance. E-005, S-ERPNext-05 purchase-led service section.

No first-party Acceptance document was opened this session.

---

## Runtime consequences of these cycles

Kind: runtime consequence. Decision state: hypothesis. No runtime or toolchain chosen.

### R-LC-01 Distinct stages must remain addressable

An agent that can only set `status` on a project row cannot answer "what did we promise," "what was worked," "what is billable," and "what was accepted."

### R-LC-02 Projections must name their inputs

Percent complete, billed percent, remaining work, and gross margin are functions. They need named inputs. The ERPNext printed margin formula is a warning, not a model. E-022.

### R-LC-03 Correction policy is a semantic fork

If historical time is mutated in place after invoice, billed facts lie. If a compensating event is required, the runtime must keep both events. E-016, E-017.
