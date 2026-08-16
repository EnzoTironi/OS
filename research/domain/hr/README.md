---
issue: 28
track: domain
decision_state: hypothesis
contract: docs/swarm-research-backlog.md Agent output contract
swarm_result_contract: absent-on-origin-main
fetched: 2026-08-16
---

# HR, employment, organization structure, time, compensation, payroll

Query this directory for issue 28. Files follow the Wave A output contract in `docs/swarm-research-backlog.md`. `docs/swarm-result-contract.md` is not on `origin/main`.

This folder does not answer `docs/open-questions.md`. It records evidence a synthesis agent can cite. RFC-0001 is untouched.

Each claim is tagged as one of domain evidence, source-system artifact, candidate law, counterexample, or runtime consequence. Decision state is `hypothesis`, `supported`, `rejected`, or `undetermined`. Nothing here is silently accepted.

## Question

Which employment distinctions survive when Frappe HR Employee, Odoo Employee plus Contract, W3C ORG Membership and Post, UFO or gUFO Employment relator, FIBO Employment, schema.org EmployeeRole, HR-XML Employment, and ValueFlows work events are treated as observations rather than tables to copy?

The issue asks these cuts:

1. Person versus Employee as role or kind.
2. Employment as a mediating relationship.
3. Organization, unit, and position.
4. Manager relation.
5. Assignment.
6. Contract.
7. Attendance, time entry, and leave.
8. Compensation.
9. Payroll period, result, and payment.
10. Benefits.
11. Termination.
12. Multiple concurrent employments.
13. Permissions from organizational role versus employment.

Required scenario families are promotion, transfer, leave, retroactive compensation correction, contractor versus employee, multiple employers, and a terminated worker who still has historical records.

## Files

| File | Mode | Contents |
| --- | --- | --- |
| `sources.md` | reference | URLs and documents fetched this session |
| `evidence.md` | reference | Labeled evidence blocks E1 through E26 |
| `matrix.md` | reference | Convergence and divergence plus source-artifact mapping |
| `lifecycle.md` | explanation | Hire through rehire, valid time versus known time |
| `candidate-laws.md` | explanation | Smallest claims that still fit the evidence |
| `scenarios.md` | explanation | Thirty falsifying scenario cards |
| `open-questions.md` | reference | Residual uncertainty. No invented answers |

## Sibling notes, read only

These paths exist on other branches. This folder cross-links them. It does not write them and does not treat their conclusions as this issue's findings.

- `research/domain/party/` on `cursor/issue-14-domain-cfd8`. Issue 14 owns Person, Organization, LegalPerson, and commercial roles. Party L1 rejects Customer and Supplier as kinds. Party L9 treats Employee as a role even when products store a personnel file. That L9 stays a sibling hypothesis. This folder does not copy it as proof.
- Issue 21 owns journal posting of payroll. Cite it. Do not rewrite accounting notes.
- Issue 22 owns payroll payment and settlement. Cite it. Do not rewrite payment notes.
- `research/identity-kinds-roles/` on issue 3 owns whether Role and Relator become engine categories.
- `research/foundation/principals/` on issue 11 owns Actor, Principal, and grants.
- Corpus branches for ERPNext, Odoo, and formal ontologies are optional context. This session preferred first-party docs.

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

Start with `candidate-laws.md` for the smallest surviving claims. Use `matrix.md` when a later issue asks what source X did with Employee. Use `lifecycle.md` when a later issue asks what happens after Left or Archive. Use `scenarios.md` when a later issue asks what would change the answer.

Do not treat Frappe Employee, Odoo `hr.employee`, or FIBO `Employee` as OS vocabulary. They are observations about other systems.

Person-as-Employee-kind is `rejected`. The person-versus-employee-role encoding, and whether Employment is a native Relator, stay `undetermined` for the engine. Independent first-party sources agree that the enduring individual is a Person and that employment is a dated relationship. They do not agree that Relator must be a kernel primitive.

## Licensing

OS is MIT. These notes extract concepts and documented behavior. No copyleft implementation was pasted or translated into the repo. Odoo and Frappe HR were read as documentation of behavior. FIBO RDF was read for published class names and definitions only. HR-XML was read for published definitions only.
