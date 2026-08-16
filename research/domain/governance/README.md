# Governance, risk, compliance, approval, exception, and control

**Issue:** [#67](https://github.com/EnzoTironi/OS/issues/67)  
**Track:** domain  
**Fetched:** 2026-08-16  
**Decision:** none. Every card below and in sibling files carries its own decision state.

## Question

What real-world distinctions exist among risk, control, policy obligation, approval, exception/waiver, segregation of duties, limit, case, finding, evidence, attestation, freeze, remediation, control testing, and regulation effective dates? Which of those are business objects with identity and lifecycle, and which are only runtime authorization decisions?

This folder attacks that question. It does not design an OS schema. It does not pick Cedar or OpenFGA as a kernel. It does not reopen workflow-as-kernel as silently accepted. RFC-0001 `Policy` as a primitive stays a hypothesis.

## How to read

| File | What it holds |
| --- | --- |
| `sources.md` | First-party documents fetched this session, with retrieval status |
| `evidence.md` | Observed distinctions, each tagged Kind and Decision |
| `matrix.md` | Concept-by-source convergence and divergence |
| `lifecycle.md` | State machines forced by the sources, not invented for OS |
| `candidate-laws.md` | Smallest falsifiable claims, none silently accepted |
| `scenarios.md` | Adversarial cards, including the five the issue named |
| `open-questions.md` | Unresolved items. Cites this folder or marks undetermined |

Kind values used throughout:

- `domain evidence`
- `source-system artifact`
- `candidate law`
- `counterexample`
- `runtime consequence`

Decision values used throughout:

- `hypothesis`
- `supported`
- `rejected`
- `undetermined`

`accepted` does not appear.

## Standing cross-links

Principals, delegation, `as` versus `on behalf of` belong to issue #11. CRM case and SLA clocks belong to issue #27. Fiscal filing calendars belong to issue #30. This folder cites those boundaries. It does not rewrite them.

## What this folder does not decide

Whether OS `Policy` is the same identity as a GRC policy object. Independent first-party sources agree that runtime allow/deny and GRC objects are different *jobs*. They do not agree on one shared identity. That identity question stays `undetermined`. See `candidate-laws.md` L-01 and `open-questions.md` Q-G01.

Whether a workflow engine is a semantic primitive. Recurring project rejection. See L-12.

Whether Cedar, OpenFGA, or OPA should sit in the OS kernel. Wave B. See L-13.
