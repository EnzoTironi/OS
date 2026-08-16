---
issue: 27
track: domain
decision_state: hypothesis
contract: docs/swarm-research-backlog.md Agent output contract
swarm_result_contract: absent-on-origin-main
fetched: 2026-08-16
---

# CRM and customer service

Query this directory for issue 27. Files follow the Wave A output contract in `docs/swarm-research-backlog.md`. `docs/swarm-result-contract.md` is not on `origin/main`.

This folder does not answer `docs/open-questions.md`. It records evidence a synthesis agent can cite. RFC-0001 is untouched. No target schema is proposed.

Each claim is tagged as one of domain evidence, source-system artifact, candidate law, counterexample, or runtime consequence. Decision state is `hypothesis`, `supported`, `rejected`, or `undetermined`. Nothing here is silently accepted.

## Question

Which CRM and customer-service distinctions survive when Lead, Contact, Account, Opportunity, Activity, Case, Ticket, Incident, Request, SLA, Entitlement, Assignment, Resolution, Sentiment, and inbound messages are treated as observations rather than tables to copy?

The issue asks for these cuts:

1. Lead, contact, account, and relationship.
2. Opportunity and pipeline state.
3. Activity and communication.
4. Case, ticket, incident, and request.
5. SLA and entitlement.
6. Assignment.
7. Resolution.
8. Customer sentiment as observation.
9. WhatsApp, email, and message provenance.
10. Converting unstructured communication into proposed Actions without treating messages as authoritative state.

Required scenario families: duplicate contacts, multi-company customer, reopened case, SLA pause, conflicting messages, agent-proposed resolution, escalation.

## Files

| File | Mode | Contents |
| --- | --- | --- |
| `sources.md` | reference | URLs and documents fetched this session |
| `evidence.md` | reference | Labeled evidence blocks E1 through E32 |
| `matrix.md` | reference | Convergence and divergence plus source-artifact mapping |
| `lifecycle.md` | explanation | Causal lifecycles for relationship, opportunity, case, clock, and message |
| `candidate-laws.md` | explanation | Smallest claims that still fit the evidence |
| `scenarios.md` | explanation | Thirty falsifying scenario cards |
| `open-questions.md` | reference | Residual uncertainty. No invented answers |

## Sibling notes, read only

These paths exist on other branches. This folder cross-links them. It does not write them and does not treat their conclusions as this issue's findings.

- `research/domain/party/` on `cursor/issue-14-domain-cfd8`. Issue 14 owns Person, Organization, LegalPerson, Customer as role, ContactPerson, and merge versus succession.
- Issue 16 owns offer, quotation, accepted order, commitment, and fulfillment. The branch `cursor/issue-16-domain-cfd8` existed on origin at fetch time with no `research/domain` files yet.
- `docs/open-questions.md` questions 3, 4, 5, 8, 10, and 12 are adjacent. This folder cites them. It does not answer them.

## Output contract

1. **Question.** This README.
2. **Sources.** `sources.md`.
3. **Evidence.** `evidence.md`.
4. **Source artifacts.** Marked in `evidence.md` and `matrix.md`.
5. **Convergence.** `matrix.md`.
6. **Divergence.** `matrix.md`.
7. **Candidate laws.** `candidate-laws.md`.
8. **Counterexamples.** `scenarios.md`.
9. **Runtime pressure.** `candidate-laws.md` and `lifecycle.md`.
10. **Open questions.** `open-questions.md`.
11. **Decision state.** Each law and this folder. Default is `hypothesis`. Never `accepted`.

## How to read this

Start with `lifecycle.md` for the candidate cuts. Use `matrix.md` when a later issue asks what source X did with Lead or SLA. Use `candidate-laws.md` and `scenarios.md` when a later issue asks what would change the answer.

Do not treat ERPNext Issue, Odoo Ticket, Salesforce Case, HubSpot Ticket, or Zendesk Ticket as OS vocabulary. They are observations about other systems.

Lead-versus-party identity and case-versus-incident remain `undetermined` unless later independent first-party sources agree. Issue 14 already treats Customer as a role, not a Kind. This folder does not rewrite that claim.

## Licensing

OS is MIT. These notes extract concepts and documented behavior. No copyleft implementation was pasted or translated into the repo. Odoo and ERPNext were read as documentation of behavior. Salesforce, HubSpot, Zendesk, Dynamics, WhatsApp Cloud API, and ITIL glossary text were read the same way.
