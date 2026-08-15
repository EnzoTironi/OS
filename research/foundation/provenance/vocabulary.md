# Minimal provenance vocabulary candidate

**Decision state:** `hypothesis`  
**Kind key:** domain evidence, source-system artifact, candidate law, counterexample, runtime consequence.  
**Does not settle:** `docs/open-questions.md` Q8.

This is a typed role set for two questions.

1. Why does OS believe this?
2. Why was this Action allowed?

It is not a primitive list for RFC-0001. Several roles may later collapse into Fact, Action, Function, or Policy. Constitution article 1 still applies. A role earns a kernel slot only if composition cannot enforce the explanation.

## Overview

The compared systems already split four relations that ERP audit fields often smash together. A source artifact is the thing consulted. An actor is who is responsible. An activity is what ran. A derivation is how a new assertion depends on older ones. Lineage products stop at dataset ancestry. Operational systems add a second record for the decision itself. OS needs both graphs if it wants both sentences.

PROV-O is the interchange map. It is not the object model. Issue 37 already rejected `prov:Entity` as ObjectType. This note keeps that rejection.

## Key concepts

These names are local to this folder. They are not OS types.

### SourceArtifact

A versioned thing that can be used. A dataset snapshot, a signed invoice image, a prior Fact, a sensor reading, a committed Economic Event.

PROV map. `prov:Entity`, optionally `prov:hadPrimarySource`.

OpenLineage map. Dataset plus `version` facet.

Illegal state. A live mutable row used as if it were a frozen artifact. PROV-CONSTRAINTS treat entity attributes as fixed aspects. A later value is a new artifact, linked by revision or specialization.

### Actor

Someone or something that bears responsibility. Person, organization, software agent, service.

PROV map. `prov:Agent`, `prov:wasAttributedTo`, `prov:wasAssociatedWith`, `prov:actedOnBehalfOf`.

Palantir map. Multipass `UserId` on an action log. That is a source-system artifact. The domain distinction is responsibility.

Open question Q11 stays open. Actor is not yet Principal. Delegation may need both the acting agent and the authorizing agent, which is exactly `actedOnBehalfOf`.

### Activity

A timed occurrence that uses and generates artifacts. Function evaluation, Action invocation, pipeline run, count, correction posting.

PROV map. `prov:Activity`, `prov:used`, `prov:wasGeneratedBy`, `prov:wasInformedBy`.

OpenLineage map. Job is the definition. Run is the activity instance. That Job/Run split is worth keeping even if OS names it Function revision versus evaluation.

Palantir map. One Action submission. Also one dataset build.

Illegal state. Using Activity as the business ObjectType for a person or an order. Constraint 57. Entity and activity identifiers must not overlap.

### Derivation

An edge from a new artifact to prior artifacts. The activity may be omitted when it is unknown. PROV allows that. OS should treat omission as a hole in the explanation, not as a normal happy path for governed Facts.

PROV map. `prov:wasDerivedFrom`, `prov:wasRevisionOf`, `prov:wasQuotedFrom`.

DataHub map. Upstream URN to downstream URN, optional column paths, optional query node.

Candidate law L-001, L-004.

### Evidence

A SourceArtifact that an Activity actually used when forming a belief or a DecisionRecord.

PROV map. `prov:used`. Expanded `prov:hadPrimarySource` when the artifact is firsthand.

Palantir map. Optional uneited context properties on an action log. Edited primary keys alone are not the evidence that justified the close.

Illegal state. Attaching every file in the warehouse to a Fact as "evidence" without a use edge. L-006.

### Confidence

A quality or uncertainty estimate. Score, interval, model posterior, data-quality assertion, recency.

OpenLineage map. `dataQualityMetrics` and `dataQualityAssertions` facets.

PROV map. None in the core. Trust assessment is why provenance exists, and it sits outside the triples.

Illegal state. `{ confidence: number, thereforeWritable: true }`. L-003. Brand Confidence so it cannot be passed to a Policy allow function unless a human-written rule names that use.

### DecisionRecord

Why an Action was allowed or denied.

Minimum payload that the sources force.

- Principal and any delegation chain
- Action type and Action type revision
- Ontology revision
- Policy revision
- Function revision when a Function backed the Action
- Declared write-set
- Evidence actually consumed
- Bound parameters and bound assumptions
- Clock used for staleness
- Outcome. Allowed, denied, or unknown-external

Palantir map. Action log object. `@Edits` declared write-set. Action type version auto-increments.

ERPNext map. Submit permission plus later cancel or amend documents. Weaker on bound assumptions.

Ontologiq, from `research/reference-landscape.md`, not re-verified in this pass. Propose, approve, re-read, execute. Session context only.

Illegal state. An allow DecisionRecord that cannot name the policy revision. An applied Function edit with no Action wrapping it. Palantir docs say the helper run does not mutate. Only the Action does.

### ExplanationGraph

Two queries over the same nodes.

Belief query. Walk Derivation and usage and generation until the displayed value is accounted for, including Function identity.

Permission query. Start at the DecisionRecord. Show principal, pinned revisions, evidence, write-set, outcome.

Source-system artifact. Palantir Data Lineage UI, DataHub hop search, Workshop action-log timeline. Those UIs are not the semantic graph.

### RetentionClass

How long a node or an identifier may remain, and what redaction is allowed.

GDPR map. Art. 5(1)(e) purpose-bound storage. Art. 17 erasure. Art. 17(3) exceptions for legal obligation and legal claims.

Palantir counterexample. Disable edit history deletes the graph. Current-state ACL implies full-history ACL.

ERPNext pressure. Closed period blocks silent rewrite. That is retention of fiscal evidence, not personal-data law.

Illegal state. Delete the DecisionRecord because a person's name must go. Redact the name. Keep the edge if a legal basis still requires the act.

## How it works

A displayed stock quantity is a projection. The belief graph names the movements, counts, and Functions that produced it. Each movement is a SourceArtifact generated by an Activity attributed to an Actor. A forecast Function that used the same movements produces a different artifact with a different type. The permission graph for `IssueStock` names the DecisionRecord. It cites the policy that required an accepted count, the evidence used, and the write-set `{ StockLedger }`. Confidence on the forecast never enters that allow function unless a named rule says so.

A later correction adds a new SourceArtifact with a `corrects` or reversal derivation. The old artifact stays. Belief queries as-of knowledge time can hide it. Belief queries as-of audit time must still show it. Q7 stays open on the exact time dimensions.

## PROV-O mapping

Use this table for export and for reading foreign provenance. Do not adopt the left column as ObjectType names.

| Candidate role | PROV-O | Use in OS research | Do not import |
| --- | --- | --- | --- |
| SourceArtifact | `prov:Entity` | Versioned thing with fixed aspects | Entity as the object metamodel |
| Actor | `prov:Agent` | Responsibility | Agent as a unique OS primitive. Q11 |
| Activity | `prov:Activity` | Function eval, Action invocation, run | Activity as Person or Order |
| Derivation | `prov:wasDerivedFrom` | Fact to prior facts | Derivation without inputs as a complete explanation |
| Evidence consumption | `prov:used` | DecisionRecord and derived Fact | Qualified-influence OWL pattern as kernel |
| Generation | `prov:wasGeneratedBy` | Activity produced this artifact | Instantaneous implicit events as UX |
| Attribution | `prov:wasAttributedTo` | Artifact responsibility | |
| Association | `prov:wasAssociatedWith` | Activity responsibility | |
| Delegation | `prov:actedOnBehalfOf` | Both agents remain responsible | |
| Primary source | `prov:hadPrimarySource` | Firsthand record | |
| Revision | `prov:wasRevisionOf` | Correction without VF `corrects` | |
| Invalidation | `prov:wasInvalidatedBy` | End of an artifact | Palantir-style identifier reuse after delete |
| Bundle | `prov:Bundle` | Provenance of provenance | Bundle as business Pack |

Issue 37 comparative `L-005` said export and validate PROV. This table is that mapping for issue 6. It is not a second copy of the issue 37 file.

## Where things live

Research only.

- This folder. Vocabulary and laws.
- `docs/open-questions.md` Q8. Still open.
- `rfcs/0001-metamodel-hypothesis.md` provenance section. Hypothesis, not edited.
- Sibling issue 37 `research/provenance/`. Formal PROV archaeology. Do not write there.
- Sibling issue 4 `research/foundation/facts/`. Authority and confidence. Do not write there.

## Gotchas

PROV "Entity" sounds like OS Object. It is a snapshot with fixed aspects. Treating a changing Person as one Entity breaks Constraint 57's neighbor constraints and the fixed-attribute rule.

Palantir's word "provenance" on `@Edits` means declared write-set for permissions. It is a DecisionRecord input. It is not a derivation graph.

OpenLineage "ownership" is a facet on a dataset. It is not fiscal authority.

Odoo chatter can be turned off. Do not cite it as proof that ERP already solved explainability.

A high-confidence forecast is still a forecast. ValueFlows will not let it be an Economic Event.

## Falsifiers

The vocabulary dies or shrinks if any of these show up with primary-source force.

- A mature operational system explains both questions with only `changed_by` and `changed_at`.
- A regulated process treats a raw confidence number as sufficient authority with no policy step. Narrows L-003.
- Denied Actions never need reconstruction. Narrows DecisionRecord.
- Redacting an actor identifier always destroys the legal value of the trail. Narrows L-007.
