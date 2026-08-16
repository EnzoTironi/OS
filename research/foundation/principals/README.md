# Principals, actors, and delegated authority

**Track:** foundation  
**Issue:** [#11](https://github.com/EnzoTironi/OS/issues/11)  
**Fetched:** 2026-08-16  
**Decision state:** hypothesis  
**Status:** Wave A evidence. Not a metamodel change. RFC-0001 is untouched.

This folder is the durable research artifact for issue 11. A later synthesis agent should read these files rather than the issue thread.

## Question

How should OS represent actors and authorization when humans, AI agents, services, automations, and workloads all act with different kinds of delegated authority?

`docs/open-questions.md` question 11 asks the same thing. This folder does not answer that document. It records evidence that a synthesis agent can cite.

## Overview

Authorization systems keep collapsing four different things into one "who".

1. The enduring party that can own, commit, and be legally responsible.
2. The software process that actually attempted the action.
3. The cryptographic workload that presented a credential.
4. The grant that said the attempt was allowed, for how long, on which objects, and for which purpose.

Those four are not the same kind. Treating an AI agent as "just a user" copies the human permission graph and loses revocation, SoD, and audit. Treating a SPIFFE ID as a business actor copies a compute identity into economic meaning. Treating impersonation as the default copies the subject's entire footprint onto the deputy.

The candidate model in `model.md` keeps those layers separate and records a chain on every Action invocation. The laws in `candidate-laws.md` are hypotheses. Several distinctions already have independent first-party support. None is silently accepted.

## Key concepts

**Party.** An identifiable entity that can commit to or perform economic activity under its own authority. ValueFlows names Person and Organization here. It refuses to treat software or AI as this kind for now.

**SoftwareAgent.** A named software process that can bear responsibility. W3C PROV-O already has this subclass of Agent. It is not automatically a Party.

**Principal.** The identity a policy check evaluates. Cedar says a principal is a user, service, or other identity that can request an action on a resource. OpenFGA puts `agent` on the left side of tuples the same way it puts `user`.

**Actor.** Who actually attempted the intervention. Schema.org `Action.agent` is the direct performer. RFC 8693 `actor_token` is the acting party in a delegation. Actor and subject can differ.

**Workload identity.** A cryptographic name for a compute process. SPIFFE IDs live in a trust domain and a path. They authenticate a process. They do not make that process a customer, employee, or economic agent.

**Authority context.** The grant used for this attempt. Mode, subject, actor, object scope, purpose, expiration, call limits, and binding to a specific agent or workload. OpenFGA models much of this as a `task`. Cedar models the transient slice as `context`.

**As versus on behalf of.** Impersonation makes the deputy indistinguishable from the subject. Delegation keeps both identities visible. RFC 8693 and OpenFGA both insist on the split. OS should prefer delegation.

## How it works

See `model.md` for the candidate invocation record and grant shape.

The short path is:

1. Authenticate the workload and the software agent.
2. Resolve the grant. Fail closed if none exists.
3. Evaluate policy on principal, action, resource, and context. The principal for the check is the grant's actor, not a copied user role set.
4. Enforce SoD against identities, not against shared role names. An agent cannot approve its own proposal.
5. Re-read state before commit if the grant or the world may be stale.
6. Write an attribution chain. Actor, subject, workload, connector, grant, and policy revision. Attribution is not ownership.

## Where things live

| File | Mode | Contents |
| --- | --- | --- |
| `sources.md` | reference | URLs and documents fetched this session |
| `evidence.md` | reference | Labeled evidence blocks |
| `model.md` | explanation | Candidate identity and delegation model |
| `attacks.md` | explanation | Privilege escalation, confused deputy, stale grant, cross-tenant leak, self-approval |
| `candidate-laws.md` | reference | Falsifiable claims and decision states |
| `open-questions.md` | reference | Residual uncertainty. No invented answers |

## Output contract

Until issue 74 lands, this folder follows the Agent output contract in `docs/swarm-research-backlog.md`.

1. **Question.** This README.
2. **Sources.** `sources.md`.
3. **Evidence.** `evidence.md`.
4. **Source artifacts.** Marked in `evidence.md` and `model.md`.
5. **Convergence.** `model.md` and `candidate-laws.md`.
6. **Divergence.** `model.md` and `open-questions.md`.
7. **Candidate laws.** `candidate-laws.md`.
8. **Counterexamples.** `attacks.md` and `candidate-laws.md`.
9. **Runtime pressure.** `model.md` and `candidate-laws.md`.
10. **Open questions.** `open-questions.md`.
11. **Decision state.** Each law and this folder. Default is `hypothesis`. Never `accepted`.

## Gotchas

- RFC-0001 already says Agent need not be a primitive. This research does not reopen that as a product decision.
- ValueFlows Agent and Cedar principal are different kinds that share a word.
- ObjectStack `runAs` is an authorization posture, not an identity. Copying the enum without the split recreates the confused-deputy hole their ADRs document.
- OpenFGA contextual tuples can name the calling agent at check time. If the application supplies that tuple from an untrusted client, the bind is theater.
- Cedar warns that reused principal identifiers silently inherit old grants. The same risk applies to agent and task IDs.
- Monetary limits are not a first-class construct in the OpenFGA or Cedar pages fetched this session. They can be expressed as condition or context integers. Whether they deserve their own grant field is undetermined.

## Licensing

OS is MIT. These notes extract concepts and documented behavior. No copyleft implementation was pasted or translated into the repo.
