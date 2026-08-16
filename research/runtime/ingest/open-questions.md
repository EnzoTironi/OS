# Open questions and downstream handoff

**Issue:** #45  
**Status:** unresolved unless explicitly stated.

# Questions #45 can answer now

## Q-I45-01 — should source schemas be copied into ontology types?

**Answer:** no as a general design rule.

Independent primary-source guidance plus HF reality evidence show source rows can mix multiple real-world concepts, represent aggregates/measurements/projections, and change shape over time. Source-shaped types may exist as hidden/raw evidence adapters, but do not become domain ontology by default.

## Q-I45-02 — can entity-resolution confidence itself decide identity?

**Answer:** no as a universal semantic rule.

Scores are model evidence. Deterministic/automatic binding can be valid when a governed domain/source rule says so, but the authority is in that rule/contract, not the probability number.

## Q-I45-03 — must OS preserve unresolved evidence?

**Answer:** yes for the ingest contract while the evidence is retained and retention/security/legal policy permits it.

Otherwise the system is forced to choose between fabricating a target or silently losing source information. A rejected/disposed record can later be removed under an explicit retention/privacy policy; that is different from pretending mapping succeeded.

## Q-I45-04 — does a source delete imply business deletion?

**Answer:** no generally. Only under a scoped lifecycle-authority contract.

## Q-I45-05 — can current state be admitted from snapshots without event history?

**Answer:** yes as an observed/source-backed position/state. Do not invent the missing history.

# Questions still open inside #45

## Q-I45-10 — is `Observation` a required metamodel primitive?

Current answer: `undetermined`; not earned.

The ingest boundary requires the **distinction** between source evidence/observation and business occurrence/decision. That distinction may be represented by ordinary domain types/interfaces/relations plus provenance/enforcement. #70 must test whether a native nature/trait is necessary for generic semantics such as immutability, authority or temporal handling.

## Q-I45-11 — is `Binding` a required metamodel primitive?

Current answer: `undetermined`; not earned.

A source-to-business exact-identity binding needs identity, provenance, scope/effectivity, revision and correction history. Ordinary typed relation/relator/decision constructs may suffice. A primitive is justified only if generic enforcement cannot be composed safely.

## Q-I45-12 — should every admitted statement be represented as a first-class `Fact`?

Current answer: `undetermined`, with negative pressure from #59/#129.

Fact-oriented representation is attractive for epistemic plurality, but can over-decompose stable object identity/actions and create storage/write complexity. #70 should compare a statement/fact-oriented model against typed observations/objects/relations.

## Q-I45-13 — how much raw evidence must be retained?

Depends on legal/privacy/security/operational policy.

Required capability: preserve enough provenance to justify the statement/binding while the evidence is retained. Retention, erasure, crypto-erasure, redaction and legal exceptions are handled by #6/#73/#47/#49 and jurisdictional policy. `Preserve provenance` is not a universal command to retain every raw byte forever.

## Q-I45-14 — how should relation semantics, assurance, and consumer risk interact?

**Corrected answer:** do not make exact identity consumer-relative.

Separate:

```text
relation semantics
  sameExactEntity | probableSameProductFamily | possibleMatch | sourceAlias | ...

assurance/evidence
  deterministic identifier, reviewed crosswalk, probabilistic score/model, conflicting evidence, etc.

consumer/Action admissibility
  what relation + assurance is sufficient for this operation?
```

A competitor-price analysis may use `probableSameProductFamily`; a payment Action may require `sameExactEntity` established by stronger evidence/review. That is not one exact-identity binding that is true for analytics and false for payment.

#42 should determine authorization/operation policy over these relations. #70 should decide whether assurance/relation metadata belongs on ordinary links/relators, a binding object, or another compositional form.

## Q-I45-15 — what is a `source identity` when the source has no stable key?

Candidate answer: identity of **evidence** can still be a content/integrity locator plus capture position (`file_hash + sheet + row`, document fragment, message ID). This does not create stable referent identity. Business identity may remain unresolved.

Need more executable cases with spreadsheets/PDFs and OCR.

## Q-I45-16 — what does reprocessing mean for non-deterministic LLM extractors?

We can pin model/config/prompt/retrieval/evidence, but exact stochastic replay may not be guaranteed. The system still needs a stable extraction-run identity and must treat a new run as a new proposal/derivation rather than mutating old output.

# Handoff to #40 — transaction and commit semantics

#40 must define how a high-impact exact-identity binding/admission decision commits.

Questions:

1. What exact evidence/candidate set/mapping revision is bound into the proposal?
2. Does commit require candidate set to remain unchanged, or only certain assumptions?
3. If new contradictory evidence arrives after approval but before commit, when is revalidation mandatory?
4. Can deterministic exact binding use a simpler commit contract than an ambiguous reviewed merge without weakening the semantics?
5. How are merge/split/rebind decisions made atomic with changes to operational projections/references?
6. How does ontology revision affect a binding proposal in flight?

Acceptance scenario: stale binding proposal must either commit against its declared frozen basis or fail/replan under live-at-commit semantics; it may not silently reinterpret against the newest candidate model.

# Handoff to #41 — external effects/reconciliation

Writeback to a source is not normal ingest.

Questions:

1. OS requests external mutation; when is its local source projection allowed to change?
2. If external request outcome is unknown, should ingest CDC/webhook evidence update the remote-state projection before reconciliation resolves the effect?
3. How are source manual changes distinguished from OS-requested changes?
4. Can callback/webhook/CDC records be correlated to the outgoing effect using source operation/idempotency IDs?
5. If remote system rewrites identifiers during creation, how is returned source identity bound without inventing success on timeout?

# Handoff to #42 — authorization/delegation

Questions:

1. Who may accept/reject an exact-identity binding when adjudication is required?
2. Which Actions may rely on weaker relations such as `probableSameProductFamily`, and which require exact identity plus stronger assurance?
3. Can an agent propose a merge and a human approve it without the agent inheriting approval authority?
4. Who may inspect raw/redacted evidence?
5. How does source/datasource permissioning affect derived/projection visibility?
6. How are binding decisions audited as actor/delegator/workload chains?

# Handoff to #39 — storage/temporal persistence

Storage must prove it can support:

```text
raw/source capture lineage
schema/mapping revision
unresolved evidence
pairwise candidates + optional clusters
semantic relation kind + assurance/evidence
exact-identity binding history including split/rebind
statement/source authority metadata
source positions/offsets for dedupe/replay
observed snapshots without invented events
operational projections/materializations
```

Do not infer this requires universal bitemporal rows. Some records need source position/capture time, some business-valid time, some binding effectivity, some all of them.

# Handoff to #46 — verification/fuzzing

Add the S-I45-* scenarios to semantic fuzzing. Particularly important generated families:

- threshold-induced cluster merge/split;
- source-key reuse;
- schema semantic change without type change;
- snapshot/CDC overlap and ordering;
- lineage-equivalent duplicate imports;
- binding split after historical Actions;
- permission redaction mistaken for null;
- LLM inferred literal with no source support.

Metamorphic properties:

1. **Source-copy invariance:** importing a known materialized copy of the same evidence should not create a second business occurrence.
2. **Model-revision non-mutation:** rerunning with mapping M2 must not mutate the recorded output/basis of M1.
3. **Threshold sensitivity transparency:** changing clustering threshold may change candidate clusters but must not silently rewrite committed exact-identity bindings.
4. **Arrival-order invariance:** when source ordering/transaction metadata is sufficient, different network arrival order should produce the same source-state interpretation.
5. **Consumer-policy separation:** allowing an analytics query to use a weaker semantic relation must not promote that relation into exact identity or make it admissible for a high-risk Action.

# Handoff to #49 — observability

Required explanations:

```text
Why does Product P currently have cost 105?
Which source observations were alternatives?
Which mapping/extractor version produced each statement?
Why was source record X bound exactly to P?
What candidate/approximate relations existed and what assurance supported them?
What candidates were rejected and by what rule/actor?
Did this value come from a snapshot, source mutation, Action, or projection?
Which historical Action used the older binding?
What changed when the identity was later split/rebound?
```

# Handoff to #63/#70 — composition/metamodel

The ingest boundary should be expressible without source-specific engine primitives.

#63 should ensure source adapters/mappings can be packaged/versioned without turning them into domain ontology or a global semantic `Pack` primitive.

#70 should try three competing representations:

1. native Observation/Binding semantic kinds;
2. ordinary typed evidence/candidate/decision objects + generic provenance/actions;
3. fact/statement-oriented representation.

A primitive earns promotion only if the adversarial suite shows the smaller composition cannot enforce or explain the required behavior across unrelated source/domain cases.
