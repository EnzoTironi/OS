# Candidate laws — ingestion and entity resolution

**Issue:** #45  
**Status:** each law is a falsifiable Wave B hypothesis.  
**Important:** `supported` below means the cited evidence strongly supports the scoped semantic pressure. It does not mean the law has been promoted to OS architecture or a base primitive.

## L-I45-01 — capture evidence is not automatically business truth

**State:** `supported` as a distinction.

A source row, webhook, CDC envelope, file cell, message or document fragment proves that the source exposed/emitted that evidence under a given capture context. It does not automatically prove the corresponding business-world proposition.

**Evidence:** Debezium source operations; W3C provenance; Palantir domain-first guidance; HF reports/snapshots/messages.

**Falsifier:** a source contract in which every captured record is itself the legally/business authoritative occurrence and no distinction between evidence and occurrence is meaningful. Such a case narrows the law's necessity for that source; it does not generalize to all ingestion.

## L-I45-02 — source identity and business identity require separate scope

**State:** `supported`.

A source-local identifier is stable only under the source's identity contract. Mapping it to a business referent is a relation/decision that may be one-to-one, many-to-one, one-to-many over time, or unresolved.

**Evidence:** HF Product/SKU/Listing; Splink/OpenRefine reconciliation; Palantir primary-key/data mapping.

**Falsifier:** a domain/source where the source identifier is itself the globally authoritative domain identifier by contract. In that scope the binding may be deterministic/trivial, but the semantic distinction still costs almost nothing to preserve at the boundary.

## L-I45-03 — grain must be established before domain identity is synthesized

**State:** `supported`.

An aggregate/report/measurement/source snapshot cannot be promoted into a finer-grained domain entity/event without evidence that identifies that finer grain.

**Evidence:** HF sales aggregates, stock/report sheets; Palantir one dataset may describe several entities.

**Falsifier:** a deterministic source contract showing the finer-grained identity can be reconstructed losslessly from the aggregate record plus stable source metadata.

## L-I45-04 — mapping interpretation is revisioned integration knowledge

**State:** `supported`.

A source field/fragment only has target semantic meaning relative to a mapping/extractor revision and compatible source schema/structure.

**Evidence:** Debezium schema history; source-schema drift; HF disputed suffix interpretation.

**Falsifier:** an immutable source format whose semantic contract is externally stable forever. Even there the mapping implementation can still evolve, so universal rejection seems unlikely.

## L-I45-05 — confidence/probability is evidence strength, not authority

**State:** `supported`.

A record-linkage probability, similarity score or LLM confidence does not by itself grant authority to merge/bind business identities or mutate operational state.

**Evidence:** Splink score/threshold/evaluation model; OpenRefine review workflow; Wave A fact/authority research; HF low-confidence repairs.

**Falsifier:** a formally trusted identifier algorithm whose output is definitionally the domain identity under contract. In that case the decision policy may be automatic, but authority comes from the contract/rule, not numeric confidence.

## L-I45-06 — candidate generation must be distinguishable from identity adjudication

**State:** `supported` for probabilistic/ambiguous linkage; deterministic trivial mappings are a scoped exception.

Candidate retrieval/blocking/scoring can miss or overinclude alternatives. Final exact-identity binding needs an explicit acceptance rule/decision when ambiguity exists; weaker semantic relations may remain candidates without becoming exact identity.

**Evidence:** Splink blocking/scoring/clustering; OpenRefine reconciliation candidates.

**Falsifier:** source-managed bijective crosswalk with no ambiguity. Then candidate stage can collapse into deterministic binding.

## L-I45-07 — cluster identity is algorithm output until domain constraints accept it

**State:** `supported` for probabilistic clustering.

Connected-components/single-best-link/other clustering and thresholds can produce different groups. A cluster ID therefore needs model/threshold/algorithm provenance and cannot automatically become immutable domain identity.

**Evidence:** Splink clustering docs and threshold sensitivity.

**Falsifier:** domain where connected components over the accepted pairwise relation is definitionally the identity equivalence relation and all equivalence axioms/domain cardinalities are guaranteed.

## L-I45-08 — accepted exact-identity binding must be revisable without erasing historical basis

**State:** `supported` as an audit/reproducibility requirement.

Merge/split/rebind corrections should preserve which exact-identity binding earlier decisions used and why. Candidate similarity/probable-family relations may have shorter retention where no governed operation depended on them.

**Evidence:** Wave A provenance/revision pressure; HF ambiguous repairs; general historical explainability.

**Falsifier:** disposable, non-audited analysis where no action/history depends on the relation. That may justify ephemeral linkage without durable binding history.

## L-I45-09 — source deletion/disappearance is not universal business deletion

**State:** `supported`.

A source tombstone/API disappearance/spreadsheet row deletion is first evidence about source state. Propagation to business deletion requires explicit source/action authority.

**Evidence:** CDC semantics; replicas/materializations; marketplace/product lifecycle divergence.

**Falsifier:** source is explicitly authoritative for the lifecycle/deletion of that exact domain identity. Then the source deletion can trigger/represent the business retirement under contract.

## L-I45-10 — snapshot observations must be representable without fabricated events

**State:** `supported`.

When only current state is available, preserve observed position/state with provenance. Do not synthesize a movement/event history merely to satisfy an event-sourced model.

**Evidence:** HF inventory snapshots; Debezium snapshot operation; Wave A state/temporal kill tests.

**Falsifier:** source includes a complete authoritative event log from which the snapshot is provably derived. Then the snapshot can be treated as a projection/cache.

## L-I45-11 — source operation identity and business occurrence identity are different keys

**State:** `supported`.

A transaction ID/LSN/webhook/message ID identifies source transport/mutation evidence. Several messages can describe one occurrence; one source transaction can update several representations.

**Evidence:** Debezium transaction metadata; Wave A duplicate-message fuzzing; HF lineage-equivalent data.

**Falsifier:** a source protocol where each unique source operation is definitionally the domain occurrence ID and cannot encode projections/corrections. Scoped exception only.

## L-I45-12 — lineage-equivalent records are not independent corroboration

**State:** `supported`.

Exports/materializations/copies derived from one source should not be counted as independent evidence or duplicate business events when their derivation is known.

**Evidence:** HF sales-table overlap/lineage; W3C PROV/OpenLineage pressure.

**Falsifier:** two apparently related sources are independently measured and merely happen to share values. Provenance resolves the case.

## L-I45-13 — missing/unknown/redacted/parse-failed/zero are not one state

**State:** `supported`; exact value system is delegated to #62/#70.

Ingestion must not coerce semantically distinct absence/unknown cases into an ordinary scalar.

**Evidence:** HF missing cost vs zero; permissioned MDO properties appearing null; parsing/document extraction.

**Falsifier:** target domain explicitly defines all these source states as equivalent. Such equivalence must be a target-domain rule, not an ingestion default.

## L-I45-14 — authority belongs to statement/action scope after identity binding

**State:** `supported` as pressure; exact authority model remains #42/#60/#70.

Correctly binding several source records to the same business identity does not make those sources equally authoritative for every property/action.

**Evidence:** HF Product/Listings/Cost/Price; Palantir per-datasource property sourcing/permissions; Brazil external authorization.

**Falsifier:** a system is authoritative for the full lifecycle and every relevant statement/action of an entity under a proven contract. Then entity-wide authority is a valid scoped simplification.

## L-I45-15 — operational current projection may choose a value without deleting source assertions

**State:** `supported` as an architectural capability; exact projection form `hypothesis`.

Operational workflows often need one actionable value even when evidence conflicts. Selection/materialization must remain explainable and should not erase the inputs where audit/reconciliation matters.

**Evidence:** Palantir conflict resolution demonstrates current-value need; Wave A/HF demonstrates preserved disagreement need.

**Falsifier:** domain where all input assertions are mutually compatible or source authority makes rivals irrelevant and legally disposable. Scoped simplification.

## L-I45-16 — AI/document/message extraction yields proposed statements unless another authority rule says otherwise

**State:** `supported`.

A model can infer a proposition from text/image/audio. The inference has extractor/model provenance and may be high-confidence, but source authorship and operational acceptance remain separate.

Example:

```text
WhatsApp message: "entrega dia 22"
```

can support:

```text
sender requested delivery date = 22
```

but does not automatically support:

```text
supplier promised delivery date = 22
```

**Falsifier:** structured/signed document format whose parser is deterministic and where the document itself is authoritative for the parsed statement. Then the extraction stage can be admitted automatically under the document contract.

## L-I45-17 — reprocessing produces a new interpretation lineage, not silent historical rewrite

**State:** `supported`.

New parser/mapping/entity-resolution revisions may improve results. The new results should supersede/correct prior proposals/bindings while preserving what historical actions actually used.

**Evidence:** schema history, ontology revision pressure, HF disputed repairs.

**Falsifier:** ephemeral analytical run with no persisted prior output/decision dependency. Durable history can be omitted by policy in that scope.

## L-I45-18 — unresolved evidence is a valid state

**State:** `supported`.

Failure to parse, map or bind should not force dropping the evidence or fabricating identity. Quarantine/unresolved evidence remains queryable/resolvable.

**Evidence:** OpenRefine candidate/review model; HF blocked/provisional source surfaces; schema drift cases.

**Falsifier:** ingestion contract explicitly rejects and discards invalid inputs by business/legal requirement after retention obligations are satisfied. Even then rejection is a governed disposition, not semantic success.

## L-I45-19 — identity relation, assurance and Action admissibility are separate dimensions

**State:** `supported` as a correction to the first draft of this research.

Do not make exact identity context-relative merely because consumers have different risk tolerance.

Keep separate:

1. **relation semantics** — what relation is claimed (`sameExactEntity`, `probableSameProductFamily`, `possibleMatch`, source alias, etc.);
2. **assurance/evidence** — how strongly and by what basis that relation is established;
3. **Action admissibility** — whether a particular consumer/Action is permitted to rely on that relation/assurance.

An analytics workflow may aggregate over `probableSameProductFamily` while a supplier payment Action requires a reviewed/deterministic `sameExactEntity`. That does not make exact identity true for analytics and false for payment.

**Evidence:** the candidate-vs-binding distinction from Splink/OpenRefine plus Wave A authority separation. This law also fixes an overreach found by adversarial self-review of issue #45.

**Falsifier:** a domain in which all relations are exact identity and all consumers require the same assurance. Then the three dimensions may collapse operationally, but the general distinction remains harmless.

# Candidate runtime consequences — not primitives

If these laws survive, a runtime needs capability for:

- evidence/source identity;
- versioned mappings/extractors;
- unresolved candidate relationships;
- explicit semantic relation kinds for candidate/exact matches;
- scored/explainable assurance/evidence;
- governed exact-identity binding decisions where ambiguity requires them;
- source/schema positions and replay/dedupe evidence;
- preserved/superseded bindings;
- queryable quarantine;
- current projections over admitted statements;
- authorization scoped to binding/admission operations and Action reliance;
- typed missingness/uncertainty;
- provenance through transformations.

The evidence does **not** yet show that `Observation`, `Binding`, or `Fact` must be root metamodel sorts.

# Explicit non-laws

The following are **rejected as universal rules** by this research:

- `one row = one object`;
- `same normalized string = same entity`;
- `probability >= 0.95 = identity truth`;
- `connected-component cluster = permanent business identity`;
- `identity can be exact for analytics and non-exact for payment`;
- `source delete = business delete`;
- `CDC update = business Event`;
- `latest timestamp = authority`;
- `null = zero`;
- `capture timestamp = business valid time`;
- `LLM extraction = accepted fact`;
- `one system owns every property/action of an entity`;
- `successful referential integrity after repair = proof the repair was correct`;
- `clean canonical table = complete provenance`;
- `reprocessing may overwrite prior binding history because the new model is better`.
