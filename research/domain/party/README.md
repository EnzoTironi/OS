---
issue: 14
track: domain
decision_state: hypothesis
contract: docs/swarm-research-backlog.md Agent output contract
swarm_result_contract: absent-on-origin-main
fetched: 2026-08-16
---

# Party, organization, person, and relationship roles

Query this directory for issue 14. Files follow the Wave A output contract in `docs/swarm-research-backlog.md`. `docs/swarm-result-contract.md` is not on `origin/main`.

This folder does not answer `docs/open-questions.md`. It records evidence a synthesis agent can cite. RFC-0001 is untouched.

Each claim is tagged as one of domain evidence, source-system artifact, candidate law, counterexample, or runtime consequence. Decision state is `hypothesis`, `supported`, `rejected`, or `undetermined`. Nothing here is silently accepted.

## Question

What enduring party and organization distinctions survive when Customer, Supplier, Employee, Company, Contact, Address, `res.partner`, Moqui Party, REA Agent, FIBO LegalPerson, and OntoUML Role or Relator are treated as observations rather than tables to copy?

The issue asks seven cuts:

1. Person, Organization, LegalEntity, and BusinessUnit.
2. Customer, supplier, employee, carrier, and competitor as role versus kind.
3. Contacts and addresses as properties, objects, roles, or relationships.
4. Legal entity versus operating entity versus brand or site.
5. Tax registrations and jurisdictional identity.
6. Party merge, split, and deduplication.
7. Employment, supply, and customer relationship lifecycle.

## Files

| File | Mode | Contents |
| --- | --- | --- |
| `sources.md` | reference | URLs and documents fetched this session |
| `evidence.md` | reference | Labeled evidence blocks E1 through E28 |
| `matrix.md` | reference | Convergence and divergence plus source-artifact mapping |
| `fragment.md` | explanation | Proposed canonical party fragment. Concepts, not a schema |
| `edge-cases.md` | explanation | Sixteen falsifying scenarios |
| `candidate-laws.md` | explanation | Smallest claims that still fit the evidence |
| `open-questions.md` | reference | Residual uncertainty. No invented answers |

## Sibling notes, read only

These paths exist on other branches. This folder cross-links them. It does not write them and does not treat their conclusions as this issue's findings.

- `research/identity-kinds-roles/` on `cursor/issue-3-foundation-cfd8`. Issue 3 owns Kind, Role, Phase, Relator identity.
- `research/foundation/principals/` on `cursor/issue-11-foundation-cfd8`. Issue 11 owns Actor, Principal, SoftwareAgent, and grants.
- `research/erpnext/` on `cursor/issue-32-corpus-cfd8`.
- `research/odoo/` on `cursor/issue-33-corpus-cfd8`.
- `research/moqui/` on `cursor/issue-34-corpus-cfd8`.
- `research/fibo/`, `research/ontouml-ufo/`, `research/valueflows-rea/` on `cursor/issue-37-corpus-cfd8`.

## Output contract

1. **Question.** This README.
2. **Sources.** `sources.md`.
3. **Evidence.** `evidence.md`.
4. **Source artifacts.** Marked in `evidence.md` and `matrix.md`.
5. **Convergence.** `matrix.md`.
6. **Divergence.** `matrix.md`.
7. **Candidate laws.** `candidate-laws.md`.
8. **Counterexamples.** `edge-cases.md`.
9. **Runtime pressure.** `candidate-laws.md` and `fragment.md`.
10. **Open questions.** `open-questions.md`.
11. **Decision state.** Each law and this folder. Default is `hypothesis`. Never `accepted`.

## How to read this

Start with `fragment.md` for the candidate cut. Use `matrix.md` when a later issue asks what source X did with Supplier. Use `candidate-laws.md` and `edge-cases.md` when a later issue asks what would change the answer.

Do not treat ERPNext Customer, Odoo `res.partner`, or Moqui `PartyRole` as OS vocabulary. They are observations about other systems.

## Licensing

OS is MIT. These notes extract concepts and documented behavior. No copyleft implementation was pasted or translated into the repo. Odoo and ERPNext were read as documentation of behavior. Moqui docs were read the same way. FIBO RDF was read for published class names and definitions only.
