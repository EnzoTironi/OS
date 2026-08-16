# Candidate identity and delegation model

**Kind:** candidate model. Hypothesis.  
**Decision state:** hypothesis  
**Fetched:** 2026-08-16

This is a model to attack. It is not OS vocabulary and not an RFC edit.

## What must stay distinct

Four layers keep collapsing in source systems. The evidence says they are different kinds.

| Layer | What it answers | Not the same as |
| --- | --- | --- |
| Party | Who can own, commit, and be legally or economically responsible | A login, a bot, a pod |
| SoftwareAgent | Which named software process attempted the work | The party it represents |
| Workload identity | Which compute process presented a credential | A business actor |
| Authority context | Which grant allowed this attempt, on what, until when | The agent's standing membership |

**Kind:** candidate law, see L1 through L4.  
**Support:** E9, E10, E11, E14, E17.

RFC-0001 already says an AI agent may implement Actor, Principal, and SoftwareAgent rather than become a primitive. This model keeps that stance. **Decision state:** supported as a non-primitive, still hypothesis as a type set.

## Kinds

### Party

A Party is a ValueFlows-shaped economic agent. Person and Organization are the ones issue 11 needs. EcologicalAgent is out of scope here.

A Party can be the subject of a commercial commitment. A SoftwareAgent cannot, unless later evidence overturns E10.

**Kind:** domain evidence mapped to a candidate type.  
**Decision state:** hypothesis.  
**Counterexample that would matter.** A jurisdiction that treats a named software agent as the legal party to a contract, with no human or organization behind it.

### SoftwareAgent

A SoftwareAgent is a named, durable software actor. PROV-O already has the subclass. OpenFGA `type agent` is the authorization projection of the same idea.

It can be a Principal. It can be an Actor. It is not a Party by default.

Automations, copilots, batch jobs, and long-running workers are SoftwareAgents if they have stable identity and can be revoked. A one-off script with no name is a smell. Give it a name or refuse the run. E17.

### Service and connector

A Service is a SoftwareAgent whose job is to talk to an external system. It has its own credentials. Those credentials are not the Party's identity and not the calling agent's identity.

**Kind:** source-system artifact to avoid. Connector tokens that impersonate the user are the usual confused-deputy setup. E20, E14.

### Workload identity

A Workload identity is a SPIFFE-like name for a process. It belongs in provenance and in transport authentication. It does not appear as the business Actor unless the organization has literally made that process a Party, which this model rejects.

**Decision state:** supported that workload identity is not a Party. E9 versus E10.

### Principal

A Principal is whoever a policy check evaluates. Cedar's wording is the right one. User, service, or other identity.

Candidates that can be Principals:

- Person
- Organization, when the organization itself is the actor
- SoftwareAgent
- Task grant, when the check is "does this grant allow the tool"
- Automation principal, when there is no human trigger

A role is not a Principal. E8.

### Actor

An Actor is who attempted the Action. Schema.org uses `agent` for the direct performer. RFC 8693 uses `actor_token` for the acting party.

Every Action invocation has exactly one Actor. The Actor is never null. E17, E18.

The Actor is usually a SoftwareAgent or a Person. When a Person clicks a button, the Person is the Actor and there is no deputy. RFC 8693 says that case is neither delegation nor impersonation.

### Authority context, the grant

A grant is a first-class object. OpenFGA `task` is the closest source artifact. Do not copy the tuple schema. Keep the behavior.

A grant records:

- `actor`. Who may use it.
- `subject`. The Party or Person on whose behalf the actor works. Absent when the actor acts for itself.
- `mode`. `own`, `on_behalf_of`, or `impersonate`.
- `actions` and `resources`. Object and verb scope.
- `purpose` or `task`. Why this grant exists.
- `session`. Optional grouping of tasks.
- `not_before` and `not_after`.
- `call_limit` and `calls_used`.
- `money_limit` and `money_used`. Expressible, not yet a named primitive. E22.
- `bound_workloads`. Optional SPIFFE-like restriction.
- `parent_grant`. For sub-delegation. Child scope must be a subset.
- `revoked_at`.
- `policy_revision` and `ontology_revision` pinned at issuance.

**Kind:** candidate law L5 through L8.  
**Decision state:** hypothesis.

`impersonate` means the downstream check sees only the subject. That mode is the dangerous one. Prefer `on_behalf_of`, where both identities remain. E1, E14.

## Acting as versus on behalf of

| Mode | Downstream principal | Audit | When |
| --- | --- | --- | --- |
| `own` | Actor | Actor | The agent or person acts as itself |
| `on_behalf_of` | Actor, with subject visible | Actor representing subject | Default for copilots and services |
| `impersonate` | Subject only | Must still record the real actor in provenance, or the mode is forbidden | Break-glass, user-present admin tools. Never the default for AI |

**Kind:** domain evidence. E1, E14.  
**Decision state:** supported as a distinction. Hypothesis as OS vocabulary.

OpenFGA durable membership (E2) is `own` or a standing `on_behalf_of` with wide scope. OpenFGA task grants (E3) are purpose-scoped `on_behalf_of`. Do not implement one and claim you have the other.

## Invocation record

**Kind:** candidate model for runtime pressure.

Every Action attempt writes a record that can reconstruct:

```text
actor            SoftwareAgent or Person
subject          Party or Person, if mode is not own
mode             own | on_behalf_of | impersonate
grant            id of the authority context
workload         SPIFFE-like process identity
connector        Service that left the process, if any
surface          ui | api | mcp | automation | other
action           the business Action and parameters
policy_revision
ontology_revision
decision         allow | deny
reasons          determining policies or relations
```

Attribution is this record. Ownership of created objects is a separate fact. E17. Palantir even allows creating an object the submitter cannot view (E19). That is a source artifact, not a law. OS should decide ownership explicitly rather than stamp the Actor as owner.

PROV mapping, if a later provenance issue wants it:

- Actor `wasAssociatedWith` the Activity.
- Actor `actedOnBehalfOf` Subject when mode is `on_behalf_of`.
- Workload and connector are additional agents or instruments on the same activity. Schema.org would call the runtime an `instrument`. PROV would call it a SoftwareAgent. That disagreement is recorded, not resolved. See `open-questions.md`.

## How a check should run

**Kind:** runtime consequence. Hypothesis.

1. Authenticate the workload. Fail closed if the process has no identity. E9, E18.
2. Authenticate the Actor. A SoftwareAgent presents its own id, not the user's password.
3. Load the grant. Fail closed if missing, expired, revoked, or over limit. E3, E5.
4. Confirm the Actor is bound to the grant. The bind must come from server-side facts, not from a client-supplied contextual tuple. E4.
5. If mode is `on_behalf_of`, confirm the subject still delegates to this actor for this purpose.
6. Evaluate policy on principal, action, resource, and context. Default deny. Explicit forbid wins. E6.
7. The principal for the check is the Actor under the grant, not a copied snapshot of the subject's role set. Intersection with the subject is allowed. Union is not. ObjectStack's ceiling intersection is the source artifact (E18).
8. Evaluate SoD on identities. The Actor cannot satisfy the second pair of eyes for a proposal it created. E15.
9. Before commit, re-read state if the Action is the kind S-003 cares about. A live grant does not freeze the world.
10. Write the invocation record. Then apply effects.

## Convergence

Independent sources agree on these distinctions.

| Distinction | Sources |
| --- | --- |
| Deputy is not the subject | OpenFGA E1, RFC 8693 E14, PROV E11 |
| Software can be an identity without being a legal party | PROV E11, ValueFlows E10, SPIFFE E9 |
| Policy is principal, action, resource, context | Cedar E6, RFC-0001, NIST ABAC E16 |
| Grants can expire and count uses | OpenFGA E3 E5, Cedar context E6, RFC 8693 `expires_in` |
| No anonymous actor | ObjectStack E17 E18, Cedar implicit deny E6 |
| SoD needs two different identities | NIST E15 |
| Workload identity is a trust-domain path, not a person | SPIFFE E9 |
| Action apply is its own permission | Palantir E19, thesis shared Action E21 |

## Divergence

| Topic | Disagreement | Why it might exist |
| --- | --- | --- |
| Is software an Agent | PROV and FOAF yes. ValueFlows not yet. Schema.org uses instrument | Economic agency versus causal responsibility |
| Is `task` a principal | OpenFGA yes. Cedar would keep the person or service as principal and put the task in context | ReBAC wants a node. ABAC wants attributes |
| Fail-open versus fail-closed | ObjectStack historically skipped checks on empty identity. Cedar denies by default | Implementation accident versus language design |
| Durable agent membership | OpenFGA offers it. Task-based docs tell you to start at zero | Product convenience versus least privilege |
| Trusted action bodies | ObjectStack and the in-repo landscape note that a body can exceed the caller. Palantir still checks submission criteria before side effects | Framework convenience versus apply-time policy |
| Cross-tenant isolation | ObjectStack uses one database per environment and calls the hard problem absent. SPIFFE allows colliding trust-domain names and relies on cryptographic roots | Physical isolation versus name isolation |

## Source artifacts, do not import

- OpenFGA tuple DSL and contextual-tuple protocol.
- Cedar syntax and Amazon Verified Permissions hosting.
- SPIFFE URI scheme as a required OS identifier.
- ObjectStack `runAs` enum and `EvalUser` record.
- Palantir Compass projects and Restricted Views.
- Salesforce "Automated Process" user.

Steal the distinctions. Do not steal the schemas.

## What would falsify this model

- A domain where a SoftwareAgent must be the Party or the commercial facts become unintelligible.
- A domain where impersonation with no remaining actor record is required for lawful audit.
- A working system that keeps human, agent, workload, and connector in one id without losing SoD or incident response.
- Evidence that task-scoped grants can be recovered from ordinary role assignment without extra state.

If those show up, revise the model. Do not quietly keep it.
