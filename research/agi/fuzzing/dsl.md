---
issue: 51
kind: reference
fetched: 2026-08-16
decision_state: hypothesis
---

# Research scenario schema

This is a proposal for how a swarm writes and shrinks attack scenarios. It is not OS syntax. It is not a target schema. RFC-0001 is not edited.

**Kind.** candidate law about research method, encoded as a schema  
**Decision state.** `hypothesis`

A later agent may store these records as YAML, JSON, or cards. The field names below are research vocabulary. Do not promote them into the metamodel because they appear here.

## Why a schema exists

Generators need a value they can shrink. Reviewers need a value they can query. Induction needs a value that already separates occurrence, observation, and attempt. Seed cards in `scenarios/README.md` are prose. Prose does not shrink. E4.

McKeeman's lesson still applies. A generated case that a human cannot read will be ignored. The schema is the readable form after shrink, not the engine AST.

## Record

```text
scenario:
  id: S-FUZ-NN
  fragment: <ontology fragment or sibling law ids>
  seed: <optional S-00N or sibling card>
  dimensions: [D-01, D-11]
  ontology_pin: <revision id or undetermined>
  world: { parties, resources, locations, policies }
  timeline: [ step, ... ]
  oracles: [ oracle, ... ]
  coverage: { M1: ..., M3: ... }
  shrink:
    choices: <opaque sequence the generator consumed>
    validity: <predicates the generator already enforced>
  failure:
    state: not-run | passed | failed | undetermined
    typed_as: <induction contradiction type or none>
    question: <one sentence for a later research card>
```

Every scenario card in [scenarios.md](scenarios.md) can be rewritten into this record. The prose cards are the human form. This record is the shrink form.

## Step kinds

A step is one of the following. The list is closed for this proposal. A new kind needs a new card, not a silent extra field.

| Kind | Meaning | Must not be stored as |
| --- | --- | --- |
| `Attempt` | A principal tries an action with parameters | an Event |
| `Observe` | A source asserts a claim with provenance | accepted fact |
| `Occur` | An occurrence is taken as established, with valid time and known time | an Attempt |
| `ExternalUnknown` | A request left the system. Outcome is unknown | failed |
| `Clock` | Valid time or known time advances | a mutation of a document field |
| `ReviseOntology` | Definitions change. Historical pins stay | replay under the new rule |
| `Revoke` | Delegation or approval is withdrawn | a deleted principal |

Each step carries:

```text
step:
  id: tN
  kind: Attempt | Observe | Occur | ExternalUnknown | Clock | ReviseOntology | Revoke
  valid_time: <when in the modeled world>
  known_time: <when the system learned it>
  actor: <principal or software agent>
  source: <optional provenance handle>
  body: <parameters or claim>
  idempotency: <optional external key>
```

Two times are required on `Occur` and `Observe`. They may be equal. D-02. Constitution rule 10. Whether OS later makes them native is `undetermined`. `docs/open-questions.md` item 7.

## World facts the generator may not collapse

The world block names facts that shrink must keep distinct if the recipe named them. E3.

Examples, not an OS type list:

- owner versus custodian versus location
- lot identity versus serial identity versus quantity
- leftover demand versus leftover bill versus leftover settle
- offered price versus accepted price versus invoiced price
- claimed date versus promised date versus planned date versus actual date

If a shrink step would merge two of these, the step is illegal and the reducer tries another choice.

## Oracle kinds

An oracle is how the case fails. Chen et al. need this because a single expected number often does not exist. E6.

| Kind | Check | Use when |
| --- | --- | --- |
| `invariant` | A predicate over one world after the timeline | balanced claims, exclusive serials |
| `metamorphic` | A relation between two worlds that differ by a named transform | backdate insert, duplicate drop, currency rate change |
| `differential` | Two source systems, or a source and the candidate fragment, disagree | cancel verb, reservation encoding |
| `competency` | A Gruninger question is unanswerable or answered by collapsing facts | "what did we promise" versus "what happened" |
| `unknown-safe` | Timeout did not become failed | D-12 |

A `differential` miss is not a law failure until typed. E7, E15.

## Generator contract

A reusable generator implements this function:

```text
generate(fragment, recipes, choices) -> scenario
```

Rules:

1. Every emitted scenario satisfies the validity predicates of the recipes.
2. Shrink mutates `choices` and calls `generate` again. It does not edit `timeline` by hand. E4.
3. After a local shortlex minimum, isolation may drop one recipe and regenerate. If the failure disappears, that recipe is the suspect dimension. E5.
4. The reduced scenario must still fail the same oracle kind and the same law id. If the law id changes, the shrink is rejected and recorded as an E3 incident.

No implementation of `generate` lives in this repository. The contract is the deliverable.

## Failure to research question

When `failure.state` is `failed`:

1. Confirm the reduced case still fails the same law. M7.
2. Type the disagreement with induction's list. Homonym, collapsed modality, genuine conflict, implementation accident, missing corpus. E15.
3. Write `failure.question` as one falsifiable sentence.
4. Open or update a card in the owning domain or foundation folder. Do not edit `docs/open-questions.md`. Standing order 8.
5. Leave decision state `hypothesis` until a human reviewer promotes it. Induction L-IND-07.

If the only finding is "ERPNext did X", stop. That is a source-system artifact. It is not a question.

## What this schema refuses

- A target Action or Event type system for OS.
- Workflow, compiler, or pack primitives.
- Executable engine hooks.
- Copying DocType names as step kinds.
- Treating `differential` majority as `invariant`.

Those refusals are part of the hypothesis. A later note that needs an extra step kind should add a card, not grow a hidden runtime.
