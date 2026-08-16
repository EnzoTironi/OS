# Kill test. Fact and bitemporal over-generalization

**Track:** kill  
**Issue:** https://github.com/EnzoTironi/OS/issues/59  
**Parent:** https://github.com/EnzoTironi/OS/issues/2  
**Open questions:** `docs/open-questions.md` Q2, Q6, Q7. This folder does not close them.  
**Decision state:** the two over-generalizations are `rejected`. Placement of remnants is `hypothesis` or `supported` per card.  
**Retrieved:** 2026-08-16  
**Contract used:** `docs/swarm-research-backlog.md` Agent output contract. `docs/swarm-result-contract.md` was not in the tree.

This folder attacks two attractive claims.

1. `Fact` is the fundamental information unit.
2. Bitemporality is a pervasive semantic requirement.

It does not design a store. It does not edit RFC-0001. Sibling notes on issues 4 and 5 were read with `git show` and are not copied here.

## How to query this folder

| File | What a synthesis agent should read it for |
| --- | --- |
| [`wave-a-issue-59.md`](wave-a-issue-59.md) | Full output contract on one page |
| [`sources.md`](sources.md) | Exact documents, URLs, and retrieval dates |
| [`criteria.md`](criteria.md) | Native, optional, compositional, or rejected |
| [`domain-map.md`](domain-map.md) | Domain-by-domain placement |
| [`fact-decomposition-harm.md`](fact-decomposition-harm.md) | Where fact atoms harm identity, invariants, writes, or cost |
| [`bitemporal-scope.md`](bitemporal-scope.md) | Where dual time adds no value, or belongs only to selected properties |
| [`absence-impossible.md`](absence-impossible.md) | Where missing time or history makes explanation impossible |
| [`candidate-laws.md`](candidate-laws.md) | Smallest claims, each with a decision state |
| [`counterexamples.md`](counterexamples.md) | Adversarial cards that would flip a law |

## Kind key

Every claim in this folder is one of these kinds.

- **domain evidence.** A distinction the world keeps forcing.
- **source-system artifact.** A product or schema choice.
- **candidate law.** The smallest claim that still fits more than one source.
- **counterexample.** A case that would kill or bound a law.
- **runtime consequence.** What an engine would have to enforce if the law survives.

Decision states are `hypothesis`, `supported`, `rejected`, or `undetermined`. Never `accepted`.

## Verdict in one paragraph

A generic Fact row is a useful interchange shape and a bad kernel default. Independent systems store objects, documents, events, datoms, or ledger rows, then reconstruct current state. They do not converge on Fact as the write unit. Dual time is two real questions in selected domains. It is not a rectangle on every property. SQL:2011 makes both axes opt-in per table. SQL Server ships only system time. Datomic ships only transaction time. XTDB puts both axes on every table and still says most queries look atemporal. Ledger domains need append-only correction, not `FOR PORTION OF VALID_TIME` rewrite. Pricing, display names, and sensor points do not earn both clocks.

RFC-0001 is unchanged. Q2 and Q7 stay open as architecture questions. This kill test only removes the "everywhere" reading.
