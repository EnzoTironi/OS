# Evidence index — issue #70 metamodel synthesis

**Status:** synthesis index  
**Decision:** none  
**Candidate:** R5 remains `hypothesis`.

This file maps the load-bearing claims in issue #70 to reviewed repository evidence. It is an index of prior work and executable evidence, not fresh source mining and not a bibliography claiming every cited issue is independently sufficient.

## Evidence classes

- **domain distinction** — a real-world distinction that survives across donors/domains;
- **negative/kill evidence** — a smaller model was tried and lost required meaning/enforcement;
- **runtime pressure** — a generic enforcement/capability boundary required by multiple domains;
- **executable sensitivity** — current branch test where the stronger model passes and a deliberately weaker model reproduces the failure;
- **open pressure** — evidence exists, but it does not yet justify a base form.

## Reviewed inputs

| Source | Load-bearing contribution to #70 | Evidence class |
| --- | --- | --- |
| issue #3 — identity, kinds, roles, relators | entity identity vs Role; Interface != Role; lifecycle relationship can be ordinary identifiable object; native Relator/Role/Phase not yet earned | domain distinction + kill evidence |
| issue #4 — facts, claims, source disagreement | rival assertions must coexist; fact-only kernel not justified; provenance/authority pressure remains | domain distinction + open pressure |
| issue #8 — logic reduction | one Computation/Gate is too small; Bool+failClosed does not model authorization; enforcement locus/basis/error algebra matter; Eval/Search/Bind were jobs, not accepted syntax | negative/kill evidence |
| issue #10 — Process/Commitment/Workflow | economic Process/Commitment have domain meaning independent of durable workflow execution; Workflow as semantic kernel form rejected | domain distinction + runtime pressure |
| issue #39 — storage models | semantic authority, time and projections must not be inferred from physical tables/nodes/event logs; materialization/storage are separate from metamodel vocabulary | runtime/physical boundary |
| issue #40 — commit semantics | semantic operation identity, intent mismatch, StateBasis/dependencies, commit-time revalidation and atomic authority are required | runtime pressure |
| issue #41 — external effects | stable local effect identity, no mandatory pre-send remote key, timeout-after-send = unknown, safe retry/reconciliation, contradictory evidence handling | runtime pressure + domain distinction |
| issue #42 — authorization/delegation | actor/represented/workload identity, grants, currentness, SoD, Permit/Deny/Error and determining evidence; Policy is not Bool | runtime pressure + kill evidence |
| issue #43 — durable orchestration | timers/replay/retries are execution memory and cannot manufacture business completion or override effect/authority semantics | runtime pressure |
| issue #45 — ingest/entity resolution | source evidence/observation and accepted business state are distinct; extraction revision/provenance must survive; source Binding is not RuleBinding | domain distinction + open pressure |
| issue #46 — cross-ontology verification | verification ladder; property/state tests; bounded model checking; Z3 sensitivity; regression corpus; checker self-verification; warning that coverage != proof | verification method |
| issue #56 — primitive reduction kill test | full RFC-0001 set not all base; quartet insufficient; M4 `Type/Link/Action/Event/Eval/Bind` survived only as hypothesis; Property/Constraint/Policy/Relator reductions pressure | negative/kill evidence |
| RFC-0001 | original explicit attack target: Type, Interface, Property, Link, Action, Function, Constraint, Policy, Event, Fact; explicit non-decisions | hypothesis baseline |

## R5 form evidence map

### Type

**Claim under review:** explicit type/identity/equality semantics remain irreducible in the current corpus.

Load-bearing evidence:

- #3: Kind/identity, Role not in identity key, merge/split/re-identification distinctions;
- #4/#56: fact-only representation does not eliminate identity machinery;
- K70-01..03: value equality vs entity identity, identifier correction vs replacement, record merge vs legal succession.

Current evidence level: **strong survivor**, not accepted forever.

### Relation

**Claim under review:** one typed relation algebra may subsume Property and Link while lifecycle relationships become ordinary Types.

Load-bearing evidence:

- #3: cheap relation vs relationship-object threshold;
- #56: native Relator rejected on current evidence; Link remained necessary in M4;
- K70-04..08;
- `test_reductions.py`: value-target Relation and entity-target Relation share typing/cardinality machinery;
- `test_relation_integrity.py`: minimum cardinality enforced after atomic construction with full rollback.

Current evidence level: **hypothesis-required**. Real authoring/query/codegen experiments remain outstanding.

### Computation

**Claim under review:** reusable typed executable logic remains distinct from authoritative mutation.

Load-bearing evidence:

- #8: deterministic eval, solver/search and policy bodies cannot simply be arbitrary mutating code;
- #40: planning/evaluation and commit authority are different jobs;
- K70-18..21;
- sensitivity test: Computation attempting authoritative mutation raises capability violation and state is restored.

Current evidence level: **hypothesis-required**. Query/Search/PDP/agent sub-form boundaries are unresolved.

### Action

**Claim under review:** attempted intervention is a first-class executable protocol, not merely a Function returning mutations.

Load-bearing evidence:

- RFC-0001 and #10/#41: Action attempt != occurrence/outcome;
- #40: semantic operation identity, intent digest, actor context, StateBasis, atomic commit, replay/mismatch;
- #42: actor/represented/workload/grant context;
- K70-30..34;
- `ComputationOnlyMutationEngine` reproduces duplicate mutation on retry;
- R5 tests show same operation/same intent replays, same operation/different intent rejects.

Current evidence level: **strong hypothesis survivor**. Removing the noun while retaining the whole dispatcher is classified as hidden recreation, not reduction.

### RuleBinding

**Claim under review:** an interpreter-visible binding between evaluator and mandatory enforcement job currently survives reductions of Constraint/Invariant/Policy/lifecycle rules.

Load-bearing evidence:

- #8: Bool+failClosed and one Gate lose obligation/locus/error/combination semantics;
- #40: preview vs commit, current/pinned basis, declared dependencies;
- #42: authority currentness and result algebra;
- #41: effect-attempt controls can require a distinct locus;
- K70-22..29;
- alternate-path invariant mutant demonstrates why Action-local checks are insufficient;
- Event demotion uses the same generic lifecycle RuleBinding rather than an Event-specific dispatcher.

Current evidence level: **medium/strong hypothesis survivor** and best candidate for a future genuine R6 reduction.

## Demotion evidence map

### Event / Occurrence

Wave A evidence (#56) rejected `Event = Type + tag/interface` because immutability remained convention-only. #70 changes the composition materially: Type + generic lifecycle RuleBinding + correction-by-append.

Executable sensitivity:

- `TaggedEventEngine`: bad edit succeeds;
- R5 occurrence contract: generic update/delete rejected;
- correction creates a new occurrence and `corrects` relation;
- externally sourced occurrence needs no fake local Action.

Current state: **hypothesis demotion of base-sort status**, while occurrence meaning remains first-class. Falsifier: a legitimate exported/admin/import/migration path bypasses lifecycle enforcement.

### Constraint / Invariant

#8/#56 show boolean body alone is insufficient. #40 establishes commit/dependency pressure. #70 encodes these as evaluator + RuleBinding with system obligation at a mandatory locus. Global-invariant tests reject alternate mutation paths.

Current state: **hypothesis contract demotion**.

### Policy

#8/#42 reject Policy as Bool+failClosed. #70 keeps typed decision algebra, determining evidence, revision/currentness and RuleBinding authority locus.

Current state: **hypothesis contract demotion**, not deletion of authorization semantics.

### Projection

#39 distinguishes derivation/materialization from authority. K70-38..40 exercise stale/pinned/erasure pressure. Current state: **supported reduction to Computation/Query semantics + runtime materialization**.

### Effect

#41 is the controlling contract. #70 retains native external-I/O capability but treats request/attempt/observation/outcome as typed records. K70-41..44 and property/state-machine tests preserve unknown/pending/terminal contradiction and retry safety.

Current state: **hypothesis semantic demotion; native runtime capability required**.

### Workflow

#10/#43 converge: durable execution memory is not business Process/Commitment authority. Current state: **supported runtime demotion**.

### Fact / Statement

#4/#45 keep strong pressure for rival statements/provenance; #56 rejects Fact-only kernel. K70-35..37 show ordinary immutable Observation Types can preserve contradictions without overwriting accepted state.

Current state: **undetermined** whether a reusable Statement/Assertion contract should be standardized; no Fact base sort earned yet.

### Interface / ShapeContract

#3 supports Interface != Role/identity. K70-09..11 and the toy ShapeContract show representability, but SDK/query/Action polymorphism has not been exercised deeply enough.

Current state: **undetermined** whether Interface remains authoring/static contract or deserves stronger canonical status.

## Cross-domain semantic laws with strongest convergence

The following distinctions have multiple independent sources and are treated as load-bearing even when their encoding remains hypothetical:

```text
Action != occurrence
attempt != outcome
source evidence != accepted business state
current authority != historical approval
preview != commit
local commit != remote success
workflow execution != business fulfillment
value equality != entity identity
Role != Kind != Interface
relationship object != cheap Relation
runtime capability != semantic base form
physical representation != semantic authority
```

## Current branch verification evidence

The last green pre-review head (`f31099b5cab4888ffe646f9f094b296065a78f58`) ran the issue #70 synthesis gate successfully. The gate included the issue #70 reduction suite with Hypothesis/state-machine coverage plus the cross-ontology verification layers and PostgreSQL 18 integration inherited from #46.

This is **executable sensitivity evidence**, not proof of full-system correctness. The final review status must cite a green run on the exact post-review SHA before changing the shard to `review-clean`.

## Evidence still missing before architecture acceptance

- real backend/admin/import/migration/privacy paths for occurrence no-bypass;
- real authoring/query/codegen experiment for Relation vs Property/Link;
- full type-system experiment for entity/value/sum/record/reference types;
- Query/Search/PDP/agent execution-class boundary experiment;
- Interface variance/polymorphism across SDK/query/Actions/tools;
- a genuine attempt to remove RuleBinding without reconstructing it;
- production-style concurrency/backfill/retention experiments;
- downstream domain-library and module composition work.

These gaps are why RFC-0002 remains a hypothesis and why `review-clean` must never be interpreted as `accepted`.
