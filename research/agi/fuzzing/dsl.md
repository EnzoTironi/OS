---
issue: 51
kind: reference
fetched: 2026-08-16
decision_state: hypothesis
---

# Research scenario schema

This is a **research** representation for generated and minimized adversarial scenarios. It is not OS syntax, a runtime API, or a target metamodel.

A runnable reference implementation now lives at [`generator.py`](generator.py), with regression tests in [`test_generator.py`](test_generator.py). The executable tool is intentionally small and stdlib-only: its job is to prove that the recipes can generate, replay, combine and shrink concrete cases without making this schema the OS language.

## Scenario record

```text
scenario:
  id: S-FUZ-NN
  fragment: <candidate ontology fragment or law ids>
  seed: <integer or source scenario>
  dimensions: [D-01, D-12]
  ontology_pin: <revision id or undetermined>
  world: {...}
  timeline: [step, ...]
  oracles: [oracle, ...]
  coverage: {...}
  shrink:
    choices: <replayable generator choices>
    validity: <recipe validity predicates>
  failure:
    state: not-run | passed | failed | undetermined
    typed_as: <contradiction class or none>
    question: <falsifiable research question or none>
```

The choice sequence is one reference shrink representation, not a metamodel requirement. Another generator may use an AST, property-based-testing tree, constraint solver model, or other representation **if** it can regenerate a valid case and preserve the same semantic failure predicate during minimization.

## Step kinds in the reference research schema

| Kind | Research meaning | Must not be confused with |
| --- | --- | --- |
| `Attempt` | a principal tries/proposes/invokes an intervention | the occurrence/result |
| `Observe` | a source asserts or measures something with provenance | accepted operational truth |
| `Occur` | a domain occurrence is taken as established for the scenario | the message that reported it |
| `ExternalUnknown` | an external request left and its outcome is not yet known | business failure |
| `Clock` | a temporal boundary advances | a business mutation by itself |
| `ReviseOntology` | definitions/revision identity change | replaying old history under new rules |
| `Revoke` | authority/delegation is withdrawn | deleting the actor |

These are **fuzz-method step categories**. Their usefulness does not prove they are OS base sorts.

A step may carry `valid_time`, `known_time`, actor, source/provenance, body/parameters and an idempotency key. The generator uses only the temporal dimensions required by each attack; it does not assert that every future OS record must have two time columns.

## Oracle kinds

| Kind | Use |
| --- | --- |
| `invariant` | a required predicate is violated |
| `metamorphic` | a controlled transform should preserve/change a named relation |
| `differential` | two implementations disagree, producing a research question rather than a vote |
| `competency` | the candidate model cannot answer a required semantic question without collapse |
| `unknown-safe` | an ambiguous external outcome was not falsely rewritten as failure/success |

A fully specified deterministic calculation should use an exact invariant/expected-value oracle when one exists. Metamorphic or competency oracles are especially valuable when the test is intentionally under-specified, admits multiple valid solutions, or is about historical/relational behavior rather than one scalar answer.

## Generator contract

The executable reference implementation exposes conceptually:

```text
generate(fragment, recipes, choices) -> scenario
pairwise(recipe_names) -> recipe pairs
shrink_choices(fragment, recipes, choices, failure_predicate) -> smaller choices
```

Properties required of any generator implementation:

1. generated cases satisfy the selected recipes' validity constraints;
2. a saved choice stream/seed can reproduce the case;
3. shrinking regenerates a candidate rather than silently editing the dumped timeline into an impossible state;
4. a minimized case must preserve the caller's **same semantic failure predicate**, not merely remain syntactically failing;
5. the generator keeps occurrence identity, message identity and observation identity distinct where the recipe requires it;
6. pairwise/higher-order composition is possible without turning recipe names into OS primitives.

The reference generator currently implements D-01, D-02, D-04, D-10, D-11, D-12, D-13 and D-14. The remaining recipes in [`dimensions.md`](dimensions.md) are still reusable specifications and can be added incrementally. Issue #51 should remain open only if complete executable coverage of every listed recipe is required; the original reusable-generator deliverable is no longer absent.

## Stale approval semantics

The research generator deliberately supports at least two approval bases:

```text
live-at-commit
frozen-snapshot
```

The law is not `commit always rereads today's world`. The required property is that the proposal/approval declares what state or temporal basis it binds, and commit validates against **that declared basis**. A live-at-commit operation revalidates live assumptions; a contractually frozen proposal may instead validate the identity/integrity of its pinned snapshot plus any non-waivable current constraints.

## Failure → research question

When an oracle fails:

1. regenerate/minimize while preserving the same failure predicate;
2. distinguish source artifact, semantic collapse, temporal/identity ambiguity, authority disagreement and implementation defect;
3. emit one falsifiable question into the owning research issue/artifact;
4. do not silently edit RFC-0001 or promote a primitive.

## This schema refuses

- source-system document names as universal step kinds;
- majority vote across ERPs as truth;
- `timeout == failure`;
- `observation == occurrence`;
- a mandatory universal bitemporal row shape;
- a requirement that OS use this fuzz DSL as its authoring/runtime language.
