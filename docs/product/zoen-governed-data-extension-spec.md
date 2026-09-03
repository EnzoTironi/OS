# Zoen governed data extension

Status: Ratified by W0-05
Date: 2026-09-02
Extends: `docs/product/zoen-final-architecture.md`
Replaces: Nothing
Implementation status: Approved target architecture, not current runtime

## 1. Purpose

This specification defines how Zoen admits external data, represents typed objects, resolves competing evidence, stores dense observations, enforces data rights, and exposes one governed model through Eve, the CLI, the Connect API, and MCP.

This specification extends the approved Zoen architecture. It does not add a product, a public verb, or a fifth `WorldRelease` catalog.

Finance is the first validation pack. The contracts remain generic enough for a person, a family, a clinic, or a factory.

## 2. Normative terms

The key words `MUST`, `MUST NOT`, `SHOULD`, `SHOULD NOT`, and `MAY` define requirements.

- `MUST` and `MUST NOT` define acceptance requirements.
- `SHOULD` and `SHOULD NOT` define the expected design. A deviation requires a recorded reason.
- `MAY` defines an allowed choice.

## 3. Decision status

### 3.1 Approved North requirements

This specification preserves these approved requirements:

1. Zoen has exactly three products: Ontology, Eve, and Better Auth.
2. Every product interface uses one `WorldKernel`.
3. The public verb catalog contains exactly `Discover`, `Query`, `Propose`, `Decide`, `Commit`, `Explain`, and `Execute`.
4. `WorldRelease` binds exactly four catalogs: ontology, policy, executors, and components.
5. `WorldRelease` is the immutable unit of published meaning.
6. Better Auth owns account authentication, recovery, device flow, and link confirmation.
7. Eve owns conversation state, channel verification, channel rendering, and the membership workbench.
8. Ontology owns definitions, evidence, governed Actions, authority commits, and external effect intent.
9. Restate provides durability only for `ZoenEffect`.
10. The initial deployment remains one Fly application.
11. PostgreSQL, immutable object storage, DataFusion, and Wasmtime remain implementation components behind the kernel.
12. Callers do not select a storage engine, a policy revision, a provider branch, or a compute budget.

### 3.2 Ratified extension requirements

W0-05 adds these requirements to the approved architecture:

1. Explicit type assignment, stable object keys, and typed object references.
2. Typed links that validate both endpoints.
3. Separate released `SourceDefinition` and `SourceCapability` contracts from mutable `SourceGrant` authority and private `CredentialBinding` secrets.
4. Separate the content-addressed `WorldRelease` identity from `WorldReleasePublication` metadata.
5. Explicit `SemanticBasis`, `DataBasis`, and `AccessBasis` contracts for reproducible operations.
6. A reproducible `KnowledgeBasisDefinition` and canonical `ResolutionDecision` for evidence selection.
7. Caller-authored `ObjectSetPlan` requests, server-issued `AuthorizedObjectSetPlan` plans, and `ObjectView` results.
8. Data entitlements by source, field, series, purpose, and usage right.
9. A separate observation plane for dense series.
10. Content-addressed `DatasetVersion` manifests and immutable observation segments.
11. Incremental projections with full rebuild reserved for repair.
12. Finance pack definitions and `FIN-*` final acceptance gates.

### 3.3 Implementation choices

The specification does not fix these choices:

- PostgreSQL table layouts.
- Parquet partition layouts.
- Compaction thresholds.
- Cache products or cache keys.
- The internal query-plan language.
- The number of supervised processes in the Fly application.
- The order in which providers ship.
- A terminal-style user interface.

Sections 3.1 and 3.2 are normative. The seven decisions in section 23 resolve the questions that were open in the review draft. `orchestrate/zoen-final/decisions.tsv` records the same decisions in machine-readable form.

## 4. System invariants

The implementation MUST preserve these invariants:

1. Finance remains a pack inside Ontology. It MUST NOT become a fourth product.
2. Every product interface MUST call the same seven kernel verbs.
3. The kernel MUST NOT contain branches for a provider, a channel, or a storage engine.
4. Provider routes and response models MUST NOT become domain types by default.
5. Human access identity and domain object identity MUST remain separate.
6. Every external acquisition MUST preserve its raw artifact before normalization.
7. A provider credential MUST grant acquisition authority only. It MUST NOT grant authority to declare accepted state.
8. A resolver MUST preserve ambiguous candidates.
9. A selected value MUST retain its competing evidence and canonical `ResolutionDecision`.
10. Policy evaluation MUST occur before discovery, scan planning, pagination, aggregation, lineage disclosure, citation disclosure, and MCP tool generation.
11. Dense observations MUST NOT create one semantic claim or one authority commit per cell.
12. A projection MUST remain disposable and rebuildable.
13. A `Commit` MUST record internal authority. It MUST NOT claim that an external effect succeeded.
14. Provider secrets MUST NOT enter a release catalog.
15. `WorldRelease` MUST NOT contain memberships, credentials, entitlement grants, dataset versions, or observations.
16. An explanation MUST apply the same entitlement checks as its underlying result.
17. A caller MUST NOT supply a `ReleaseDigest` independently from the `WorldRelease` content.
18. At most one `WorldRelease` MAY be active for a World at one time.
19. `DatasetVersion` content MUST NOT contain authority acceptance metadata.
20. A `ResolutionDecision` MUST remain durable and retrievable by digest without becoming authority or a `CommitReceipt`.

## 5. Product ownership

### 5.1 Better Auth

Better Auth owns:

- Authentication methods.
- Account sessions.
- Account recovery.
- CLI device flow.
- Confirmation of a `LinkIntent`.

Better Auth MUST NOT own:

- `World` authority.
- `Membership`.
- Channel delivery.
- Domain object identity.
- Provider credentials.

### 5.2 Eve

Eve owns:

- Conversation state.
- The private boundary for Kapso and Telegram.
- Channel signature verification.
- Channel-specific rendering.
- The membership workbench.
- The relationship between a person and the system.

Eve MUST NOT own:

- Ontology definitions.
- Accepted domain state.
- A separate Action model.
- Conversation durability in Restate.

### 5.3 Ontology

Ontology owns:

- `World`.
- `Membership`.
- `WorldRelease`.
- The seven public verbs.
- Evidence admission.
- Typed objects and links.
- Queries and explanations.
- Governed Actions.
- Authority commits.
- External effect intent.
- The CLI, Connect API, and inbound MCP adapters.

## 6. Admission and execution context

### 6.1 Admission paths

A verified web session enters through Better Auth.

A verified Kapso or Telegram event enters through the Eve channel adapter.

Both paths MUST converge on `SessionBroker` or `PersonHost`. The admission code resolves:

1. `Account`.
2. `ChannelBinding`, when a channel event exists.
3. Active `Membership`.
4. `World`.
5. Active `WorldRelease`.
6. Requested operation.
7. Purpose, when policy requires a purpose.

The admission code then issues an immutable `TurnCapability`.

### 6.2 `TrustedExecutionContext`

Every kernel call MUST carry a trusted context with this logical shape:

```rust
struct TrustedExecutionContext {
    principal: Principal,
    world: WorldId,
    membership: MembershipId,
    actor: Actor,
    delegation: DelegationChain,
    clearance: Clearance,
    release: ReleaseDigest,
    operation: OperationId,
    invocation_source: InvocationSource,
}
```

The exact code shape MAY differ. The authority fields MUST remain explicit.

`Principal` is a sum type. It identifies either a human Account or an authorized Workload. The context MUST NOT permit a principal that is both or neither.

Source-admission authority is not an invocation source. A source operation receives a separate `SourceGrant`.

The kernel MUST NOT reconstruct authority from:

- A provider subject.
- An environment variable.
- A global credential.
- A caller-provided tenant identifier without a trusted session.
- An `unbound` fallback.

## 7. Operation basis

Every read, proposal, commit, explanation, and effect MUST preserve three independent bases:

1. `SemanticBasis`: published meaning, authority and knowledge cuts, valid time, and evidence-selection policy.
2. `DataBasis`: the immutable dense-data versions read by the operation.
3. `AccessBasis`: trusted caller authority, policy evidence, entitlement decision, purpose, and server-owned budget.

The logical contract is:

```rust
struct SemanticBasis {
    release: ReleaseDigest,
    authority_cut: CommitSequence,
    knowledge_cut: CommitSequence,
    valid_at: TemporalSelection,
    knowledge_basis: Option<KnowledgeBasisDefinitionId>,
}

struct DataBasis {
    dataset_versions: Vec<DatasetVersionDigest>,
}

struct AccessBasis {
    authority: TrustedAuthorityDigest,
    principal: Principal,
    membership: MembershipId,
    purpose: Option<PurposeId>,
    authorization: PolicyEvidenceDigest,
    entitlement: Option<EntitlementDecisionDigest>,
    budget_class: BudgetClassId,
}

struct OperationBasis {
    semantic: SemanticBasis,
    data: DataBasis,
    access: AccessBasis,
}
```

`SemanticBasis` selects definitions, policies, evidence, and decisions. `DataBasis` selects dense data. `AccessBasis` selects caller authority, entitlement decisions, and server-owned budgets.

`TrustedAuthorityDigest` is a server-issued digest of the canonical authority fields used for the operation: principal, World, membership, actor, delegation, clearance, release, and operation. A caller MUST NOT supply or mint it. `AccessBasis.principal` and `AccessBasis.membership` remain explicit so policy and audit code need not decode the digest.

A cursor, a proposal, a computation, a `CommitReceipt`, and an explanation MUST preserve this basis or a digest that resolves to it.

## 8. `WorldRelease`

### 8.1 Release content and identity

`WorldRelease` MUST use this logical shape:

```rust
struct WorldReleaseContent {
    world: WorldId,
    parent: Option<ReleaseDigest>,
    ontology: OntologyCatalogDigest,
    policy: PolicyCatalogDigest,
    executors: ExecutorCatalogDigest,
    components: ComponentCatalogDigest,
}

struct WorldRelease {
    id: ReleaseDigest,
    content: WorldReleaseContent,
}

struct WorldReleasePublication {
    release: ReleaseDigest,
    published_at: Timestamp,
    published_by: Principal,
    policy: PolicyEvidence,
}
```

Every field in `WorldReleaseContent` and `WorldRelease` MUST remain private. The constructor MUST receive content, validate it, compute the digest, and return the complete value. It MUST NOT accept a caller-supplied `ReleaseDigest`.

The constructor MUST compute `ReleaseDigest` as SHA-256 over the UTF-8 bytes of this RFC 8785 JSON Canonicalization Scheme value:

```json
{
  "schema": "zoen.world-release.v1",
  "world": "<WorldId>",
  "parent": null,
  "ontology": "<OntologyCatalogDigest>",
  "policy": "<PolicyCatalogDigest>",
  "executors": "<ExecutorCatalogDigest>",
  "components": "<ComponentCatalogDigest>"
}
```

The `schema` value is the domain tag. The JSON value MUST contain no other field. The `parent` value MUST be JSON `null` when no parent exists. Digest text MUST use the canonical lowercase representation defined by its domain type.

Publication time, publishing principal, and policy evidence MUST remain outside the content digest. `WorldReleasePublication` records those facts.

This contract replaces the earlier architecture sketch that placed `published_at` inside `WorldRelease`.

The release compiler MUST reject a release that mixes catalog revisions from different candidates.

Historical queries and explanations MUST resolve the exact release that produced their basis.

### 8.2 Bootstrap and activation

The first release for a World MUST use a one-time owner ceremony. The ceremony MUST:

1. Authenticate the owner through Better Auth.
2. Create the initial World, owner Membership, candidate release, publication record, and active-release pointer in one transaction.
3. Refuse to run if the World has any release, active-release pointer, Membership, or completed bootstrap record.
4. Bind the completed bootstrap record to the owner, the World, the release digest, and the policy evidence used by the ceremony.
5. Remove the bootstrap capability when the transaction commits.

The ceremony MUST NOT create a superuser, a reusable bypass, or a policy-free path for a later release. Every later publication and activation MUST use the seven-verb governed path.

The active-release store MUST enforce one active release per World. Activation MUST replace that pointer atomically after policy approval. A failed activation MUST leave the prior pointer unchanged. Historical releases and their publication records remain addressable by digest.

### 8.3 `OntologyCatalog`

The ontology catalog contains published meaning:

- Object type definitions.
- Property definitions.
- Interface definitions.
- Link definitions.
- Action definitions.
- Function definitions.
- Field definitions.
- Series definitions.
- Source shape definitions.
- Unit and calendar definitions.

### 8.4 `PolicyCatalog`

The policy catalog contains published rules:

- Cedar authorization policies.
- Membership and delegation rules.
- Source admission policies.
- Identity resolution policies.
- Evidence selection policies.
- Quality policies.
- Data entitlement definitions.
- Purpose definitions.
- Contractual usage rules.
- Compute and scan budget classes.

### 8.5 `ExecutorCatalog`

The executor catalog contains capability contracts:

- Source acquisition executors.
- Broker executors.
- Messaging executors.
- Machine executors.
- Input and output schemas.
- Credential-slot references.
- Idempotency rules.
- Retry and reconciliation rules.

The executor catalog MUST NOT contain credential values.

### 8.6 `ComponentCatalog`

The component catalog contains digest-pinned executable components:

- Normalizers.
- Mappers.
- Validators.
- Calendars.
- Adjustment functions.
- Domain computations.
- Wasm modules.

The server MUST own resource budgets. A caller MUST NOT increase a component budget.

## 9. Provider contract

A provider integration MUST resolve through the four release catalogs. Zoen MUST NOT add a `ProviderCatalog` digest to `WorldRelease`.

```text
SourceDefinition and data shape       -> OntologyCatalog
Admission, resolution, and rights     -> PolicyCatalog
Acquisition capability                -> ExecutorCatalog
Normalizer, mapper, and validator     -> ComponentCatalog
```

### 9.1 `SourceDefinition`

A `SourceDefinition` identifies one published source.

```rust
struct SourceDefinition {
    id: SourceDefinitionId,
    provider: ProviderId,
    identity: SourceIdentity,
    terms: DataTermsRef,
}
```

### 9.2 `SourceCapability`

A `SourceCapability` is a released operation contract.

```rust
struct SourceCapability {
    id: SourceCapabilityId,
    source: SourceDefinitionId,
    operation: OperationName,
    executor: ExecutorRef,
    input_shape: ShapeRef,
    output_shape: ShapeRef,
    temporal_scope: TemporalScope,
    mapper: ComponentRef,
    validator: ComponentRef,
    admission_policy: PolicyRef,
    access_policy: PolicyRef,
    usage_policy: PolicyRef,
}
```

The capability MUST name an exact executor. `CapabilityName` without an executor reference is not sufficient.

### 9.3 `SourceGrant` and `CredentialBinding`

A `SourceGrant` is mutable World authority. It grants a principal or Workload permission to invoke one released source capability.

```rust
struct SourceGrant {
    id: SourceGrantId,
    world: WorldId,
    capability: SourceCapabilityId,
    grantee: Principal,
    allowed_purposes: Vec<PurposeId>,
    expires_at: Option<Timestamp>,
}

struct CredentialBinding {
    grant: SourceGrantId,
    credential_slot: CredentialSlotRef,
}
```

`CredentialBinding` is private to the source boundary. The kernel MUST NOT expose the credential slot through normal query or explanation results.

Runtime grants and revocations belong to World authority state. Credential values belong to the deployment secret store. They MUST NOT enter `WorldRelease`.

### 9.4 Acquisition sequence

A source acquisition MUST follow this sequence:

```text
authorize SourceGrant against SourceCapability
  -> call the published read-only executor
  -> store the raw artifact
  -> run the released normalizer and mapper
  -> resolve identity candidates
  -> validate types, links, units, and time
  -> Propose typed admitted artifacts
  -> Decide under the published policy
  -> Commit sparse evidence or an accepted dataset manifest
  -> CommitReceipt with typed admitted artifacts
```

The mapper MUST NOT write accepted object state directly.

If a source capability can cause an external effect, the executor call MUST move after `Commit` and use the outbox and `ZoenEffect` lifecycle. The pre-commit acquisition sequence above applies only to a capability declared and enforced as read-only.

The existing `CommitReceipt` SHOULD identify admitted evidence claims and accepted dataset-version digests as typed committed artifacts. A raw acquisition record and a resolution decision are not receipts.

## 10. Typed object model

### 10.1 Stable object identity

An object MUST have an internal stable key that does not depend on a provider identifier or an assigned type.

```rust
struct ObjectKey {
    world: WorldId,
    entity: EntityId,
}

struct TypedObjectRef<T> {
    key: ObjectKey,
    assignment: TypeAssignmentRef,
    marker: PhantomData<T>,
}
```

One object MAY have several type assignments without changing its key.

Generated SDKs MAY use the generic `TypedObjectRef<T>` notation. Runtime contracts SHOULD use `ObjectKey`, `TypeId`, and a verified `TypeAssignmentRef`.

The kernel MUST reject a typed operation when an explicit type assignment does not support the requested type.

### 10.2 Type assignment

`Membership` means an Account acting in a World. `TypeAssignment` is the only term for evidence that a domain object has a type. The implementation MUST NOT call a `TypeAssignment` a type membership.

A type assignment MUST be explicit, temporal, and attributable.

```rust
struct TypeAssignment {
    id: TypeAssignmentId,
    assertion: TypeAssignmentAssertion,
    evidence: EvidenceRef,
}

struct TypeAssignmentAssertion {
    object: ObjectKey,
    object_type: TypeId,
    valid_time: ValidInterval,
}
```

The query engine MUST NOT infer a type assignment only because an entity appears as the source of a relation.

### 10.3 Typed links

A link definition MUST declare:

- Source type.
- Target type.
- Named source side.
- Named target side.
- Cardinality.
- Temporal behavior.
- Required evidence shape.

Link admission MUST validate an explicit `TypeAssignment` for the declared source type and another explicit `TypeAssignment` for the declared target type. Both assignments MUST cover the complete `LinkAssertion.valid_time` interval. If an assignment covers only part of the interval, the mapper MUST split the link assertion into supported intervals or reject it.

Cardinality MUST NOT select a winner among competing link claims. A `KnowledgeBasisDefinition` performs that selection.

Instance links MUST use an explicit evidence shape:

```rust
struct LinkAssertion {
    link_type: LinkTypeId,
    source: ObjectKey,
    target: ObjectKey,
    valid_time: ValidInterval,
}
```

`LinkAssertion` is an evidence payload. Its enclosing `EvidenceClaim` supplies provenance and the stable evidence reference.

### 10.4 Identifier assignments

A ticker, CIK, LEI, FIGI, ISIN, CUSIP, or provider identifier MUST be an `IdentifierAssignment`.

```rust
struct IdentifierAssignment {
    id: IdentifierAssignmentId,
    assertion: IdentifierAssertion,
    evidence: EvidenceRef,
}

struct IdentifierAssertion {
    object: ObjectKey,
    scheme: IdentifierScheme,
    value: String,
    context: IdentifierContext,
    valid_time: ValidInterval,
}
```

The context MAY include venue, MIC, currency, share class, provider, and identifier level.

An `EvidenceDraft` carries `IdentifierAssertion`. `IdentifierAssignment` is the admitted, attributable form.

A resolver MUST return all plausible candidates that remain after published filters.

## 11. Evidence

### 11.1 External data starts as evidence

Every external value MUST enter as attributed evidence. The value MUST NOT enter as accepted state.

```rust
struct EvidenceEnvelope {
    source: SourceDefinitionId,
    capability: SourceCapabilityId,
    source_grant: SourceGrantId,
    raw_artifact: RawArtifactRef,
    mapper: ComponentRef,
    release: ReleaseDigest,
    asserted_at: Option<Timestamp>,
    retrieved_at: Timestamp,
    ingested_at: Timestamp,
    valid_time: TemporalSelection,
    drafts: Vec<EvidenceDraft>,
}
```

`EvidenceDraft` is a pre-commit candidate. An `EvidenceClaim` is an admitted draft with a `CommitSequence` and stable `EvidenceRef`.

An evidence draft MAY carry a property assertion, `TypeAssignmentAssertion`, `LinkAssertion`, `IdentifierAssertion`, or a dataset-manifest candidate. Draft payloads MUST NOT point back to an evidence reference that does not exist until commit.

An admitted evidence claim MAY support or rival another claim.

The evidence graph MUST preserve:

- Supporting evidence.
- Rival evidence.
- Source identity.
- Raw artifact digest.
- Mapper digest.
- Computation dependencies.
- Direct or imputed status.
- The authority commit that admitted the evidence.

### 11.2 Raw artifact store

The raw artifact store MUST be content-addressed and immutable.

A `RawArtifactRef` MUST identify:

- Content digest.
- Media type.
- Acquisition request digest.
- Relevant response metadata.
- Retrieval time.
- Source definition.

The raw artifact store MUST NOT decide semantic meaning.

### 11.3 Time model

The finance pack MUST distinguish these clocks:

1. Identity valid time. This clock states when an alias, listing, or relationship applied.
2. Economic observation time. This clock states the period or instant measured by a value.
3. Event lifecycle time. This clock states announcement, ex, record, pay, and effective times.
4. Assertion and knowledge time. This clock states when a source asserted a value and when Zoen retrieved, ingested, and committed it.

The release publication time selects vocabulary and executable rules. It MUST NOT replace a data clock.

## 12. Evidence selection

### 12.1 `KnowledgeBasisDefinition`

A `KnowledgeBasisDefinition` is a published policy that selects evidence for a stated purpose.

Examples include:

- As filed.
- Latest accepted under a quality policy.
- A named provider priority.
- A regulatory reporting policy.
- A policy selected for a clinical or industrial purpose.

```rust
struct KnowledgeBasisDefinition {
    id: KnowledgeBasisDefinitionId,
    policy: PolicyRef,
}
```

The definition belongs to the `PolicyCatalog`. Runtime cuts, valid time, and purpose belong to `OperationBasis`. The implementation MUST NOT duplicate those values inside the definition.

The query engine MUST apply the released policy to the cuts and valid time in `SemanticBasis`. That evaluation MUST produce a `ResolutionDecision` for each subject that needs evidence selection.

The query engine MUST preserve every rival that the caller may see.

### 12.2 `ResolutionDecision`

Evidence selection MUST emit a canonical `ResolutionDecision` for each resolved property, link, identifier assignment, or type assignment.

```rust
struct ResolutionDecision {
    digest: ResolutionDecisionDigest,
    subject: ResolvedSubject,
    selected: Vec<EvidenceRef>,
    supporting: Vec<EvidenceRef>,
    rivals: Vec<EvidenceRef>,
    policy: PolicyEvidence,
    semantic_basis: SemanticBasisDigest,
    reasons: Vec<ResolutionReason>,
}
```

The digest preimage MUST contain the resolved subject, evidence references, policy evidence, semantic basis, and reasons in canonical form.

The query engine MUST persist the canonical record in an immutable decision store before it returns a reference. A caller with matching lineage rights MUST be able to retrieve the record by `ResolutionDecisionDigest`. Repeating the same selection on the same inputs MUST resolve to the same digest.

A `ResolutionDecision` is a durable derived-read artifact. Persistence does not make it authority. It becomes part of authority only if a governed Action commits a reference to it.

A `ResolutionDecision` is not a `CommitReceipt`. The implementation MUST NOT call both concepts a receipt.

### 12.3 Explicit adjudication

If a person or agent changes accepted world state, the change MUST use:

```text
Propose -> Decide -> Commit
```

A read-time evidence selector MUST NOT impersonate a principal decision.

## 13. Two data planes

### 13.1 Semantic authority plane

The semantic authority plane stores sparse, high-meaning records:

- Definitions and releases.
- Type assignments.
- Property evidence.
- Typed-link evidence.
- Identifier assignments.
- Evidence dependencies.
- Proposals.
- Decisions.
- Authority commits.
- `CommitReceipt` records.
- External effect intent.
- Dataset manifests accepted by an authority commit.

PostgreSQL is the initial authority store.

### 13.2 Observation plane

The observation plane stores dense, range-oriented data:

- Prices.
- Quotes.
- Curves.
- Estimates.
- Dense fundamentals.
- Sensor measurements.
- Other time-series observations.

```rust
struct ObservationSeries {
    id: ObservationSeriesId,
    subject: ObjectKey,
    field: FieldDefinitionId,
    unit: UnitId,
    source: SourceDefinitionId,
    provider_series_id: Option<String>,
    dimensions: Vec<DimensionValue>,
    cadence: Option<Cadence>,
    venue: Option<ObjectKey>,
    currency: Option<CurrencyId>,
    calendar: Option<CalendarId>,
    adjustment_policy: Option<PolicyRef>,
}

struct ObservationSegmentRef {
    digest: ObservationSegmentDigest,
    series: Vec<ObservationSeriesId>,
    schema: ShapeRef,
    row_count: u64,
    observed_range: TimeRange,
}

struct DatasetVersionContent {
    parent: Option<DatasetVersionDigest>,
    segments: Vec<ObservationSegmentRef>,
    replacements: Vec<SegmentReplacement>,
    tombstones: Vec<SegmentTombstone>,
    source_artifacts: Vec<RawArtifactRef>,
    mapper: ComponentRef,
    release: ReleaseDigest,
    terms: DataTermsRef,
}

struct DatasetVersion {
    id: DatasetVersionDigest,
    content: DatasetVersionContent,
}

struct DatasetVersionAcceptance {
    dataset_version: DatasetVersionDigest,
    commit: CommitSequence,
    accepted_by: Principal,
    policy: PolicyEvidence,
}
```

Every field in `DatasetVersion` and `DatasetVersionContent` MUST remain private. The constructor MUST derive `DatasetVersionDigest` from domain-tagged canonical content. It MUST NOT accept an independent digest. One dataset version MAY contain several series and segments.

`DatasetVersionAcceptance` records the authority decision that accepted the manifest. The acceptance record MUST remain outside the dataset-version digest. Re-evaluating identical content MUST NOT create another dataset identity.

Knowledge cut and caller entitlement are query inputs. They MUST NOT become intrinsic fields of a dataset version.

`DataTermsRef` records immutable source restrictions. Runtime entitlement remains part of `AccessBasis`.

One admitted batch MUST produce one `DatasetVersionAcceptance` authority boundary. It MUST NOT produce one boundary per observation cell.

### 13.3 Derived observations

A derived series MUST cite:

- Input manifest digests.
- Exact input ranges.
- Component digest.
- Parameters.
- Calendar.
- Adjustment policy.
- Release.
- Knowledge cut.

An adjusted series MUST NOT overwrite its raw series.

### 13.4 Projections

Projection workers MAY build Parquet files, indexes, caches, and materialized query tables.

Projection workers MUST:

- Use least-privilege credentials.
- Process an explicit authority range.
- Publish output atomically.
- Preserve the source commit range.
- Support incremental updates.
- Support a full rebuild for repair.

A projection MUST NOT mutate authority state.

## 14. Data entitlements

### 14.1 Separate concepts

The policy model MUST distinguish:

- `DataAccessEntitlement`: permission to receive data through Zoen.
- `ContractualUsageRight`: permission to use, export, derive, display, or redistribute the data.
- Economic instrument rights: rights represented by the instrument itself.

The implementation MUST NOT merge these concepts.

The entitlement contract MUST name the requested use and resource scope:

```rust
enum DataUse {
    Discover,
    Read,
    Derive,
    Cache,
    Display,
    Cite,
    Export,
    Redistribute,
}

enum ScopeSet<T> {
    None,
    All,
    Only(Vec<T>),
}

struct DataResourceScope {
    sources: ScopeSet<SourceDefinitionId>,
    fields: ScopeSet<FieldDefinitionId>,
    series: ScopeSet<ObservationSeriesId>,
    dataset_versions: ScopeSet<DatasetVersionDigest>,
    object_types: ScopeSet<TypeId>,
}

struct EntitlementDecision {
    digest: EntitlementDecisionDigest,
    principal: Principal,
    membership: MembershipId,
    purpose: Option<PurposeId>,
    semantic_basis: SemanticBasisDigest,
    policy: PolicyEvidence,
    requested_scope: DataResourceScope,
    authorized_scope: DataResourceScope,
    requested_uses: Vec<DataUse>,
    allowed_uses: Vec<DataUse>,
    obligations: Vec<DataObligation>,
    expires_at: Option<Timestamp>,
}
```

An empty `Only` list grants nothing. A wildcard MUST use the explicit `All` variant.

`AccessBasis` MUST bind the entitlement-decision digest used by the operation. An operation that reads, derives, caches, displays, cites, exports, or redistributes governed data MUST have an entitlement decision.

### 14.2 Evaluation scope

The policy engine MUST evaluate data rights before:

- Listing a capability.
- Returning a tool description.
- Planning a query.
- Reading a property.
- Reading a series.
- Computing a derived value.
- Returning a count.
- Returning a cursor.
- Returning lineage.
- Returning a citation.
- Exporting data.
- Proposing an Action that depends on restricted data.

The authorization result MUST restrict the physical scan plan before any semantic table, observation manifest, segment, index, cache, or provider endpoint is inspected. A storage adapter MUST accept only a server-issued `AuthorizedObjectSetPlan` and its authorized data scope.

A denied discovery request MUST NOT reveal whether the resource exists. Denied and absent resources MUST use the same public status, error shape, count behavior, cursor behavior, and documented timing class. Logs and private audit evidence MAY distinguish the cause for an authorized operator.

A derived result MUST retain the applicable restrictions of its inputs unless a published policy proves a different right.

### 14.3 Grants and secrets

Entitlement definitions belong to the policy catalog.

Entitlement grants and revocations belong to world state.

Credential values belong to the deployment secret store.

Neither grants nor credential values belong to `WorldRelease`.

## 15. Query model

### 15.1 Object-set plans

A caller submits an `ObjectSetPlan`. The plan contains query intent only. It MUST NOT contain caller-asserted authority.

It MAY support:

- Type selection.
- Property filters.
- Typed-link traversal.
- Union.
- Intersection.
- Difference.
- Sorting.
- Aggregation.
- Range selection.
- Pagination.

The server authorizes the caller plan and emits an `AuthorizedObjectSetPlan`.

```rust
struct ObjectSetPlan {
    object_type: TypeId,
    expression: ObjectSetExpression,
}

struct AuthorizedObjectSetPlan {
    digest: AuthorizedObjectSetPlanDigest,
    request: ObjectSetPlan,
    basis: OperationBasis,
    effective_budget: QueryBudget,
}
```

Generated SDKs MAY expose `ObjectSet<T>`. Runtime core contracts SHOULD use `TypeId`.

The policy planner MUST restrict the set before storage access. Only the server-issued plan may reach the query adapters.

### 15.2 Object views

An object view is the result of applying an authorized object-set plan and a knowledge-basis definition.

```rust
struct ResolvedProperty {
    property: PropertyId,
    selected: Vec<EvidenceRef>,
    supporting: Vec<EvidenceRef>,
    rivals: Vec<EvidenceRef>,
    resolution: Option<ResolutionDecisionDigest>,
}

struct ResolvedLink {
    link: LinkTypeId,
    targets: Vec<ObjectKey>,
    supporting: Vec<EvidenceRef>,
    rivals: Vec<EvidenceRef>,
    resolution: Option<ResolutionDecisionDigest>,
}

struct ObjectView {
    basis: OperationBasis,
    object: ObjectKey,
    type_assignments: Vec<TypeAssignment>,
    properties: Vec<ResolvedProperty>,
    links: Vec<ResolvedLink>,
    series: Vec<AuthorizedSeriesRef>,
    allowed_actions: Vec<ActionRef>,
}
```

Each resolved field or link owns its rival set and resolution decision. A single view-level trace is not sufficient.

The selected, supporting, and rival evidence in an `ObjectView` is an authorized projection. The resolution digest MUST be absent when lineage policy does not permit its disclosure.

Generated SDKs MAY expose `ObjectView<T>`. Runtime core contracts SHOULD use `ObjectView` with verified type assignments.

An object view is a derived result. It MUST NOT become a second authority store.

### 15.3 Query sequence

Every query MUST use this order:

```text
resolve trusted caller context
  -> bind active or historical release
  -> authorize discovery
  -> parse the caller ObjectSetPlan
  -> apply object, property, series, and purpose restrictions
  -> issue an AuthorizedObjectSetPlan
  -> scan the semantic and observation planes
  -> apply the KnowledgeBasisDefinition in SemanticBasis
  -> build ObjectView results
  -> apply output and lineage restrictions
  -> seal the cursor
```

No query adapter may run before the server issues the `AuthorizedObjectSetPlan`. Output filtering cannot repair an unauthorized scan.

### 15.4 Cursors

A cursor MUST be opaque and tamper-evident.

A cursor MUST bind:

- Authorized plan digest.
- Release digest.
- Policy digest.
- Knowledge basis.
- `SemanticBasis.authority_cut`.
- Principal.
- Membership.
- Purpose.
- Sort order.
- Position.
- Expiration.

Changing any bound value MUST invalidate the cursor.

Hidden objects MUST NOT affect visible counts, page lengths, error shapes, or timing beyond documented bounds.

## 16. Actions and external effects

### 16.1 State basis

An Action proposal MUST cite the exact state used for its preview:

- `ObjectView` basis.
- Relevant evidence.
- Relevant `DatasetVersion` digests.
- Release.
- Policy evidence.
- `SemanticBasis.authority_cut`.

### 16.2 Lifecycle

A governed change MUST follow this lifecycle:

```text
Discover
  -> Propose
  -> deterministic preview
  -> Decide by the principal
  -> stale-basis check
  -> Commit in one authority transaction
  -> CommitReceipt
```

Only an external effect continues:

```text
committed outbox
  -> Execute
  -> Restate ZoenEffect
  -> executor
  -> attempt result
  -> reconciliation
```

The effect lifecycle MUST use the existing `EffectKnowledgeState` states:

- `NotAttempted`.
- `DefinitelyNotSent`.
- `Unknown`.
- `AcceptedPending`.
- `Confirmed`.
- `ConfirmedNoEffect`.
- `Contradicted`.

A retry MUST use the committed `EffectIdempotencyKey` and `EffectRequestDigest`. Execution MAY start only from `NotAttempted` or retry from `DefinitelyNotSent`. `Unknown` and `AcceptedPending` require reconciliation rather than blind retry; the remaining states MUST reject retry.

### 16.3 Source synchronization

A synchronization that changes world state MUST use a governed Action through `Propose`, `Decide`, and `Commit`.

The public API MUST NOT add provider-specific verbs such as `SyncOpenBB` or `ResolveBloomberg`.

## 17. Product interfaces

The CLI, Connect API, inbound MCP server, and Eve MUST derive from the same active release.

Every interface MUST preserve:

- The seven public verbs.
- Input schemas.
- Output schemas.
- Policy decisions.
- Entitlements.
- Operation basis.
- `CommitReceipt` identity.
- Explanation identity.

MCP MUST use progressive discovery. It MUST NOT expose every provider endpoint as an always-enabled tool.

The inbound Ontology MCP server and an outbound MCP source connector are different components. The implementation MUST NOT conflate them.

Channel adapters MUST flatten structured interface elements into readable text when a channel cannot render them.

## 18. Physical ownership

### 18.1 One Fly application

The initial Fly application contains:

- Public routing.
- Better Auth.
- Eve.
- The Connect API.
- The inbound MCP adapter.
- `WorldKernel`.
- Release compilation and activation.
- Evidence admission.
- Query planning.
- Projection workers.
- Automation scheduling.
- The effect dispatcher.
- The production `ZoenEffect` handler.

The deployment MAY supervise these responsibilities as separate processes.

### 18.2 Backing components

PostgreSQL owns:

- Account-to-world authority references.
- Worlds and memberships.
- Releases.
- Sparse evidence.
- Authority commits.
- Actions and `CommitReceipt` records.
- Accepted dataset manifests.
- The transactional outbox.

Immutable object storage owns:

- Raw artifacts.
- Canonical release artifacts.
- Component blobs.
- Immutable observation segments.
- Projection artifacts.

DataFusion executes scans and aggregations. It owns no authority.

Wasmtime executes released components under server-owned budgets.

Restate owns durable attempts and reconciliation for `ZoenEffect` only.

The architecture MUST NOT add Redis.

## 19. Finance pack

### 19.1 Required definitions

The first finance pack MUST define:

- `LegalEntity`.
- `Instrument`.
- `ShareClass` or `Issue`.
- `Listing`.
- `Venue`.
- `IdentifierAssignment`.
- `CorporateAction`.
- Finance-specific `FieldDefinition` records.
- Finance-specific series definitions that instantiate the generic `ObservationSeries` contract.

The pack SHOULD define interfaces that other asset classes can implement.

`ObservationSeries` and `DatasetVersion` are ratified generic kernel contracts. The finance pack MUST instantiate them; it MUST NOT redefine them as finance-only types.

### 19.2 Identity chain

The pack MUST support this chain without collapsing the nodes:

```text
LegalEntity
  -> issues
Instrument or ShareClass
  -> listed as
Listing
  -> trades on
Venue
```

CIK and LEI assignments attach to a legal entity.

FIGI assignments attach at their defined identifier level.

A ticker assignment attaches to a listing context and a valid interval.

### 19.3 Provider integration

OpenBB and the institutional standards in the research record are informative sources. They do not define Zoen's normative authority model.

OpenBB patterns MAY inform:

- Provider registration.
- Shared input and output shapes.
- Generated interfaces.
- Progressive MCP activation.

Zoen MUST NOT treat OpenBB endpoint names as ontology meaning.

Zoen MUST implement these contracts as clean-room product work. Contributors MUST NOT copy OpenBB AGPL code into Zoen under this ratification. Any later AGPL code reuse requires a separate written license decision before implementation.

## 20. Final acceptance gates

The program has eight canonical journeys, J1 through J8. The separate `FIN-*` namespace identifies nine final governed-data gates.

Each final gate MUST prove its positive case, denial case, and recovery case against the production-shaped artifact. A static check MAY support this proof. A static check MUST NOT replace the executable proof.

### 20.1 `FIN-01`: ambiguous identity

Given two plausible IBM listings and multiple identifier schemes,
when a caller queries `IBM`,
then Zoen returns typed candidates with venue, currency, identifier level, validity, and evidence.

The gate fails if the resolver silently selects the first candidate.

Denial: a caller without discovery entitlement receives no candidate, count, or distinguishing error.
Recovery: after a governed entitlement grant, a new operation basis returns the authorized candidates and records the disambiguation inputs.

### 20.2 `FIN-02`: competing provider evidence

Given two providers that report different values for one IBM field,
when a caller queries under a named `KnowledgeBasisDefinition`,
then Zoen returns the selected value, every visible rival, and the `ResolutionDecision` for that field.

The gate fails if a newer value overwrites an older rival.

Denial: an unknown or unauthorized basis is rejected before evidence scanning and does not fall back to a provider default.
Recovery: after the basis is published and authorized, the same query resolves reproducibly under its release and knowledge cut.

### 20.3 `FIN-03`: dense observation series

Given one year of daily IBM OHLCV observations,
when Zoen admits the batch,
then Zoen stores immutable segments and commits one `DatasetVersionAcceptance` for the manifest.

The gate fails if Zoen records one semantic claim or one commit per cell.

Denial: an invalid segment, unreleased mapper, or mismatched schema produces no accepted manifest.
Recovery: the same preserved raw artifact can be reprocessed under a corrected release and committed once without mutating the rejected candidate.

### 20.4 `FIN-04`: SEC restatement

Given an original IBM filing and a later restatement,
when a caller queries two knowledge cuts,
then each cut returns the value known at that cut with its accession, context, unit, period, and source artifact.

The gate fails if the restatement destroys the original value.

Denial: evidence outside the requested knowledge cut or caller entitlement does not affect the visible result or leak through lineage.
Recovery: a later authorized basis exposes the restatement while retaining the earlier filing and its original cut.

### 20.5 `FIN-05`: data entitlement

Given a principal who lacks permission for one IBM field and one IBM series,
when the principal uses Eve, the CLI, the Connect API, and MCP,
then every interface hides the capability, values, counts, lineage, citations, and derived output.

The gate fails if any interface reveals restricted existence.

Positive control: an entitled principal receives the field and series with the same operation basis through every interface.
Recovery: after a governed grant, a new query becomes visible; cursors sealed under the denied basis remain invalid.

### 20.6 `FIN-06`: derived adjusted series

Given a raw IBM series and an IBM split event,
when a released component computes an adjusted series,
then the result cites the raw segments, event evidence, component digest, parameters, calendar, policy, and knowledge cut.

The gate fails if the adjusted series overwrites the raw series.

Denial: missing input rights, a missing component digest, or a caller-selected budget prevents execution before a scan begins.
Recovery: a released component with server-owned budget and valid derivation rights produces a new cited series.

### 20.7 `FIN-07`: governed portfolio change

Given an authorized portfolio `ObjectView` with an IBM position,
when a person proposes and approves a rebalance,
then Zoen checks the state basis, commits the intent atomically, and executes the broker effect through `ZoenEffect`.

The gate fails if a broker response shares the authority transaction.

Denial: an unapproved or stale proposal cannot commit, and an ambiguous external result cannot be reported as confirmed.
Recovery: the caller proposes again on the current basis; reconciliation, not blind retry, resolves an ambiguous effect.

### 20.8 `FIN-08`: provider schema evolution

Given a provider shape change for an IBM source capability,
when a builder publishes a candidate release,
then impact analysis identifies affected mappings, policies, series, components, queries, and generated interfaces.

The gate fails if the active release mixes old and new catalog revisions.

Denial: activation of a candidate with a missing or mismatched catalog digest makes no active-release change.
Recovery: publishing and approving one coherent four-catalog candidate permits atomic activation while the prior release remains queryable.

### 20.9 `FIN-09`: interface parity

Given one released IBM instrument type and rebalance Action,
when an authorized caller uses Eve, the CLI, the Connect API, and MCP,
then every interface resolves the same type, Action, policy result, operation basis, and `CommitReceipt`.

The gate fails if an interface bypasses the kernel.

Denial: an unauthorized principal receives the same non-disclosing result from all four interfaces.
Recovery: after trusted session and membership admission, a new operation resolves identically through all four interfaces.

## 21. Program integration

`orchestrate/zoen-final/program.json` incorporates this specification into one 52-unit program. It does not create a parallel finance program.

| Requirement | Program units | Required result |
|---|---|---|
| Four-catalog release closure | W2-01 through W2-04 | Derive the private release identity from canonical content, keep publication metadata separate, and activate one release per World |
| Explicit object types and links | W2-08 and W2-09 | Use stable `ObjectKey`, temporal `TypeAssignment`, typed links, and contextual identifier assignments |
| Authorization before discovery and scanning | W2-06 and W4-08 | Restrict the server-issued plan before any semantic or observation storage work |
| Trusted turn context | W3-03 and W3-06 | Keep domain object identity separate from person and channel identity; bind the authority digest server-side |
| Source-bound evidence | W4-01 | Bind the executor, shape, temporal model, mapper, validator, and policy in `SourceCapability` |
| Typed committed artifacts | W4-03 | Extend `CommitReceipt` without creating a second receipt taxonomy |
| Evidence selection and object views | W4-06 | Make `KnowledgeBasisDefinition` produce durable `ResolutionDecision` records and authorized `ObjectView` results |
| Dense observation data | W4-07 | Keep `DatasetVersion` content separate from acceptance metadata and build incremental projections |
| Sanitized effect and lineage reads | W4-04, W4-05, and W4-08 | Apply the same non-disclosure rule to effects, data lineage, citations, and provider errors |
| Generated product interfaces | W5-02 and W7-01 through W7-02 | Generate Eve, CLI, Connect, and MCP contracts from the active release |
| Finance definitions | W7-04 | Publish the finance pack without adding kernel branches for finance or OpenBB |
| Finance proof | W8-04 | Run FIN-01 through FIN-09 with IBM data, denial controls, and recovery cases |

W0-05 and these seven implementation units extend the original 44-unit graph:

1. W2-08 for `ObjectKey`, `TypedObjectRef`, and `TypeAssignment`.
2. W2-09 for typed links and contextual identifier assignments.
3. W4-06 for `KnowledgeBasisDefinition`, `ResolutionDecision`, `ObjectSetPlan`, `AuthorizedObjectSetPlan`, and `ObjectView`.
4. W4-07 for `DatasetVersion`, the observation plane, and incremental projection.
5. W4-08 for data entitlement and contractual usage rights.
6. W7-04 for the finance pack.
7. W8-04 for FIN-01 through FIN-09.

The program MUST NOT expand the current Wave 1 briefs to absorb this work.

The dependency order is:

```text
W0-05
  -> W2-01 through W2-06
  -> W2-08 and W2-09
  -> W4-06 through W4-08
  -> W7-04
  -> W8-04
  -> W8-02
```

The generated `dependencies.tsv` records every edge. The generated `journeys.tsv` records the eight canonical journeys, J1 through J8. The generated `final-gates.tsv` records FIN-01 through FIN-09.

## 22. Prohibited designs

The following designs violate this specification:

- A fourth product named Financial Terminal, Data Platform, or Governance Console.
- A fifth `WorldRelease` catalog for providers.
- A provider-specific public verb.
- A direct path from a provider response to accepted state.
- A query that loads candidates before policy restricts the plan.
- A ticker used as an object primary key.
- A type assignment inferred only from relations.
- A typed link that does not validate its target type assignment.
- An accepted-value table that deletes competing evidence.
- A dense series represented as one claim per cell.
- A projection treated as an authority store.
- A caller-selected Wasm budget.
- A global provider credential.
- Provider secrets stored in a release artifact.
- A manual MCP catalog that differs from the active release.
- An Action commit treated as proof of external success.
- Restate used for conversation durability.
- A user-facing choice between PostgreSQL and Parquet.

## 23. Ratification record

W0-05 accepts this specification with these seven decisions:

1. `WorldRelease` content and publication metadata are separate. `ReleaseDigest` derives from domain-tagged RFC 8785 JCS content, and release fields remain private.
2. `DatasetVersion` content and `DatasetVersionAcceptance` metadata are separate.
3. `KnowledgeBasisDefinition` produces a durable `ResolutionDecision` retrievable by digest. The record is neither authority nor a `CommitReceipt`.
4. A one-time World owner ceremony creates the first active release without a permanent superuser.
5. Authorization restricts discovery and scan planning before storage work. Public denials do not disclose resource existence or result shape.
6. A typed link requires explicit endpoint `TypeAssignment` evidence that covers the link's valid interval.
7. Institutional standards are informative. OpenBB research remains clean-room input, and AGPL code reuse requires a separate written license decision.

Verdict: Accept with the corrections incorporated in this version.

`orchestrate/zoen-final/decisions.tsv` is the machine-readable decision record. `orchestrate/zoen-final/program.json` assigns the work to the 52-unit delivery program.

## 24. Traceability

This specification derives from:

- [`AGENTS.md`](../../AGENTS.md).
- [`zoen-final-architecture.md`](./zoen-final-architecture.md).
- [Ratified delivery program](../../orchestrate/zoen-final/overview.md).
- [Research provenance](../research/2026-09-02-openbb-ontology/README.md).
- [Canonical research source](../research/2026-09-02-openbb-ontology/report-source.md).
- [OpenBB repository forensics](../research/2026-09-02-openbb-ontology/subagent-reports/01-openbb-repository-forensics.md).
- [Financial semantics and IBM](../research/2026-09-02-openbb-ontology/subagent-reports/02-financial-semantics-ibm.md).
- [Palantir and Zoen gap audit](../research/2026-09-02-openbb-ontology/subagent-reports/03-palantir-zoen-gap-audit.md).
- [Institutional standards cross-check](../research/2026-09-02-openbb-ontology/subagent-reports/04-institutional-standards-crosscheck.md).
- [Pre-ratification research visual](../research/2026-09-02-openbb-ontology/show-me-zoen-final-research-architecture.html).
- [Ratified architecture visual](./show-me-zoen-governed-data-extension.html).

## 25. Current implementation gaps

At the 2026-09-02 validation snapshot:

- `WorldRelease` is an approved target, but it is not part of the integrated kernel.
- The current kernel does not model explicit type assignments.
- Link admission does not validate the target type assignment.
- Read authorization occurs after candidate query and pagination work.
- Evidence admission does not require the ratified `SourceCapability`.
- Cardinality-one Action state selects the latest supporting commit.
- The projection worker performs a full snapshot rebuild.
- The public query contract has no native series-range contract.
- The current executable MCP path is an outbound source connector, not the inbound Ontology MCP server.
- The current runtime does not implement `KnowledgeBasisDefinition`, `ObjectSetPlan`, `ObjectView`, `ObservationSeries`, or field-level data entitlement.

These gaps describe the snapshot. They do not change the normative requirements in this specification.
