# How to record a research decision

These rules are for agents writing OS research. They are not OS primitives. They are not on `main` yet. Follow them on this exclusive tree and on later notes that adopt the same folder.

If a rule and `docs/open-questions.md` collide, leave the open question `undetermined`.

## Pick two fields, not one

Every record has a kind and a verdict.

Write the verdict only in `Decision state`.

Do not put a kind name in `Decision state`.

Kinds already in use:

- observation, written as an `E-ID` evidence record
- concept, `C-ID`
- invariant, `I-ID`
- candidate-law, `L-ID`
- counterexample, `X-ID`
- disagreement, `D-ID`
- runtime-consequence, `R-ID`
- candidate-model, an RFC or a model fragment
- experiment, a scenario card or a recorded counterexample run

Later document statuses, never Wave A verdicts:

- proposed
- accepted
- superseded

Constitution RFC statuses that are not Wave A verdicts:

- investigating
- challenged

## Write the verdict

Allowed values on a research record:

- `hypothesis`
- `supported`
- `rejected`
- `undetermined`

Meanings:

- `hypothesis` if the claim is falsifiable and not yet earned
- `supported` if cited evidence holds inside the stated scope and no recorded counterexample defeats it
- `rejected` if cited evidence or a counterexample defeats the claim
- `undetermined` if evidence is absent, thin, or in unresolved conflict

Never write `accepted` on a file under `research/`.

If the claim is only a process rule, say `supported` as a coordination rule. Do not let that sentence become an ontology primitive.

`supported` is corroboration. It is not verification. Keep a falsifier on the record.

## Move between verdicts

Change the verdict only when the evidence column is present. Append the new evidence. Do not delete the old verdict history.

| From | To | Required evidence |
| --- | --- | --- |
| none | `hypothesis` | A falsifiable statement and a named falsifier |
| `hypothesis` | `supported` | At least one `E-ID`. No open defeating `X-ID`. For a domain law, independent convergence or a narrower scope sentence |
| `hypothesis` | `rejected` | An `E-ID` or `X-ID` that defeats the claim in its stated scope |
| `hypothesis` | `undetermined` | Missing evidence, a weak grade, or an open `D-ID` |
| `supported` | `rejected` | A new defeating `X-ID` or `E-ID` |
| `supported` | `undetermined` | A new open `D-ID` the claim cannot absorb by narrowing |
| `supported` | `hypothesis` | A written reason that scope grew or supporting `E-IDs` were withdrawn |
| `rejected` | `hypothesis` | A revival condition from issue 81, plus a new scope or new evidence |
| `rejected` | `undetermined` | The defeating evidence is itself challenged by an open `D-ID` |
| `undetermined` | `hypothesis` | A falsifiable statement and a named falsifier now exist |
| any Wave A verdict | `accepted` | Forbidden |

If none of the rows match, leave the verdict `undetermined` and open a `D-ID`.

## Keep conflicts

If two claims cannot both be true in the same scope, open a `D-ID`.

Link both record IDs.

Keep both evidence sets.

Leave `Status: open` until a resolution test runs.

Do not edit the other note to make it agree.

Do not average the two claims into a third undocumented claim.

Do not delete the losing claim after resolution. Append the resolution evidence.

## Represent the same fact on issues, RFCs, and notes

On a GitHub issue:

- Own a question
- Link the durable file
- Do not treat `open` or `closed` as a verdict
- Do not close the issue with only thread prose

On a research note:

- Use the four verdicts on each `C`, `I`, `L`, `X`, and `R` record
- Use `E` records for observations
- Use `D` records for conflicts

On an RFC:

- Write `Status` from constitution section 17
- Write `Decision: none` until a later accepted-decision document exists
- Do not edit RFC-0001 from a research result unless independent sources converge and a later brief says so

On a later accepted-decision document, if one is ever written:

- Use kind `accepted-decision`
- Keep the old RFC or ADR and mark it `superseded` with a pointer to the replacement
- Fill every required field in `decision-record.schema.json`
- Name falsification conditions that a later agent can run
- Name revisit conditions
- Point at the Wave A records that synthesis consumed

Do not create `docs/adr/` from this issue. Whether ADRs are needed besides RFCs is `undetermined`.

## Map the extra constitution words

If an RFC is `investigating`, write related note records as `hypothesis` or `undetermined`.

If an RFC is `challenged`, keep the claim and open a `D-ID`.

If an RFC is `superseded`, keep the file and point at the replacement.

## Refuse these promotions

Do not treat a candidate model as architecture.

Do not treat an experiment run as `supported` unless the run is cited and the claim's falsifier was stated first.

Do not treat `supported` as `accepted`.

Do not treat research-ops `accepted` as domain Accepted Fact.

Do not treat experimental implementation from `docs/research-program.md` as a permanent primitive.

## Check before you stop

- [ ] Each record has a kind and a verdict
- [ ] `Decision state` is one of the four Wave A values
- [ ] No research file uses `accepted`
- [ ] Domain evidence, source-system artifact, candidate law, counterexample, and runtime consequence are labeled
- [ ] Open disagreements still have both claims
- [ ] `docs/open-questions.md` was not answered from intuition
- [ ] RFC-0001 was not edited
- [ ] New files sit only under `research/ops/decision-discipline/` when this issue is the writer
