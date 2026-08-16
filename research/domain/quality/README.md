# Quality domain notes

**Issue:** [EnzoTironi/OS#25](https://github.com/EnzoTironi/OS/issues/25)  
**Track:** domain  
**Fetched:** 2026-08-16  
**Branch:** `cursor/issue-25-domain-cfd8`  
**Contract:** Agent output contract in `docs/swarm-research-backlog.md`. `docs/swarm-result-contract.md` is absent on `origin/main`.

## Question

What real-world distinctions must an executable ontology keep separate when an organization specifies quality, inspects or measures, judges conformity, contains nonconforming output, authorizes release or concession, and later traces or recalls material?

The issue names specification, characteristic, measurement, sampling, inspection plan, acceptance criteria, nonconformance, deviation, quarantine, disposition, rework, scrap, release, certificate, lot genealogy, calibration context, and quality-event provenance.

## How to read this folder

| File | Mode | Contents |
| --- | --- | --- |
| `sources.md` | reference | Exact pages, dates, and licensing posture |
| `evidence.md` | reference | Observed behavior, with kind and decision state on every card |
| `matrix.md` | reference | Convergence and divergence across sources |
| `lifecycle.md` | explanation | Quality as a state machine, not a status field |
| `candidate-laws.md` | explanation | Smallest claims that could be falsified |
| `scenarios.md` | explanation | Adversarial cards, including the six named in the issue |
| `open-questions.md` | reference | Unresolved forks. Cites an artifact or stays undetermined |

Every card labels **kind** as one of `domain evidence`, `source-system artifact`, `candidate law`, `counterexample`, or `runtime consequence`.

Every card labels **decision state** as one of `hypothesis`, `supported`, `rejected`, or `undetermined`. Nothing here is silently accepted. RFC-0001 is not edited.

## Sibling ownership

Do not treat the following as quality primitives to redefine here.

- Inventory hold and quarantine custody live on issue #18.
- Manufacturing execution, scrap quantity, and rework process live on issue #19.
- Lot genealogy and GS1 event shape live on issues #20 and #38. This folder cites CBV inspecting, sampling, conformant, non_conformant, recalled, `cert`, `testprd`, and `testres`. It does not rewrite those folders.

## What is not decided

Two forks stay **undetermined** unless later independent first-party sources agree.

1. Whether a specification and a measurement are the same identifiable thing under two roles, or two identities.
2. Whether an inspection override is a named Action or a Policy that permits a different Action.

No target schema is proposed. Wave B runtime and toolchain recommendations wait.

## Licensing

OS is MIT. ERPNext and Odoo are copyleft. These notes extract concepts and documented behavior only. No implementation was pasted or translated.
