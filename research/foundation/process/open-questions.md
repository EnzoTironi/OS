# Open questions

**Kind:** unresolved uncertainty  
**Decision state:** undetermined unless noted  
**Fetched:** 2026-08-15

This file does not answer `docs/open-questions.md`. Where a numbered question from that document is touched, the state stays whatever that document says. This folder only adds local questions and pointers.

## Touched project questions, still unresolved

### Q13 How should economic reality be modeled?

`docs/open-questions.md` asks which of Intent, Commitment, EconomicEvent, Claim, Agreement, Process, EconomicResource are universal, and whether ERP documents are surfaces over those concepts.

This folder treats Commitment, Agreement, Process, and Event as useful modeling tools for four cycles. That is a research convenience, not a promotion into the kernel. **Undetermined** for OS.

See L-003, L-011 in [candidate-laws.md](candidate-laws.md).

### Q14 How should manufacturing reality be modeled?

The document asks whether a Work Order is a commitment, an authorization, a plan, a process instance, or a combination.

ERPNext Work Order documentation supports combination. It authorizes a quantity, explodes a BOM, reserves warehouses, and is the parent of Job Cards. ValueFlows would split authorization-ish Commitments from the Process instance. **Undetermined** which cut OS should keep.

See E-007 and D-001 in [evidence.md](evidence.md).

### Q15 What belongs in the ontology versus the runtime?

This folder argues that durable wait, replay, and at-least-once automation are runtime (L-009, **supported** as a local law). It does not decide query semantics, subscriptions, or transaction protocol. Those remain **undetermined** at the project level.

## Local questions opened by this folder

### P-001 Does Process need identity beyond its flows?

If every input and output Event already points at the same specification, agents, and time window, is a Process object still required?

**Why it matters.** Extra identity is semantic cost. Manufacturing scrap, rework, and WIP return are easier to attach to a Process. VF insists on Process as the place transformation happens.

**What would decide it.** A counterexample where two ERPs and VF attach those facts without a process instance, or a failure mode where omitting the instance mixes two jobs' events.

**State:** undetermined

### P-002 Is Plan a third object or a query?

ValueFlows Plan is a collection of processes with independent demand. ERPNext Production Plan was not fetched this session. A sales order that triggers several work orders looks like a Plan.

**State:** undetermined. Do not add `Plan` to the small vocabulary until a planning-domain issue researches it.

### P-003 Rework. Same Process or new Process?

S-009 and the manufacturing adversarial card leave this open. ERPNext Job Cards can continue on the same Work Order. VF would often start another Process if resources differ.

**State:** undetermined

### P-004 Claim versus Commitment for invoices

VF Claim is receiver-initiated and can be implied from an Event plus Agreement. ERPNext and Odoo invoices are documents with their own submit cycle. Whether invoice is Event, Claim, or Agreement is out of scope here.

**State:** undetermined. Point at the accounting and procure-to-pay domain issues.

### P-005 Race joins and first-message-wins

CX-003 asks whether a native race is needed when two external Events compete. BPMN event-based gateway is notation. Temporal can `Promise.race` on Signals. The domain law might be a Constraint.

**State:** undetermined. Not enough independent operational evidence this session.

### P-006 Choreography across legal entities

BPMN Choreography and VF plans that span organizations were not researched against a real intercompany corpus.

**State:** undetermined. Do not open a new GitHub issue until an intercompany or multi-entity research issue needs a process-specific question that #10 does not already ask.

### P-007 Deadline as fact, timer, or both

L-008 treats deadline as a fact and timer as runtime. Some commercial promises use incoterms and named places (ERPNext Sales Order fields) rather than a single timestamp.

**State:** undetermined. Adjacent to time research (#5) and value types (#62).

### P-008 Must commit re-read after every human delay?

S-003 and L-010 assume yes for approval. Palantir Automate at-least-once plus sequential failure (A-005) makes the same demand of Actions. Ontologiq is cited in `research/reference-landscape.md` for propose, approve, re-read. That landscape note is prior research, not a page fetched for #10.

**State:** hypothesis, owned by Action and Effect issues (#6, #7), not closed here.

## Questions this folder claims to have moved

| Claim | State | Where |
| --- | --- | --- |
| Is `Workflow` a kernel form? | rejected | L-001 |
| Spec versus instance? | supported as a distinction | L-002 |
| Is durable orchestration domain semantics? | rejected. It is infrastructure. | L-009 |
| Are the four cycles expressible without `Workflow`? | hypothesis that they are, with models in [scenarios.md](scenarios.md) | L-001 falsification test |

## What a synthesis agent should not do

Do not copy these local hypotheses into `docs/open-questions.md`.  
Do not edit RFC-0001 from this folder alone. L-001 agrees with the RFC's existing exclusion. That is reinforcement, not a status change.  
Do not start Wave B engine selection from these runtime notes. They name pressure, not a product.
