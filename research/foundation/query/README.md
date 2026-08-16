# Query model, object sets, interfaces, and graph navigation

**Issue:** [#13](https://github.com/EnzoTironi/OS/issues/13)  
**Track:** foundation  
**Fetched:** 2026-08-16  
**Decision:** none. Claims below are `hypothesis`, `supported`, `rejected`, or `undetermined`.  
**Scope:** semantic query capabilities. This folder does not choose a query syntax or a storage engine.

## Question

What semantic query capabilities must exist so humans and agents can ask business questions without depending on storage layout?

A later synthesis agent should be able to answer that from the files in this folder. The backlog list is a summary. The contract used here is the Agent output contract in `docs/swarm-research-backlog.md` (issue 74 had not landed on `origin/main` when this note was written).

## How to read this folder

| File | Contract section |
| --- | --- |
| [sources.md](sources.md) | Sources. Exact pages fetched this session. |
| [evidence.md](evidence.md) | Evidence and source artifacts. Every block is labeled. |
| [matrix.md](matrix.md) | Convergence and divergence as a capability matrix. |
| [examples.md](examples.md) | Inventory availability, supplier risk, overdue commitments, production bottlenecks, financial exposure. |
| [candidate-laws.md](candidate-laws.md) | Candidate laws, counterexamples, runtime pressure, decision state. |
| [open-questions.md](open-questions.md) | Open questions. None of these are written into `docs/open-questions.md`. |

## Overview

Independent query systems already treat "ask a business question" as something other than `SELECT` from a table. Palantir Object Sets, TypeQL, Datalog, SPARQL, Cypher, and Gremlin all let a caller name objects, typed links, and predicates without naming a physical join plan. GraphQL and ObjectQL also hide storage, but they treat the result as a tree or a page of records, not as a reusable set.

The pressure on OS is not "pick Cypher or SQL." The pressure is that the same business question must stay meaningful when the backing store, the surface (UI, API, agent tool), and the caller change. Constitution §6 and thesis "one model, many surfaces" already say storage and surfaces are not sources of meaning. Query is the place that claim is tested.

Three distinctions keep surviving across sources and would falsify a thinner model if they failed:

1. A set of objects can be a value that later filters, traversals, aggregations, actions, and policies consume. A result page is not that value.
2. A shared interface or role lets a query range over unlike types. Enumerating concrete types in every question does not.
3. Valid time, knowledge time, and provenance change the answer to the same predicate. A current-row scan cannot reconstruct S-007 or S-011.

No law in this folder is silently accepted. See [candidate-laws.md](candidate-laws.md).

## What this folder does not do

- It does not choose ObjectQL, TypeQL, GraphQL, Cypher, SPARQL, Datalog, or SQL as OS syntax.
- It does not choose a graph store, a relational store, or a search index.
- It does not edit RFC-0001.
- It does not invent answers for `docs/open-questions.md`.
- It does not copy implementation from copyleft or proprietary systems.

## Decision state snapshot

| Claim | State |
| --- | --- |
| Q1. Sets as first-class values, not only result pages | `supported` |
| Q2. Polymorphic queries through shared interfaces or roles | `supported` |
| Q3. Typed relationship traversal as a query primitive | `supported` |
| Q4. Valid-time and knowledge-time query dimensions | `hypothesis` |
| Q5. Provenance as a query filter, not only an audit log | `hypothesis` |
| Q6. Operational object queries and analytic aggregates are different jobs | `supported` |
| Q7. Named, composable predicates and reusable sets | `supported` |
| Q8. Authorization evaluated at object, property, and (where links carry meaning) link grain | `hypothesis` |
| Q9. Query expressions share semantics with Functions and Policies | `hypothesis` |
| Storage engine or surface syntax is a semantic primitive | `rejected` |
