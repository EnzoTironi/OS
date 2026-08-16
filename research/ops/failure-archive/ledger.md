# Hypothesis disposition ledger

**Issue:** <https://github.com/EnzoTironi/OS/issues/81>  
**Rule:** this ledger distinguishes a strict falsification from a hypothesis that was merely superseded, withdrawn as an assumption, scope-limited, or not promoted to a semantic primitive.

## Disposition vocabulary

| disposition | meaning |
| --- | --- |
| `rejected/falsified` | evidence defeated the exact scoped claim |
| `superseded` | a later framing replaced it without proving universal falsehood |
| `assumption-withdrawn` | OS stopped using it as a starting assumption |
| `not-promoted` | it did not earn semantic-primitive status; mechanism/pattern may remain useful |
| `scope-limited` | rejected/withdrawn in one scope but still live in another |
| `undetermined` | evidence insufficient |
| `proposed-rejection-under-review` | a sibling research artifact used `rejected`, but adversarial review has not yet established that the exact scoped claim is a strict failure |

## Historical dispositions

| id | hypothesis | disposition | scope | surviving form |
| --- | --- | --- | --- | --- |
| H0 | replace ERP with a modern ERP as the top-level OS product | `rejected/falsified` | top-level product framing | ERPNext/Odoo/etc. remain empirical corpora and possible external systems |
| H1 | ERP transaction authority + operational ontology is the assumed ideal greenfield architecture | `assumption-withdrawn`, `scope-limited` | no longer assumed greenfield ideal | remains a live brownfield integration hypothesis when authority boundaries are explicit |
| H2-PACK | Pack is a semantic/business primitive | `not-promoted` | ontology primitive | module/package/namespace/distribution mechanisms remain open |
| H2-COMPILER | Compiler is a semantic/business primitive | `not-promoted` | ontology primitive | compilation, generation, interpretation and materialization remain open toolchain techniques |
| H2-KERNEL | domain-specific deterministic kernels are separate semantic authorities beneath ontology | `assumption-withdrawn`, `not-promoted` | second business authority | specialized physical evaluators/enforcement mechanisms remain live |
| H3 | Frappe/ERPNext is the assumed greenfield foundation | `rejected/falsified` | assumed foundation in this research program | ERPNext remains a primary corpus; future conformance could still test reuse |

Full scope and revival tests: [`cards/FA-historical-seeds.md`](cards/FA-historical-seeds.md).

## Sibling kill-test candidates

The original Wave A artifact captured many claims from sibling branches that were locally labeled `rejected`. After adversarial review, those labels cannot all be promoted into this strict ledger. Examples:

- issue #55 strongly attacks one **unscoped overloaded global vocabulary**, but does not yet falsify every single-ontology composition strategy;
- issue #56 did not prove absence of pressure for a primitive is equivalent to rejection;
- issue #10/#57 did not universally falsify every semantic Workflow/Process construct;
- issue #59 attacks ubiquitous semantic bitemporal rectangles, not every use of physical/system history;
- issue #60's alleged irreducible truth conflicts often dissolve into different observation types, times, projections or decisions;
- issue #61/#68 do not prove that every existing platform/reuse strategy is inferior; they show no inspected candidate has yet demonstrated a clean pass under the full competency suite;
- issue #72 attacks untracked competing authority, not read-only replication/materialization itself.

Therefore every sibling card remains preserved in [`cards/FA-sibling-rejections.md`](cards/FA-sibling-rejections.md) as a **proposed rejection under review** unless a later review-clean resolution explicitly promotes it here.

A synthesis agent MUST NOT count the number of sibling cards as the number of falsified OS hypotheses.

## Promotion rule for a strict failure

A sibling claim may be added to the strict table only when all are true:

1. the claim is stated with explicit scope;
2. cited evidence or a counterexample defeats that scoped claim;
3. scope narrowing/composition does not rescue the same claim;
4. the adversarial review is represented or resolved;
5. the entry does not infer the truth of the opposite proposition;
6. revival/reconsideration conditions are recorded.

## Non-rule

`A kill test failed to kill X` does **not** imply `not-X is rejected`, nor does it prove X. It leaves X alive under the tested attack.
