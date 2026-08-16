# Candidate laws

**Kind:** candidate law list  
**Fetched:** 2026-08-16  
**Decision state:** each law has its own. None is `accepted`.

A law is a claim that could be wrong. The falsifier is part of the claim.

## L1. Every Action invocation has a concrete Actor

**Claim.** An Action attempt names an Actor that exists. Null, anonymous, and "system implied" are not Actors.

**Kind:** candidate law  
**Decision state:** supported  
**Evidence.** E17, E18, E6 implicit deny, E21 thesis.  
**Runtime consequence.** Missing identity is a defect, not an authorization.  
**Falsifier.** A lawful, auditable enterprise action that cannot name who attempted it.

## L2. Workload identity is not a Party

**Claim.** A cryptographic process name authenticates a compute endpoint. It does not make that endpoint a Person or Organization.

**Kind:** candidate law  
**Decision state:** supported  
**Evidence.** E9 versus E10.  
**Runtime consequence.** SPIFFE-like ids belong on the invocation record, not on `provider` or `owner`.  
**Falsifier.** A domain where the process is the only identifiable economic agent and collapsing the layers loses no meaning.

## L3. A SoftwareAgent is not a Party by default

**Claim.** Named software can bear causal responsibility and can be a Principal. It cannot, by default, commit economically under its own authority.

**Kind:** candidate law  
**Decision state:** hypothesis  
**Evidence.** E10 rejects software as ValueFlows Agent. E11 includes SoftwareAgent as a responsible agent. E13 puts software in `instrument`.  
**Divergence.** The word Agent is doing three jobs.  
**Falsifier.** Legal or operational practice that treats a named bot as the contracting party with no Person or Organization behind it.

## L4. "As" and "on behalf of" are different modes

**Claim.** Impersonation makes the deputy indistinguishable from the subject to the receiver. Delegation keeps both identities. Acting for oneself is a third mode.

**Kind:** candidate law  
**Decision state:** supported as a distinction. Hypothesis as OS vocabulary.  
**Evidence.** E1, E14, E11 `actedOnBehalfOf`.  
**Runtime consequence.** Default mode for AI and services is `on_behalf_of`. `impersonate` is explicit and rare.  
**Falsifier.** A receiver that must not learn the deputy exists, and an audit that still reconstructs the deputy without recording it on the invocation.

## L5. Durable membership and task grants are different facts

**Claim.** "This agent is a project member" is not the same fact as "this agent may call `CreateTicket` on project X for the next ten minutes."

**Kind:** candidate law  
**Decision state:** supported  
**Evidence.** E2 and E3, from the same vendor, as orthogonal patterns.  
**Runtime consequence.** Implementing only membership will over-grant. Implementing only tasks will not cover standing automations.  
**Falsifier.** A reduction that expresses every standing automation as a task without extra state, or every task as a role, without losing expiration, bind, or revocation.

## L6. A grant starts empty and names its scope and life

**Claim.** A new SoftwareAgent can do nothing. Authority is added by grants that name actions, objects, purpose, time, and optional call or money limits.

**Kind:** candidate law  
**Decision state:** hypothesis  
**Evidence.** E3, E5, E16, E22. Money is expressible and not named.  
**Runtime consequence.** Cleanup and revocation are part of the grant life, not a log line.  
**Falsifier.** A safe default in which agents inherit the triggering user's full footprint and no incident follows.

## L7. Policy evaluates principal, action, resource, and context, and fails closed

**Claim.** The authorization question is Cedar's question. Default is deny. A matching forbid wins.

**Kind:** candidate law  
**Decision state:** supported as a shape. Hypothesis as a primitive named Policy.  
**Evidence.** E6, E16, RFC-0001 Policy candidate.  
**Runtime consequence.** Do not edit RFC-0001 from this folder alone. Independent sources already converge on the shape. A later synthesis may promote it.  
**Falsifier.** A required enterprise rule that cannot be stated over those four inputs without a hidden fifth authority.

## L8. The principal of the check is the Actor under the grant, not a copied subject

**Claim.** Delegation does not copy the subject's role set. The checker evaluates the Actor and the grant. Intersection with the subject is allowed. Union is not.

**Kind:** candidate law  
**Decision state:** hypothesis  
**Evidence.** E1 "delegated, not copied." E18 ceiling intersection. E20 designate the authority.  
**Runtime consequence.** Role snapshotting is an escalation.  
**Falsifier.** A case where the deputy must be indistinguishable from the subject at check time and still pass SoD and audit. That case is impersonation, and it must be labeled.

## L9. SoD is identity-based and history-aware

**Claim.** Static exclusive roles are not enough when agents share a human's role name. The second pair of eyes is a different Actor. An agent cannot approve its own proposal.

**Kind:** candidate law  
**Decision state:** supported for the two-person rule. Hypothesis for the exact proposal-approval encoding.  
**Evidence.** E15, A5, A10.  
**Runtime consequence.** Proposal provenance must name the proposing Actor.  
**Falsifier.** A four-eyes rule that is satisfied by two software agents bound to one human without a second Party.

## L10. Attribution is a chain and is not ownership

**Claim.** The invocation record names Actor, subject, workload, connector, grant, and revisions. That record is not the owner of created objects.

**Kind:** candidate law  
**Decision state:** supported for "always concrete" and "not ownership." Hypothesis for the exact field set.  
**Evidence.** E11, E17, E14 `act` claim, E19 create-without-view.  
**Runtime consequence.** Incident response can walk human to agent to runtime to connector.  
**Falsifier.** An audit requirement that is satisfied by a single user id on the row, with no loss of meaning when an agent and a connector were involved.

## L11. Sub-delegation must not widen

**Claim.** A child grant's scope is a subset of its parent. Sharing a task copies the same scope. It does not add verbs or objects.

**Kind:** candidate law  
**Decision state:** hypothesis  
**Evidence.** E3.  
**Falsifier.** A legitimate enterprise pattern that requires a sub-agent to hold authority the parent grant lacks, without issuing a new grant from a Party that has that authority.

## L12. Surfaces do not fork authority

**Claim.** UI, API, MCP, and automation invoke the same Action under the same policy and SoD.

**Kind:** candidate law  
**Decision state:** hypothesis. Working principle in the constitution. Not yet a language rule.  
**Evidence.** E21, E19, A10, constitution §15.  
**Falsifier.** A required human-only ritual that cannot be expressed as Action policy and must live in one surface.

## L13. Stale grants and stale worlds are different failures

**Claim.** An unexpired grant can still be the wrong action because the world moved. Expiration handles the first. Re-read before commit handles the second.

**Kind:** candidate law  
**Decision state:** hypothesis  
**Evidence.** E5, E19, S-003.  
**Runtime consequence.** Preview is not commit.  
**Falsifier.** A domain where approving a grant is defined to freeze the world, and re-read would be incorrect.

## L14. Client-supplied bind facts are not binds

**Claim.** Which agent is using a grant is a server-side fact. A contextual tuple or request field that the caller chooses is not sufficient.

**Kind:** candidate law  
**Decision state:** hypothesis  
**Evidence.** E4, E5 persisted-wins, E18.  
**Falsifier.** A protocol where the caller must assert the bind and a later check can still prove the assertion was true.

## Convergence summary

| Law | Independent sources | State |
| --- | --- | --- |
| L1 concrete Actor | ObjectStack, Cedar, thesis | supported |
| L2 workload ≠ Party | SPIFFE, ValueFlows | supported |
| L3 software ≠ Party | ValueFlows versus PROV | hypothesis |
| L4 as versus on behalf of | OpenFGA, RFC 8693, PROV | supported distinction |
| L5 membership ≠ task | OpenFGA both pages | supported |
| L6 empty default | OpenFGA task guide | hypothesis |
| L7 PARC fail-closed | Cedar, NIST ABAC, RFC-0001 | supported shape |
| L8 no copied roles | OpenFGA, ObjectStack, Hardy | hypothesis |
| L9 identity SoD | NIST | supported rule, open encoding |
| L10 chain ≠ owner | PROV, ObjectStack, RFC 8693 | supported split |
| L11 no widen | OpenFGA | hypothesis |
| L12 surface parity | thesis, Palantir apply-time | hypothesis |
| L13 stale world | S-003, Palantir, OpenFGA time | hypothesis |
| L14 server-side bind | OpenFGA risk, Cedar persist-wins | hypothesis |

## What this folder does not decide

- Whether Policy is a primitive or a function plus enforcement. RFC-0001 already asks. Leave it.
- Whether `task` is a Principal or a context attribute.
- Authoring language, storage, or a policy engine product.
- Answers to `docs/open-questions.md`. Cite these files or mark undetermined.
