# Zoen final architecture

## Product thesis

Zoen is three products on one pre-launch Fly app.

1. Ontology: one `zoen` kernel exposed through CLI, Connect API, and MCP.
2. Conversation: Eve in `apps/conversation`.
3. Auth door: Better Auth in `apps/auth`.

Everything else is internal structure. There is no fourth product, no governance dashboard, and no channel-specific mini system.

The product bar is simple on the surface and strict underneath. Conversation should feel close, direct, and human. Authority should feel published, attributable, and safe.

## Synthesis decision

The final shape uses candidate 1 as the base, then grafts the strongest parts of candidates 2 and 3.

Why candidate 1 won:

- It has the best top-level contract. `WorldRelease` makes ontology, policy, executors, and components move together.
- It keeps the public verb catalog small and deep.
- It makes CLI, Connect, MCP, and Eve honest adapters instead of parallel systems.
- It fits the repo laws without inventing a new product.

What was grafted from candidate 2:

- Per-turn `TurnCapability` and `PersonHost` style admission boundary.
- Per-conversation membership selection instead of shared mutable "active workspace".
- Channel linking by one-time intent, never by machine admin secret.
- Eve as the only path from conversation to ontology.

What was grafted from candidate 3:

- The explicit `World` model that scales from person to family, clinic, and factory.
- The idea that memberships, channels, agents, automations, and policy are governed concepts.
- Server-side opaque cursor state and strong read boundary design.
- A one-Fly topology that still includes projection and production `ZoenEffect` runtime.

What was rejected:

- A `Cell` concept on the public surface for launch. It adds too much conceptual load too early. A `World` plus memberships is enough for the first coherent product.
- A standalone governance app. The work belongs inside Eve's membership workbench.
- Provider-specific actions, provider-specific engine branches, global credentials, fixed operation IDs, boot-only policy, and any "unbound" shared workspace.

### Candidate score

| Criterion | Candidate 1 | Candidate 2 | Candidate 3 | Final synthesis |
| --- | --- | --- | --- | --- |
| Three-product law | 10 | 10 | 9 | 10 |
| Conversational bar | 8 | 10 | 7 | 9 |
| Ontology authority bar | 10 | 8 | 9 | 10 |
| Identity and security | 8 | 10 | 8 | 10 |
| Type and boundary coherence | 9 | 9 | 8 | 9 |
| Generic engine | 10 | 9 | 8 | 10 |
| Same language across CLI/API/MCP/Eve | 10 | 8 | 9 | 10 |
| One-Fly operability | 9 | 9 | 9 | 9 |
| Delivery by journeys | 9 | 10 | 8 | 10 |
| Concept load | 8 | 8 | 6 | 8 |

## Final product model

### Public concepts

- `Account`: one human identity across auth methods and channels.
- `World`: the authority space where a person, family, clinic, or factory operates.
- `Membership`: the account acting inside a world with role, delegation, clearance, and optional default selection.
- `WorldRelease`: the immutable published meaning of a world at a point in time.
- `ChannelBinding`: a verified delivery path bound to an account, never a raw provider subject in public APIs.
- `Proposal` and `Receipt`: governed action lifecycle.
- `Evidence`: attributed claims with provenance and valid time.
- `ExecutorCall`: a generic effect request minted from a committed action or automation.

### Core rule

No request may combine ontology from one release with policy or executor catalog from another. The release is the unit of meaning.

## Public verb catalog

The final product should collapse to seven public verbs everywhere:

- `Discover`
- `Query`
- `Propose`
- `Decide`
- `Commit`
- `Explain`
- `Execute`

Those seven verbs are the human and agent contract. `Decide` records an approval or rejection by its own principal. CLI, Connect, MCP, and Eve all call the same kernel. They differ in transport and presentation, not semantics.

Builder operations such as publish and activate are still governed actions, not a separate protocol family.

## The kernel boundary

```rust
trait WorldKernel {
    fn discover(&self, ctx: &TrustedExecutionContext, request: DiscoverRequest)
        -> Result<DiscoverResult>;

    fn query(&self, ctx: &TrustedExecutionContext, request: QueryRequest)
        -> Result<QueryPage>;

    fn propose(&self, ctx: &TrustedExecutionContext, request: ActionInput)
        -> Result<Proposal>;

    fn decide(&self, ctx: &TrustedExecutionContext, request: Decision)
        -> Result<DecisionReceipt>;

    fn commit(&self, ctx: &TrustedExecutionContext, proposal: ProposalId)
        -> Result<Receipt>;

    fn explain(&self, ctx: &TrustedExecutionContext, subject: ExplainSubject)
        -> Result<Explanation>;

    fn execute(&self, ctx: &TrustedExecutionContext, request: ExecuteRequest)
        -> Result<ExecutionReceipt>;
}
```

The implementation path stays short:

```text
resolve release
-> evaluate Cedar
-> validate typed input
-> run one authority transaction
-> append receipt and outbox
-> trigger projection and automation
```

## Identity and turn model

This is the most important correction to the current repo.

### Boundary flow

```text
verified web session or verified channel event
-> SessionBroker / PersonHost
-> Account + ChannelBinding + active Membership
-> TurnCapability
-> TrustedExecutionContext
-> WorldKernel
```

### Rules

- Eve tools never reconstruct authority from environment variables.
- Eve tools never mint fixed operation IDs from action IDs.
- Raw provider subject stays private to the boundary store.
- Cross-channel continuity happens only after both channels bind to the same `Account`.
- Membership selection is scoped to a conversation or web session, not globally shared.
- Unknown channel subjects do not enter a shared `unbound` workbench.

### Key types

```rust
struct AccountId(Uuid);
struct WorldId(Uuid);
struct MembershipId(Uuid);
struct ChannelBindingId(Uuid);
struct OperationId(Uuid);
struct ReleaseDigest([u8; 32]);

enum Principal {
    Human(AccountId),
    Workload(AgentBindingId),
}

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

struct TrustedExecutionContext {
    principal: Principal,
    world: WorldId,
    membership: MembershipId,
    actor: Actor,
    release: WorldRelease,
    operation: OperationId,
    source: InvocationSource,
}

struct TurnCapability {
    turn_id: EveTurnId,
    command_namespace: String,
    context: TrustedExecutionContext,
    delivery: Option<ChannelBindingId>,
}
```

## World release

`WorldRelease` is the load-bearing object.

`WorldReleaseContent` and `WorldRelease` keep every field private. Their canonical constructor derives `ReleaseDigest`; callers cannot supply it. This is type encapsulation, not secrecy. Publication time, principal, and policy evidence live only in `WorldReleasePublication`.

It binds:

- ontology definition digest
- governed policy bundle digest
- executor catalog digest
- component or computation manifest digest

This removes the current drift between definition, policy, deploy config, and effect behavior.

### Release pipeline

```text
publish candidate
-> validate
-> run scenario preview
-> owner approval
-> activate release
```

A pack can exist as distribution of meaning, but it is not a new product. A pack only creates a candidate release.

## Query and cursor policy

The current query model leaks too much. Final shape:

- authorization happens before page assembly
- cursor is opaque and sealed
- cursor includes release and policy binding
- replay under another membership or policy fails closed
- server budgets bound scan size and compute cost

The client never sees raw entity IDs in the cursor.

## Evidence, effects, and compute

### Evidence

Evidence writes require a source-bound credential and a published source shape. Same-world membership alone is not enough to write arbitrary evidence.

### Effects

Public effect reads return sanitized status. Raw effect payload is visible only to the executor or reconciler with explicit authority.

### Compute

Computations run under server-owned budget classes. Clients and agents do not set their own CPU, memory, or scan ceilings.

## Eve

Eve is the relationship layer, not a dashboard shell.

### Conversation

- plain, readable text
- no internal IDs in chat
- receipts and explanations available when needed
- approvals feel contextual, not procedural

### Membership workbench

Depth lives here:

- current world and membership switcher
- "what Eve knows"
- evidence and valid time
- approvals and receipts
- channels and integrations
- members, roles, and delegations
- activity and causal explanations

The workbench is inside Eve. No separate governance app.

## Better Auth door

The door owns:

- sign up and sign in
- passkeys and social auth
- complete device flow for CLI
- account recovery
- channel linking confirmation
- progressive integration consent

After sign-in, the person lands in Eve's workbench with an active membership, not in a raw auth app and not in a fourth product.

## Ontology surfaces

### CLI

Operator and builder surface. Good for explicit world operations and scriptability.

### Connect API

Typed transport for product surfaces and integrations.

### MCP

Thin adapter over the same catalog. Tool and resource discovery should be generated from the active release and caller authority, not hand-maintained.

### Eve

Dynamic tools derived from the same release and filtered by active membership. Eve can ask for approval, resume, and commit through the same governed path.

## Automation

Automation must stay generic.

```rust
struct AutomationDefinition {
    trigger: Trigger,
    schedule: Option<TimestampExpr>,
    executor: ExecutorRef,
    input_mapping: Mapping,
}

struct ExecutorCall {
    id: OperationId,
    executor: ExecutorRef,
    schema: Digest,
    canonical_input: CanonicalJson,
    due_at: Option<Timestamp>,
    authority: AuthorityProof,
}
```

The engine never knows "WhatsApp reminder" or "Telegram reminder". It only knows governed automation and executor calls. Eve owns the rendering and channel adapters.

## One-Fly deployment

Pre-launch topology stays one Fly app.

```text
public ingress
  -> web/router
      -> Better Auth
      -> Eve
      -> Connect
      -> MCP
      -> kernel
      -> projection worker
      -> effect runtime

shared backing:
  Postgres with RLS and outbox
  object storage for immutable artifacts
  Restate only for ZoenEffect durability
  DataFusion and Wasmtime under server budgets
```

### Required operational fixes

- ship `zoen-projection` in production
- ship production `ZoenEffect` handler
- wire correct `ZOEN_ZOEND_BASE_URL` and workbench URLs
- delete `deploy/fly/policies.json` as permanent runtime authority
- make `/ready` verify release, policy, projection watermark, Restate registration, Eve, and Auth

## Target module map

```text
crates/zoen-core
  world, release, identity, action, evidence, automation, effect, catalog

crates/zoen-engine
  WorldCatalog, policy, authority commit, query, publish, budgets, ports

crates/zoen-adapters
  Postgres/RLS, Cedar, DataFusion, Wasmtime, sealed cursors, Restate

apps/zoend
  composition root, Connect, MCP, projection, dispatcher, effect runtime

apps/conversation
  SessionBroker, workbench, Kapso, Telegram, delivery port

apps/auth
  Better Auth door, device flow, LinkIntent
```

Delete rather than wrap:

- legacy `/channels/*`
- `conversation_stage` as product truth
- process-global Eve credentials
- action-derived fixed IDs
- shared `unbound` workbench path
- boot-only Fly policy authority

## Launch proof examples

These seven examples illustrate product behavior. They are not the acceptance catalog.

1. J5: One person signs in, links WhatsApp and Telegram, and gets one identity across both channels.
2. J2: Eve remembers a fact only after a governed receipt exists.
3. J6: Eve schedules two reminders, retries safely, and delivers once through the verified origin channel.
4. J3: One family member proposes an action and another approves it within scoped authority.
5. J4: A clinic agent reads only authorized patient objects and can explain why.
6. J7: A factory MCP agent discovers, proposes, commits, and explains the same verbs.
7. Every action, effect, evidence write, policy decision, and agent invocation is attributable.

## Execution order

This should be executed in vertical product waves, not repo-layer batches.

1. Product truth and deploy baseline.
   Remove legacy channel paths, fix Fly topology, package projection and effect runtime, fix policy coverage.
2. Identity and turn admission.
   Land `Account`, `ChannelBinding`, `Membership`, `TurnCapability`, `LinkIntent`, and complete device flow.
3. World release and kernel contract.
   Make release binding, policy-before-pagination, opaque cursors, and server budgets real.
4. Governed core journeys.
   Ship memory receipt, family approval, invite-in-transaction, and evidence boundary fixes.
5. Generic automation and delivery.
   Replace fixed reminder plumbing with generic `AutomationDefinition` and `ExecutorCall`.
6. Eve workbench and auth finish.
   Finish the membership workbench, progressive consent, and clear identity or link error states.
7. MCP and packs.
   Expose the same verb catalog through inbound MCP and add release preview and packs last.

## PR guidance

Use this architecture as the filter for open work.

- Keep and restack work that moves toward one kernel contract and real Connect transport.
- Drop work that hardcodes reminder or channel semantics into the generic engine.
- Drop work that replaces Restate, adds unit tests, or keeps boot-time compatibility clutter.
- Redesign identity work around verified link intent and per-turn capability.

## Reference bar

These sources informed the product bar, not the product naming:

- Poke official site for the conversational bar: https://poke.com/
- Palantir Ontology docs for the authority bar: https://www.palantir.com/docs/foundry/architecture-center/ontology-system
- Restate docs for durable effect runtime shape: https://docs.restate.dev/
- MCP 2026-07-28 spec release for the inbound server shape: https://blog.modelcontextprotocol.io/posts/2026-07-28/
