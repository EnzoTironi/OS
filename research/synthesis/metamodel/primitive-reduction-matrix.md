# Primitive reduction matrix

**Issue:** #70  
**Status:** synthesis hypothesis, not RFC decision.

The matrix distinguishes:

- **retain/base** — current evidence requires a directly interpreted executable form;
- **contract** — semantics remain first-class/reusable but are composition over base forms;
- **runtime** — privileged enforcement/execution capability, not a semantic sort;
- **domain** — ordinary ontology Type/pattern;
- **tooling** — authoring/physical/package concern;
- **undetermined** — reduction has not yet survived enough counterexamples.

## Candidate board

| Candidate | R5 class | Why it can/cannot reduce | Generic enforcement that must survive | Primary kill / revival criterion |
| --- | --- | --- | --- | --- |
| `Type` / `ObjectType` | **retain/base** | Identity/equality/classification cannot become query folklore without breaking merge, roles and references | entity identity; value equality; type conformance; lifecycle contracts | Delete Type and preserve stable identity, one identity principle, value/entity distinction and static validation without recreating a type system |
| `Property` | **contract over Relation** | Scalar attribute is a typed relation to a value with cardinality | target value type, required/optional/many, uniqueness, units/composite value validation | Revive if real property semantics repeatedly require hidden machinery not expressible by Relation constraints |
| `Link` | **contract over Relation** | Entity association is a typed relation whose endpoints have identity | endpoint typing, cardinality, navigation, participation | Revive if object-to-object relations need a fundamentally different semantic algebra from value relations |
| `Relation` | **retain/base** | Some typed association/predicate form remains necessary after Property/Link collapse | arity, endpoint typing, cardinality, uniqueness/exclusivity, relation-level provenance where declared | Delete Relation and preserve cheap associations without turning all of them into fake objects or untyped fields |
| `Relator` | **domain pattern** | Relationship with lifecycle can be ordinary identifiable Type + participant Relations | ordinary Type identity + relationship constraints + targetable Actions | Revive only if multiple domains require special relator enforcement impossible via Type/Relation/RuleBinding |
| `Role` | **domain pattern** | Anti-rigid relational classification can be represented by relationship objects/relations and derived membership | role membership outside identity key; founding relation; validity | Revive only if composition cannot enforce anti-rigidity/relational dependence across multiple domains |
| `Phase` | **domain pattern** | Intrinsic contingent classification can be derived/stored under ordinary rules | exclusivity/transition constraints as applicable | Revive only if phase semantics require a universal engine behavior beyond RuleBinding |
| `Interface` | **standard schema/capability contract** | Shared shape/capability is not identity and not Role; can constrain Type signatures | static conformance over required Relations/Actions/Computation signatures; polymorphic query/action compatibility | Revive as base sort if structural/nominal contract composition cannot support safe polymorphic Actions/Relations without hidden per-tool rules |
| `Function` | **rename/reduce to Computation** | “Function” is too broad if it includes pure derive, solver, agent and external I/O | typed input/output, revision, declared execution class, dependency/purity boundary | Revive separate forms if one Computation contract cannot statically prevent illegal execution modes/result algebras without opaque flags |
| `Computation` / Wave-A `Eval` | **retain/base, hypothesis** | Reusable version-pinned executable logic is needed independently of mutation | no direct authoritative mutation; typed dependencies/results; revision; execution-class capability checks | Delete it and preserve reusable deterministic/derived/decision logic without embedding code separately in every Action/Rule |
| `Search` / solver | **runtime/computation class** | Search returns solve-status/certificates, but may be one declared Computation execution class | result algebra `unsat/feasible/optimal/...`; bounded resources; no implicit commit | Revive as base form if treating it as Computation systematically loses decision-variable/search semantics |
| agentic judgment | **runtime/computation class** | Judgment may return typed uncertain evidence without becoming authority | provenance/model/config; uncertainty; cannot directly satisfy non-waivable system/authority rule unless policy explicitly admits it | Revive a dedicated form only if generic Computation contracts cannot contain nondeterminism safely |
| `Constraint` | **standard RuleBinding contract** | Boolean/body shape is not the primitive; obligation/locus/currentness/error semantics are | mandatory evaluation on declared mutation paths; explanation and revision | Revive if constraint semantics cannot compose from evaluator + binding without convention-only bypass |
| `Invariant` | **standard RuleBinding contract** | System obligation enforced on all relevant exported mutations is a binding job | non-waivable commit/lifecycle enforcement; dependency scope; transaction integration | Revive if engine cannot know “all relevant mutations” generically without native invariant sort—unless RuleBinding already is that form |
| `Policy` | **standard RuleBinding contract** | Authority is not a Bool, but decision algebra can be referenced by a binding rather than a Policy sort | actor/resource/context, model revision, currentness, fail/error combination, determining evidence | Revive if authorization requires a semantic form not expressible by generic binding to a typed decision evaluator/PDP |
| pre/postcondition | **standard RuleBinding contract** | Obligation and locus distinguish them | before/after state basis; obligated party; failure algebra | Revive only if generic locus/obligation cannot express caller/system guarantee |
| Wave-A `Bind` | **becomes `RuleBinding`, retain/base hypothesis** | Reviewed cases require an explicit, versioned link between evaluator and mandatory enforcement locus; metadata hidden in Action code repeatedly failed | scope/locus/basis/obligation/error algebra/combination/revision; fail-safe invocation by engine | Kill R5 by showing RuleBinding can be ordinary Relation/Type metadata with identical static/runtime guarantees and no hidden interpreter branch |
| `Action` | **retain/base, strong hypothesis** | Attempted intervention needs invocation/intent/actor/commit semantics absent from Computation | stable operation ID; intent digest; authority; state basis; atomic commit; replay/mismatch; causal outcomes/effects | Delete it only if composition preserves all these without recreating an Action/Operation protocol under another name |
| `Event` / occurrence | **standard semantic contract over Type, hypothesis** | Wave A killed an unenforced tag; Wave B provides generic lifecycle/commit enforcement that may make a separate sort unnecessary | occurrence nature; create-only/append history; correction by new operation/occurrence; source/causal identity | **Critical kill:** any lower-level mutation path can edit/delete a committed occurrence despite the generic lifecycle binding. Then promote Event or strengthen generic lifecycle enforcement |
| `Fact` | **undetermined; likely standard evidence/assertion pattern** | Fact-only kernel is rejected; conflicting assertions can be ordinary immutable assertion/evidence Types + Relations + provenance | preserve rival assertions, provenance, authority, derivation, temporal axes actually present | Revive as base sort if generic query/history/provenance/authority operations cannot be enforced/optimized without a universal statement identity/form |
| `Observation` | **standard evidence contract** | #45 needs evidence-vs-truth distinction, not necessarily a native sort | source identity, capture/run revision, immutability, assurance, unresolved state | Revive if ingest/runtime requires universal semantics impossible on ordinary Types/contracts |
| source/entity `Binding` | **domain/governance relation-object** | Exact identity mapping needs identity/history/provenance but can be ordinary Type/Relation | effectivity, revision, correction/split/rebind, Action authority | Revive if generic merge/split/rebind enforcement cannot be expressed compositionally |
| `Projection` | **runtime materialization of Computation/Query** | Derived state is semantics of derivation + physical freshness/materialization | lineage, revision, freshness watermark, rebuild/erasure, read authority | Revive only if “projection” has domain semantics not reducible to derivation/materialization contract |
| `Effect` / `EffectType` | **runtime capability + standard typed records** | #41 M-E2 survived: external I/O privilege is native; request/attempt/outcome can be ordinary Types | capability allowlist, environment/credentials, stable local EffectRequest identity, protocol-specific retry/reconcile, unknown outcome | Revive semantic Effect sort if convention drift makes enforcement impossible despite a native capability boundary |
| `Workflow` | **runtime** | #43 rejects orchestration memory as business authority | durable timers/waits/replay/versioning; no semantic mutation by cursor alone | Revive only if business meaning depends irreducibly on engine execution state—which reviewed cases reject |
| `Process` | **domain Type** | Economic/manufacturing transformation can have identity independent of workflow implementation | ordinary identity, links to specification/commitments/events/actions | Promote only if generic engine must treat every Process specially across domains |
| `ProcessSpecification` | **domain Type** | BOM/routing/recipe/process definition is domain knowledge | ordinary revision/type/relations | No primitive evidence |
| `Intent` | **domain Type** | planned/proposed future flow | ordinary lifecycle/relations/actions | No primitive evidence |
| `Commitment` | **domain Type** | promised future flow/obligation has independent economic meaning | fulfillment/discharge relations and governed Actions | No primitive evidence; runtime timers do not change this |
| `Claim` | **domain Type** | economic receivable/owed reciprocity | settlement relations/events/actions | No primitive evidence |
| `Agreement` | **domain Type** | bundle of commitments/economic relations | ordinary identity/relations/actions | No primitive evidence |
| `Grant` / Delegation | **domain/governance Type** | scoped authority relationship can be ordinary relator-like object | PDP/RuleBinding consumes its current/historical revision | Promote only if generic authorization cannot enforce without native Grant semantic sort |
| `Role` for authorization | **domain relation/pattern** | Role is context-dependent authority relation, not actor identity | PDP relation evaluation; SoD; currentness | Do not make Role an identity primitive |
| Proposal | **optional domain/governance Type** | many Actions do not need proposal stage | if present, immutable intent/bounds/basis reference | No universal primitive evidence |
| Approval | **optional domain/governance Type** | durable governance evidence distinct from PDP permit | actor/grant/SoD/proposal binding/revision | No universal primitive evidence |
| `StateBasis` | **Action/RuleBinding transaction contract** | capability is required, named sort not yet earned | explicit live/pinned/as-of dependencies; commit revalidation | Promote only if composition repeatedly cannot explain/enforce basis identity/reuse |
| `CommitWitness` | **audit graph/projection** | can derive/store causal evidence rather than one native business object | immutable enough evidence to explain committed operation | Promote only if generic audit reconstruction cannot meet correctness/retention needs |
| identity | **cross-cutting Type semantics** | required, but not a business noun/sort | stable references; merge/split/re-identification Actions; value vs entity equality | Keep outside arbitrary source primary keys |
| provenance | **cross-cutting standard Relations/contracts** | source/derivation/actor/evidence vary by record, not one universal Fact row | required provenance where authority/explanation needs it | Promote a native provenance node only if generic contracts cannot enforce/query required lineage |
| time | **cross-cutting typed values/Relations** | valid/effective/occurrence/capture/commit/provider/workflow times are distinct | type/semantic names for actual axes; no universal two-clock property | Universal `ValidTime/SystemTime` primitive remains rejected |
| ontology/policy/function revision | **cross-cutting definition identity** | historical operations need exact definition bindings | immutable/content-addressed or equivalent revision references | Not one global version number |
| `Pack` | **tooling** | distribution/module unit | dependency/version/install tooling | Not reality semantics |
| compiler/codegen | **tooling** | materializes SDK/schema/index/UI optimizations | must preserve semantic definitions | Not domain/metamodel primitive |
| storage table/node/fact row | **physical** | implementation representation | #39 authority/projection contracts | Never promoted from storage convenience |
| MCP/API/UI button | **surface** | projection of Action/Query/Type semantics | same authorization/action boundary | Never source of business semantics |

## R5 base-form pressure

The five surviving forms are not equally certain.

| R5 form | Current confidence | Main reason | Main attack |
| --- | --- | --- | --- |
| Type | strong | identity/equality/classification | can one relational/fact calculus supply identity without hidden type machinery? |
| Relation | strong | typed association survives Property/Link/Relator reduction | scalar property semantics may force a distinct attribute form |
| Computation | medium-strong | reusable versioned logic separate from mutation | execution classes may be too heterogeneous |
| Action | strong | attempted intervention + semantic commit protocol | perhaps operation = Type + Computation + RuleBinding + commit capability |
| RuleBinding | medium | enforcement locus/basis/error algebra repeatedly survives reductions | perhaps it is merely a typed Relation between definitions, with runtime capability reading it |

`Action` and `RuleBinding` deserve special scrutiny because a dishonest reduction can remove the noun while recreating the exact protocol in hidden runtime code.

## Non-base contracts that remain semantically important

Demotion is not deletion. These should remain visible in authoring/docs/query/explanation where useful:

```text
Occurrence/Event
Interface/ShapeContract
Invariant
Policy
Observation/Evidence
Projection
EffectRequest
Role
Commitment
Process
```

The claim is only that their semantics can be defined compositionally from R5 + runtime capabilities.

## Kill-test priority

1. **Event demotion:** prove create-only lifecycle cannot be bypassed through generic mutation.
2. **Action survival:** prove deleting Action either loses semantic operation identity or recreates an Action protocol.
3. **RuleBinding survival:** prove preview/commit, current/pinned basis, false/error and authority folds require explicit first-class binding semantics.
4. **Property+Link unification:** prove one Relation algebra handles value/entity endpoints and lifecycle threshold cleanly.
5. **Fact demotion:** preserve two contradictory observations plus one accepted decision without overwriting provenance.
6. **Effect demotion:** remote timeout/unknown/idempotency expiry remain correct without semantic Effect sort.
7. **Interface demotion:** polymorphic Actions/queries remain statically safe without confusing role/identity.
8. **Projection demotion:** stale materialization cannot become commit authority merely because it is fast.

A reduction passes representation-only tests but fails #70 if enforcement is still convention-only.
