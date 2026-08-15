---
issue: 3
track: foundation
decision_state: hypothesis
contract: docs/swarm-research-backlog.md Agent output contract
swarm_result_contract: absent-in-worktree
---

# Identity, kinds, roles, phases, and relators

Query this directory for issue 3. Files follow the Wave A output contract in `docs/swarm-research-backlog.md`. `docs/swarm-result-contract.md` was not in this worktree. PR 84 was still open and unmerged when this was written.

Each claim is tagged as one of domain evidence, source artifact, candidate law, counterexample, or runtime consequence. Decision state is `hypothesis`, `supported`, `rejected`, or `undetermined`. Nothing here is silently accepted.

## Files

- `issue-3-result.md` is the contract record. Question, sources, convergence, divergence, runtime pressure, open questions, and the Role, Relator, Phase recommendation live there.
- `concept-matrix.md` compares UFO, Palantir, ERPNext, Odoo, ValueFlows, and FIBO on the same distinctions.
- `candidate-laws.md` states the smallest claims that still fit the evidence, with a falsifier for each.
- `counterexamples.md` lists twelve cases that try to break those claims.

## How to read this

Start with the recommendation in `issue-3-result.md`. Use the matrix when a later issue asks "what did source X do with Supplier." Use the laws and counterexamples when a later issue asks what would change the answer.

Do not treat ERPNext Customer or Palantir Object Type as OS vocabulary. They are observations about other systems.
