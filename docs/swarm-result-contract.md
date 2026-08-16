# Swarm result contract

**Status:** research contribution contract v2.  
**Scope:** research branches/corpora, not OS architecture.

This contract exists so a large swarm can compose evidence without silently turning observations, hypotheses, experiments, reviews, and governance decisions into the same kind of thing.

Wave A began before this contract existed. **Existing Wave A artifacts are grandfathered.** They do not need to be mechanically reformatted. Issue #75 may index them later. New research and substantive revisions should follow v2 unless a narrower issue contract says otherwise.

## 1. Read before researching

At minimum read:

- the assigned issue and linked dependencies;
- `docs/constitution.md`;
- `docs/thesis.md`;
- `docs/hypothesis-history.md`;
- `docs/open-questions.md`;
- `docs/swarm-research-backlog.md`;
- relevant existing `research/` artifacts;
- `research/reviews/wave-a-review-ledger.md` when consuming Wave A.

Repository hypotheses are constraints/context, **not evidence** for themselves.

## 2. Durable output beats issue prose

A completed investigation must land durable material under `research/`. The exact folder is chosen by the workstream (`research/domain/...`, `research/foundation/...`, `research/<corpus>/...`, `research/kill/...`, `research/ops/...`, etc.). v2 deliberately does **not** force every artifact into `research/notes/` because Wave A demonstrated that bounded folders are often more readable.

The primary artifact should state:

1. **Question** — one bounded uncertainty or attack.
2. **Source scope** — exact repositories/versions/commits/docs/standards/data examined and important omissions.
3. **Evidence/observations** — what the source actually says/does.
4. **Interpretation** — domain distinction or candidate explanation, clearly separated from observation.
5. **Source-system artifacts** — schemas/names/workflows likely local to a product.
6. **Convergence/divergence** — independent support and disagreements.
7. **Candidate laws** — smallest falsifiable generalizations, with scope.
8. **Counterexamples/falsifiers** — cases that could narrow/defeat the law.
9. **Runtime pressure** — capability/enforcement implied *if* the law survives, without selecting technology.
10. **Open questions** — unresolved uncertainty.
11. **Licensing/provenance** — especially when studying copyleft code or private real-company evidence.

Stable local IDs (`E-`, `L-`, `X-`, etc.) are encouraged when they improve cross-linking, but the **kind of record matters more than the prefix**.

## 3. Separate five different state systems

Wave A proved that one universal `decision_state` enum is insufficient.

### 3.1 Artifact kind

Examples:

- observation/evidence;
- concept/model hypothesis;
- invariant/candidate law;
- counterexample;
- disagreement;
- experiment;
- review finding;
- governance decision;
- historical disposition.

### 3.2 Epistemic state — for claims

Use when a proposition can be true/false within a stated scope:

- `hypothesis`
- `supported`
- `rejected`
- `undetermined`

`Supported` means the cited evidence materially supports the **scoped** claim. It does not mean “accepted architecture,” and absence of a known counterexample is not by itself support.

`Rejected` means evidence defeats the exact scoped claim. It does **not** prove the opposite proposition.

### 3.3 Evidence status — for observations/evidence

Evidence is not itself a hypothesis. Track whether it is observed/verified/disputed/retracted/not-evaluated and preserve its source/provenance. Formal/academic/legal sources are evidence families, not product “decision states.”

### 3.4 Experiment/result state

Tests and experiments need execution/result state (e.g. not-run/passed/failed/inconclusive) separate from the epistemic state of the law they attack.

### 3.5 Governance/adoption state

Architecture/RFC/ADR decisions use a separate state such as:

- `proposed`
- `accepted`
- `superseded`
- `challenged`

An accepted design can still be uncertain empirically. **Adoption is not truth.** Raw research must never mark itself accepted merely because it landed in `research-corpus`.

Historical research additionally uses dispositions such as `assumption-withdrawn`, `not-promoted`, or `scope-limited`; these must not be rewritten as `rejected` unless the exact claim was actually falsified.

## 4. Evidence kinds

Use the closest evidence family and give an exact locator:

- `implemented-code` — source behavior/structure at an immutable revision;
- `test` — executable expected behavior or a recorded test result;
- `observed-execution` — command/run and durable output;
- `official-doc` — project/vendor/regulator documentation;
- `formal-spec` — standards/ontology/specification text;
- `academic-source` — paper/research result;
- `primary-law` — statute/regulation/official legal text;
- `real-company-evidence` — safely handled operational data/interview/process evidence;
- `design-claim` — issue/RFC/maintainer rationale/intended design;
- `inference` — researcher's interpretation from cited premises.

These are **types, not a confidence ranking**. A test can be narrow, a law can change, and an official document can be stale.

Every material factual statement should carry enough locator/version/date information for another agent to recheck it.

## 5. Independence and convergence

“Two sources agree” is useful only when their independence is understood. Forks/shared implementations, standards copied into products, or multiple docs from one authority do not count as independent families merely because they have different URLs.

Multiple independent sources increase evidence strength, but they are **not a universal admission gate**. A jurisdiction-specific rule may have one authoritative legal source; a rare domain law may first appear in one production system. Record the scope and evidence strength rather than inventing a binary rule.

## 6. Disagreements are first-class

Do not edit one artifact to make it agree with another.

A disagreement should identify:

- the exact two claims/observations;
- whether the conflict is behavior, terminology, scope, temporal version, identity grain, authority, or interpretation;
- evidence for both;
- a test/observation that could resolve or narrow it;
- status: `open`, `resolved`, or `scope-narrowed`.

Many apparent conflicts disappear after scope/identity/time is corrected. Preserve that resolution history.

Adversarial reviews are themselves durable research evidence. For Wave A, `research/reviews/wave-a-review-ledger.md` overrides any naive reading of an internal `supported/rejected` label until the challenge is resolved.

## 7. Research index shards

`research/schema/research-index.schema.json` v2 defines a **locator/index**, not the evidence database.

- Human-readable research remains primary.
- A real shard uses `kind: "shard"` and contains **exactly one entry**.
- `research/index/_empty.json` is the only canonical empty sentinel and uses `kind: "sentinel"` with zero entries.
- Artifact paths may point anywhere under `research/`.
- Index records can carry separate epistemic, historical, governance, evidence, and review state when appropriate.
- The index must preserve open disagreements and adversarial-review status.

Wave A artifacts are grandfathered and may initially lack v2 shards. Issue #75 owns normalization/index generation; do not rewrite good research solely to satisfy the index schema.

## 8. Review/promotion gates

Landing in `research-corpus` means **preserved evidence**, not approval.

A research artifact may land while `challenged` when the challenge is itself durably represented and synthesis will see it. It should not be treated as reliable/complete when `blocked-factual` or `blocked-deliverable` remains unresolved.

Only an explicit synthesis/RFC/ADR/governance process may promote a research conclusion to `main` as normative. If a research convention itself becomes normative (for example decision-discipline rules), promote a small reviewed artifact rather than the whole raw research tree.

## 9. Child issues

Open a new issue only for a genuinely new, independently researchable uncertainty whose answer could change a law/model/runtime requirement. Do not create issues merely for missing citations, disagreements that fit the current scope, or bookkeeping.

## 10. Forbidden shortcuts

Do not:

- map a source table/class/DocType directly into OS ontology because it exists;
- promote source behavior to universal law without stating scope;
- infer `not-X` because X was rejected;
- infer “rejected” from lack of supporting evidence;
- treat implementation reuse/licensing as evidence that a semantic claim is true or false;
- overwrite contradictory observations with a winner merely for convenience;
- hide inference under a stronger evidence kind;
- treat merge to `research-corpus` as architecture acceptance;
- edit RFC-0001 from a research task unless the synthesis issue explicitly owns that proposal.

## 11. Completion checklist

Before calling a research issue complete:

```markdown
- [ ] Question and scope are explicit.
- [ ] Sources/versions/commits/dates are reproducible.
- [ ] Observation is separated from inference.
- [ ] Candidate laws are scoped and falsifiable.
- [ ] Counterexamples/disagreements are preserved.
- [ ] Evidence kind/status is appropriate.
- [ ] Claim epistemic state is not confused with governance adoption.
- [ ] Adversarial review findings are incorporated or represented as open disagreement.
- [ ] Required issue deliverables are actually present (including executable tools when requested).
- [ ] Licensing/privacy/provenance constraints are recorded.
- [ ] Nothing is silently promoted to normative architecture.
```

This contract is itself revisable. If later research shows the contract causes information loss or bureaucracy without synthesis value, change it through the same evidence/review discipline.
