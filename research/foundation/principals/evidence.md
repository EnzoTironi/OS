# Evidence

**Kind:** mixed. Each block states its kind.  
**Fetched:** 2026-08-16  
**Decision state:** n/a. Decision states live on laws, not on raw evidence.

Block ids are stable. Cite them from `model.md`, `attacks.md`, and `candidate-laws.md`.

## E1. OpenFGA distinguishes "as" from "on behalf of"

**Kind:** domain evidence  
**Source:** https://openfga.dev/docs/use-cases/ai-agent-authorization  
**Observed.** OpenFGA's first sentence states that agents act on behalf of users, and that "on behalf of" is not the same as "as." A well-modeled agent has its own identity, inherits only the permissions it needs, and can be revoked independently of the user. Permissions are delegated, not copied. Relations such as `can_act_on_behalf_of` make the grant explicit.

**Interpretation.** The real-world distinction is whether the downstream check still sees the deputy. If the deputy vanishes, audit and SoD collapse.

## E2. OpenFGA models agents as principals beside users

**Kind:** source-system artifact  
**Source:** https://openfga.dev/docs/modeling/agents/agents-as-principals  
**Observed.** The model adds `type agent` and allows `agent` on selected relations already held by `user`, such as `organization.member` and `project.member`. Checks use `agent:triage-bot` the same way they use a user. The page says this is for durable, non-task-specific grants. It does not replace task-based authorization. Recommendation: least privilege, and do not use `agent:*` in production.

**Interpretation.** Durable membership and task grants are two different facts. Collapsing them into "the agent is a project member" over-grants.

## E3. OpenFGA task grants start at zero and can expire or count calls

**Kind:** domain evidence  
**Source:** https://openfga.dev/docs/modeling/agents/task-based-authorization  
**Observed.** Agents start with no permissions and receive only what a task requires. A `task` can be a principal on tools or on domain objects. Permissions can be scoped to one task, to all tasks in a session, or to all tasks of an agent. Conditions support `expiration` and `max_call_count`. Sub-agents either share the task or get a narrower new task. Completed tasks delete their tuples.

**Interpretation.** Purpose-scoped authority is a first-class object, not a flag on the agent.

## E4. OpenFGA binds the calling agent to the task

**Kind:** source-system artifact  
**Source:** https://openfga.dev/docs/modeling/agents/task-based-authorization  
**Observed.** Without a bind, any caller who knows the task id can use the grant. The bind pattern intersects `can_call` with `task from calling_agent` and sends the calling agent as a contextual tuple at check time. A different agent using the same task is denied.

**Counterexample pressure.** If the client supplies the contextual tuple, a forged `calling_agent` defeats the bind. See A2 and A6.

## E5. OpenFGA persisted condition context beats request context

**Kind:** source-system artifact  
**Source:** https://openfga.dev/docs/modeling/conditions  
**Observed.** Tuple-written condition parameters and request context are merged. Persisted values win. Example: a 10-minute viewer grant is true at `grant_time + 9m50s` and false at `grant_time + 10m1s`.

**Runtime consequence.** Expiration must be stored on the grant. A caller must not be able to pass a friendlier clock.

## E6. Cedar authorization is principal, action, resource, context

**Kind:** domain evidence  
**Source:** https://docs.cedarpolicy.com/ and https://docs.cedarpolicy.com/overview/terminology.html  
**Observed.** A policy says who may perform which action on which resource in what context. Context is transient session data such as time, IP, and MFA. The request question is "Can this principal take this action on this resource in this context?" Default is deny. Any matching `forbid` denies the whole request.

**Interpretation.** RFC-0001's Policy candidate already matches this shape. That is convergence, not a reason to freeze RFC-0001.

## E7. Cedar principal includes services, and identifiers must not be reused

**Kind:** domain evidence  
**Source:** https://docs.cedarpolicy.com/policies/syntax-policy.html  
**Observed.** "The `principal` element … represents a user, service, or other identity." The page warns that reusing `User::"jane"` after Jane leaves grants the new Jane every old policy that still names that id. Cedar cannot tell them apart.

**Runtime consequence.** Agent ids, task ids, and service ids need the same uniqueness rule.

## E8. Cedar treats roles as a poor principal

**Kind:** domain evidence  
**Source:** https://docs.cedarpolicy.com/policies/syntax-policy.html  
**Observed.** Cedar recommends not using roles or groups as the principal, because that blocks later policies that need a user attribute such as `principal.level`.

**Interpretation.** A role is an attribute or a membership, not the identity that acted.

## E9. SPIFFE identity is a workload name in a trust domain

**Kind:** domain evidence  
**Source:** https://spiffe.io/docs/latest/spiffe-specs/spiffe-id/ and https://spiffe.io/docs/latest/spiffe-specs/spiffe/  
**Observed.** A SPIFFE ID is `spiffe://trust-domain-name/path`. It names a resource or caller in a self-registered trust domain. An SVID is a document a compute endpoint presents. The Workload API issues SVIDs locally and authenticates the caller out of band, for example by OS process properties on a Unix socket. Path meaning is left to the operator. Trust domain names can collide. Federation then fails because cryptographic roots differ.

**Interpretation.** This is process authentication, not economic agency.

## E10. ValueFlows Agent is economic agency, and software is out

**Kind:** domain evidence  
**Source:** https://www.valueflo.ws/specification/all_vf/  
**Observed.** `vf:Agent` is "an identifiable entity that can commit to and/or perform economic and/or ecological activity under its own power or authority." Subclasses are Person, Organization, and EcologicalAgent. The public concepts page, as recorded in the search snippet when the direct fetch timed out, says software and AI agents are controversial and that ValueFlows currently assumes a real agent behind those technologies.

**Interpretation.** A bot that posts a purchase order is not, on this model, the party to the purchase. A Person or Organization is.

## E11. PROV-O already splits Person, Organization, SoftwareAgent, and delegation

**Kind:** domain evidence  
**Source:** https://www.w3.org/TR/prov-o/#Agent  
**Observed.** `prov:Agent` "bears some form of responsibility for an activity taking place, for the existence of an entity, or for another agent's activity." Subclasses are Person, Organization, and SoftwareAgent. `wasAssociatedWith` ties an activity to an agent. `actedOnBehalfOf` is delegation. Qualified delegation can carry a plan and a role.

**Interpretation.** Provenance already needs the software agent and the party it represented. Authorization should not invent a thinner chain.

## E12. FOAF Agent is broader and vaguer than ValueFlows

**Kind:** domain evidence  
**Source:** http://xmlns.com/foaf/spec/#term_Agent  
**Observed.** `foaf:Agent` is "the class of agents; things that do stuff." Person, Organization, and Group are subclasses. The spec says the class exists because `Person` is too specific, and that IM ids sometimes belong to software bots.

**Divergence.** FOAF will admit a bot. ValueFlows will not, for now. Schema.org never added an Agent type. See E13.

## E13. Schema.org Action.agent is Person or Organization. Software is an instrument

**Kind:** domain evidence  
**Source:** https://schema.org/Action and https://schema.org/SoftwareApplication  
**Observed.** An Action has a direct `agent` typed Person or Organization, optional `participant` co-agents, and an `instrument` that helped. There is no Agent supertype. SoftwareApplication is a product.

**Interpretation.** On this vocabulary, an AI runtime is closer to `instrument` than to `agent`. That fights OpenFGA and PROV, which both name the software as an identity that can hold responsibility.

## E14. RFC 8693 defines impersonation versus delegation

**Kind:** domain evidence  
**Source:** https://www.rfc-editor.org/rfc/rfc8693.html §1.1  
**Observed.** Under impersonation, A is given B's rights in a context and is indistinguishable from B to the receiver. Under delegation, A keeps its own identity and acts representing B. A token that carries both is a composite token. `subject_token` is the party on behalf of whom the request is made. `actor_token` is the acting party. The JWT `act` claim can record a chain. Performing an exchange does not, by itself, revoke or tightly bind the input token. Client authentication on the STS is what stops a stolen token from being exchanged onward.

**Interpretation.** "Acting as" and "acting on behalf of" are different issuance modes. OS should not treat them as synonyms.

## E15. NIST SoD is identity exclusion, static or dynamic

**Kind:** domain evidence  
**Source:** NIST SP 800-192 via https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-192.pdf and https://csrc.nist.gov/glossary/term/sod  
**Observed.** No user should have enough privilege to misuse the system alone. Example: the person who prepares a paycheck must not be the person who authorizes it. Static SoD makes roles mutually exclusive. Dynamic SoD is checked at access time. The two-person rule is dynamic SoD. History-based SoD can forbid the same subject from repeating an access.

**Interpretation.** If an agent and a human share a role name, static role exclusion is not enough. The second pair of eyes must be a different identity.

## E16. NIST ABAC evaluates subject, object, operation, and environment

**Kind:** domain evidence  
**Source:** NIST SP 800-162  
**Observed.** ABAC decides authorization by evaluating attributes of the subject, the object, the requested operations, and sometimes environment conditions against policy. RBAC is treated as the special case where the main subject attribute is role.

**Convergence.** Cedar context and OpenFGA conditions are environment and usage attributes in this sense. ReBAC, as OpenFGA uses it, adds relationship facts to the same decision.

## E17. ObjectStack splits identity, posture, and attribution

**Kind:** source-system artifact  
**Source:** ObjectStack ADR-0073, fetched from GitHub this session  
**Observed.** The ADR names the user-less run as a confused-deputy problem. It splits three things the platform had collapsed:

1. A concrete non-human `automation` principal. No anonymous run.
2. `runAs` as authorization posture: `user`, `automation` with RLS, or `system` elevation.
3. Attribution that is always concrete and is not record ownership. Salesforce is cited as `CreatedBy = Automated Process` while `OwnerId` stays a business field.

The ADR also claims four invariants from Salesforce, ServiceNow, AWS IAM, Kubernetes, iPaaS, GitHub Actions, and Postgres SECURITY DEFINER. Those platform rows are ObjectStack's comparison, not pages fetched from each vendor this session.

**Runtime consequence.** A missing identity that fails open is an escalation primitive. See E18.

## E18. ObjectStack documents fail-open on empty principal

**Kind:** source-system artifact, also a counterexample  
**Source:** ObjectStack ADR-0096  
**Observed.** Security middleware skips all checks when there are no positions, no permission sets, and no `userId`. Action bodies that drop `ExecutionContext` therefore run with ambient full authority. The ADR's invariant is that every data-engine call carries a real principal or an explicit, reasoned, audited system grant. For agents calling as a user, the threaded context is a ceiling intersection with the user, not the user's full grant.

**Counterexample.** "Same Action for humans and agents" is unsafe if the body runs trusted and ignores the caller. `research/reference-landscape.md` already recorded this warning. ADR-0096 is the first-party confirmation.

## E19. Palantir applies submission criteria at action apply time

**Kind:** source-system artifact  
**Source:** https://palantir.com/docs/foundry/action-types/permissions/  
**Observed.** Viewing an action type, editing the type, and applying the type with parameters are different permissions. Apply requires view on the edited types and a pass of submission criteria. Criteria can name a user id or group id and can use parameters. Side effects do not fire if submission criteria fail. Action-only object types let a submitter create objects they cannot view.

**Interpretation.** Authority is checked at apply, not only at "can I see the button." Parameter-sensitive criteria are a form of purpose and object scope.

## E20. Hardy 1988. A deputy with two authorities cannot name which one it used

**Kind:** domain evidence  
**Source:** Hardy, "The Confused Deputy," ACM SIGOPS OSR 22(4), 1988. PDF fetched from https://www.cs.utexas.edu/~witchel/380L/papers/hardy88confused.pdf  
**Observed.** A compiler had home-files license to write statistics in `SYSX`. A user supplied `(SYSX)BILL` as the debug-output path. The OS saw the compiler's license and allowed the write. The compiler "serves two masters and carries some authority from each … It has no way to keep them apart." Hardy's fix is that the deputy must explicitly designate the authority it intends to use.

**Interpretation.** An OS Action runtime that mixes the human's grant, the agent's standing grant, and a connector credential without naming which one authorized the effect is the same failure.

## E21. In-repo thesis and RFC already require shared Actions and named principals

**Kind:** domain evidence, in-repo  
**Source:** `docs/thesis.md`, `rfcs/0001-metamodel-hypothesis.md`, `docs/open-questions.md` §11, `scenarios/README.md` S-003  
**Observed.** The thesis says a human button, an API call, an automation, and an AI tool should address the same Action when policy allows. RFC-0001 treats Agent as an object that implements Actor, Principal, and SoftwareAgent rather than a primitive. Policy is hypothesized as a decision over principal, action, resource, and context. Open question 11 asks how `as`, `on behalf of`, task authority, and workload identity differ. S-003 asks what a human approved when the world changed between proposal and approval.

**Interpretation.** Issue 11 is already inside the leading hypothesis. The missing piece is the grant and the attribution chain, not a new Agent primitive.

## E22. Monetary limits are expressible, not named

**Kind:** source-system artifact  
**Source:** OpenFGA conditions and Cedar context, pages listed above  
**Observed.** OpenFGA conditions include `int` and comparison. Cedar conditions can read numeric attributes and context fields. Neither first-party page fetched this session names monetary limits as a built-in grant kind.

**Decision state for this gap:** undetermined. A money cap can be a context attribute. It may also need a first-class remaining-budget fact so two concurrent actions cannot both spend the last dollar.
