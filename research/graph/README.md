# Research graph and disagreement ledger

**Issue:** #75  
**Status:** synthesis infrastructure, not ontology and not architecture.  
**Primary evidence:** human-readable files under `research/`.  
**Wave A source snapshot:** `research/wave-a-2026-08-16` at `53235fc5b8fb723e84351435ccfad719e784d5ba`.

This folder makes the research corpus **queryable without making the index authoritative**.

The graph answers navigation/synthesis questions such as:

- which artifacts/issues discuss a concept or candidate law?
- which evidence records explicitly support a local candidate law?
- which counterexamples challenge it?
- which issues/artifacts remain `challenged` by adversarial review?
- which grandfathered v1 shards contain open disagreements?
- which domains/corpora put pressure on the same semantic distinction?

It does **not** answer automatically:

- which candidate law is true;
- which primitive OS should adopt;
- whether two labels from different domains mean the same concept;
- whether a majority of ERPs establishes domain truth;
- whether a `review-clean` artifact is an accepted architecture decision.

## Why this is deliberately lightweight

Wave A generated many useful Markdown artifacts with inconsistent local structures because the research contract itself evolved while agents were working. Rewriting all of that research into one database would destroy history and create a new knowledge-platform project before the semantics are stable.

The design therefore has two layers:

```text
human-readable research (primary evidence)
        ↓
derived graph/index (navigation + synthesis aid)
```

The graph can be deleted and rebuilt. The research cannot.

## Files

| Path | Role |
| --- | --- |
| `schema.json` | structural schema for the derived graph |
| `build_graph.py` | scans Markdown and existing v1/v2 index shards |
| `normalize_graph.py` | propagates adversarial review state and materializes grandfathered disagreement edges |
| `review-overrides.json` | post-review resolutions for blockers fixed during Wave A integration |
| `validate_graph.py` | checks graph integrity, snapshot pin, review visibility and disagreement targets |
| `query.py` | small CLI for search/filter/why/pressure/review queries |
| `test_graph.py` | regression fixture for support/challenge/disagreement/review semantics |
| `build_wave_a.sh` | reproducible build from a detached worktree pinned to the frozen Wave-A SHA |
| `generated/` | derived output; never primary evidence |

## Reproducible Wave A build

Run from a git checkout that contains this toolchain:

```bash
bash research/graph/build_wave_a.sh
```

The script:

1. creates a detached temporary worktree at exact SHA `53235fc5b8fb723e84351435ccfad719e784d5ba`;
2. verifies the worktree HEAD;
3. injects only the post-review override metadata needed by the indexer;
4. builds the graph from the frozen corpus;
5. normalizes grandfathered v1 disagreement/review information;
6. validates graph structure and snapshot identity;
7. writes `research/graph/generated/wave-a-graph.json` on the synthesis checkout;
8. deletes the detached worktree.

This prevents a subtle reproducibility bug: **the builder must not claim a Wave-A SHA while scanning newer Wave-B files from the current branch.**

## Run regression tests

```bash
python3 -m unittest -v research/graph/test_graph.py
```

The fixture verifies:

- explicit evidence → candidate-law support edges;
- counterexample → candidate-law challenge edges;
- v1 disagreement materialization with two targets;
- issue-level review resolution propagation;
- `review-clean` does not mutate a candidate law's `epistemic_state`;
- validator acceptance of the normalized fixture.

A green test run is execution evidence. Merely having `test_graph.py` in the repo is not.

## Query examples

After building:

```bash
# All challenged issue/artifact/review nodes
python3 research/graph/query.py reviews challenged

# Search labels/notes/topics
python3 research/graph/query.py search supplier
python3 research/graph/query.py search bitemporal

# Candidate-law/concept/runtime-pressure nodes containing a term,
# plus directly connected support/challenge/disagreement/review edges
python3 research/graph/query.py pressure role
python3 research/graph/query.py pressure authority

# Inspect one exact node and its neighborhood
python3 research/graph/query.py why 'record:research/notes/issue-0007-action-event-effect.md#L-001'

# Filter by issue/type/review state
python3 research/graph/query.py nodes --issue 7
python3 research/graph/query.py nodes --type disagreement
python3 research/graph/query.py nodes --review-status challenged
```

## Review semantics

Wave A contains internal labels such as `supported` and `rejected` that were later narrowed by adversarial review.

The graph preserves **two independent dimensions**:

```text
epistemic_state     what the research artifact claimed about the proposition
review_status       whether the integration review challenged/cleared the artifact
```

A node can therefore legitimately be:

```text
epistemic_state: supported
review_status: challenged
```

That means:

> the original research argued for the claim, but synthesis must not consume it as settled because the adversarial review found a material problem.

Likewise:

```text
review_status: review-clean
```

means the blocker/review representation is clean. It does **not** mean `accepted`.

Architecture adoption belongs to RFC/ADR/governance state on `main`, not this graph.

## Grandfathered Wave A artifacts

Some early Wave A agents produced schema-v1 index shards before result-contract v2 existed. The graph builder does not force those authors to rewrite history.

Instead:

- v1 shards are treated as locators;
- their artifact-level `decision_states` are **not copied onto every child record**;
- explicit v1 disagreements are materialized by the normalization pass;
- adversarial review status is applied independently;
- new work should follow `docs/swarm-result-contract.md` v2.

## Cross-artifact semantic identity is intentionally conservative

The graph does **not** automatically merge:

```text
research/domain/hr/...#Role
research/domain/party/...#Role
research/formal-ontology/...#Role
```

because same word does not prove same semantic concept.

Cross-artifact identity/equivalence itself is a research result and should be represented through explicit synthesis records/edges. Automatic lexical entity resolution would recreate the exact `successful join == identity truth` error that the HF reality check rejected.

## How #70 should consume this

A synthesis agent should:

1. start with the frozen snapshot identifier;
2. inspect `review_status` before counting support;
3. prefer independent source/domain families over duplicate citations;
4. preserve open disagreements and scope-narrowed resolutions;
5. distinguish a semantic distinction from a proposal that the distinction become a base primitive;
6. attempt composition/reduction before promoting a primitive;
7. cite the underlying human-readable artifact for every important conclusion;
8. treat the graph as an **index**, never as proof.

For example, if five domain artifacts contain candidate laws involving roles but three are `challenged`, #70 must not report “five independent domains prove native Role.” It should reopen the actual evidence and ask what common semantic pressure survives all five.

## Updating after Wave A

Do not move the frozen branch.

For future waves:

- freeze a new explicit snapshot SHA;
- build a separate derived graph or add a snapshot dimension;
- never silently mutate a Wave-A graph to reflect later evidence;
- represent later resolution with `supersedes`, `challenges`, `supports`, or a new synthesis record.

This keeps our research history reproducible instead of turning one `research.json` file into a mutable current truth.

## Non-goals

This is not:

- RDF/OWL adoption;
- a graph database choice;
- a replacement for Git history;
- a new OS metamodel;
- a reason to normalize every research note;
- a scoring/voting system for architecture;
- an agent memory store.

If a JSON graph stops being useful, replace the derived tooling. The evidence and its citations survive.
