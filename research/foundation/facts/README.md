# Facts, claims, and authority when sources disagree

**Track:** foundation  
**Issue:** [#4](https://github.com/EnzoTironi/OS/issues/4)  
**Open question:** [`docs/open-questions.md`](../../../docs/open-questions.md) Q3  
**Decision state:** `undetermined`  
**RFC-0001:** unread as architecture. The Fact candidate there stays a hypothesis.

This folder is Wave A evidence for the information model when sources make incompatible claims. It does not answer Q3. A later synthesis pass should read these notes and keep Q3 open until independent sources converge.

`docs/swarm-result-contract.md` is absent on `origin/main`. The Wave A contract in `docs/swarm-research-backlog.md` is the one used here.

## How to query this folder

| Question | File |
| --- | --- |
| Full Wave A contract in one place | [`wave-a-issue-4.md`](wave-a-issue-4.md) |
| Observation, assertion, claim, decision, derived fact, accepted fact | [`taxonomy.md`](taxonomy.md) |
| Authority by property, context, time, and operation | [`authority-semantics.md`](authority-semantics.md) |
| When disagreement dissolves, and when it does not | [`disagreement-classes.md`](disagreement-classes.md) |
| What would falsify Fact as a kernel type | [`fact-primitive-falsification.md`](fact-primitive-falsification.md) |
| Four dates, two inventories, split supplier, late correction | [`adversarial-cases.md`](adversarial-cases.md) |

## Evidence kinds

Every note tags each finding as one of these kinds.

- **Domain evidence.** A real-world distinction forced by operations, law, or accounting practice.
- **Source-system artifact.** A product mechanism that may not belong in OS.
- **Candidate law.** The smallest claim that would explain the evidence. Always `hypothesis` unless marked otherwise.
- **Counterexample.** A case that would break a candidate law.
- **Runtime consequence.** What a surviving claim would force an engine to enforce.

## Decision vocabulary

Use only `hypothesis`, `supported`, `rejected`, or `undetermined`. Nothing in this folder is silently accepted.

## Licensing

OS is MIT. These notes extract concepts and published behavior. They do not copy implementation.
