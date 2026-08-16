# Source study — authorization, delegation, agents, and workload identity

**Issue:** #42  
**Retrieved/rechecked:** 2026-08-16  
**Decision:** source observations only; architecture remains `undetermined`.

# 1. Cedar — contextual policy with explicit permit/forbid semantics

Primary sources:

- Cedar policy language/authorization docs: <https://docs.cedarpolicy.com/>
- Cedar authorization: <https://docs.cedarpolicy.com/auth/authorization.html>
- Cedar policies/syntax: <https://docs.cedarpolicy.com/policies/syntax-policy.html>
- Cedar schema: <https://docs.cedarpolicy.com/schema/schema.html>

## E-AUTH-CEDAR-01 — request tuple is principal/action/resource/context

Cedar authorization evaluates a request containing a principal, action, resource and context against policies plus entity data.

**Pressure:** Action authorization is inherently contextual; it need not be a CRUD role check.

## E-AUTH-CEDAR-02 — explicit `permit` and `forbid` policies are first-class

Cedar policies have `permit` or `forbid` effect. The authorization semantics are default deny, and a matching forbid overrides permits.

**Pressure:** emergency deny/non-waivable restrictions can be represented directly rather than encoded as absence of some allow tuple.

## E-AUTH-CEDAR-03 — entity attributes and hierarchy can participate

Cedar entity data can provide attributes and parent relationships; policies can use membership/hierarchy and contextual conditions.

**Pressure:** organization/relationship information can be supplied to a policy evaluator without making the policy language the business datastore.

## E-AUTH-CEDAR-04 — schema is a validation/model contract, not persistent identity storage

Cedar schemas describe entity/action/context types and support validation/tooling. Applications still supply the concrete entities/relationships used during authorization.

**Pressure:** a Cedar-only architecture still needs a durable semantic source for users/agents/grants/relationships; assembling that entity slice must not become an unreviewed hidden authorization layer.

## E-AUTH-CEDAR-05 — policy and entity revisions need operational pinning/explanation outside one boolean result

The evaluator answers a request against supplied policy/entity data. Historical explanation requires OS to know which policy set/entity/grant revision was used.

**Pressure:** #40 commit witness/revision semantics remain necessary around the evaluator.

# 2. OpenFGA — persistent relationship graph + model/condition evaluation

Primary sources:

- Docs/concepts: <https://openfga.dev/docs/concepts>
- Modeling: <https://openfga.dev/docs/modeling>
- Conditions: <https://openfga.dev/docs/modeling/conditions>
- Contextual tuples: <https://openfga.dev/docs/modeling/contextual-tuples>
- Check API: <https://openfga.dev/docs/getting-started/perform-check>

## E-AUTH-FGA-01 — relationship tuples are durable authorization data

OpenFGA models authorization using typed relations and tuples linking users/usersets/objects under an authorization model.

**Pressure:** dynamic organizational/resource relationships can be stored/evaluated directly rather than reconstructed into every request.

## E-AUTH-FGA-02 — authorization models are versioned definitions

OpenFGA stores authorization models separately from tuples, and requests can target a model ID.

**Pressure:** historical/pending operations can bind authorization-model revision rather than silently using whichever model is latest.

## E-AUTH-FGA-03 — contextual tuples inject request-local relationship facts

Contextual tuples can be supplied only for a Check/request rather than persisted.

**Pressure:** task/session/delegation context can sometimes be represented without permanently writing every ephemeral relationship.

## E-AUTH-FGA-04 — conditions add contextual predicates to relationship tuples

OpenFGA conditions allow tuple applicability to depend on typed request context such as time or other parameters.

**Pressure:** ReBAC/RBAC and some contextual conditions can coexist in one evaluator.

## E-AUTH-FGA-05 — relationship graph expressiveness does not by itself decide business delegation semantics

OpenFGA can represent relations such as `viewer`, `owner`, parent/child usersets and conditional access. Whether a tuple means employment, task delegation, representation, workload binding, approval authority, or resource ownership remains application/domain semantics.

**Pressure:** relationship storage can be the authorization mechanism without becoming the enterprise ontology.

# 3. OpenID AuthZEN — interoperable PEP↔PDP boundary

Primary sources:

- Authorization API 1.0 Final: <https://openid.net/specs/authorization-api-1_0.html>
- OpenID AuthZEN working group/specs: <https://openid.net/wg/authzen/>

## E-AUTH-AZ-01 — Authorization API standardizes policy decision requests

AuthZEN defines an API boundary through which a Policy Enforcement Point can ask a Policy Decision Point for authorization using subject/action/resource/context-oriented information.

**Pressure:** OS can potentially standardize the evaluator boundary without standardizing one internal policy language/backend.

## E-AUTH-AZ-02 — wire interoperability is not the business authorization model

The API does not define the organization's Party/Agent/delegation/grant ontology, SoD history, approval objects or source of relationship truth.

**Pressure:** AuthZEN can be a replaceable adapter boundary, not proof of a semantic primitive set.

# 4. SPIFFE — workload identity, not business delegation

Primary sources:

- SPIFFE overview: <https://spiffe.io/docs/latest/spiffe-about/overview/>
- SPIFFE ID: <https://spiffe.io/docs/latest/spiffe-about/spiffe-concepts/>
- SPIFFE Verifiable Identity Document (SVID): <https://spiffe.io/docs/latest/spiffe-about/spiffe-concepts/>

## E-AUTH-SPIFFE-01 — SPIFFE identifies software workloads in trust domains

SPIFFE issues identities to workloads using SPIFFE IDs and SVIDs, enabling mutual authentication without application-managed long-lived secrets.

**Pressure:** runtime can authenticate the actual workload/service process independently from business actor identity.

## E-AUTH-SPIFFE-02 — workload identity does not encode on-behalf-of business authority

A workload credential proves identity/trust of the workload under the trust domain. It does not by itself say which human/organization/agent delegated a business task, what amount limit applies, or whether the workload may approve a purchase.

**Pressure:** `workload == actor == represented principal` is an unsafe collapse.

# 5. Wave A + #40/#41 pressure

Internal sources:

- Wave A #11 principal/delegation research
- Wave A #60 authority kill test
- Wave A #67 GRC research
- #40 `research/runtime/transactions/`
- #41 `research/runtime/effects/`

## E-AUTH-OS-01 — authority is usually operation/context scoped

Wave A weakened the idea of one canonical truth authority. Authorization answers which actor/evidence/decision may drive a particular Action under context, not metaphysical truth.

## E-AUTH-OS-02 — approval and authorization are different temporal records

#40 distinguishes historical approval from current/non-waivable authorization. A valid past approval can survive actor deactivation depending on business contract, while current execution can still require an active delegation/freeze check.

## E-AUTH-OS-03 — effect execution can have authority timing distinct from Action commit

#41 shows an EffectRequest can execute later. Its right to execute can either vest at local commit or require current attempt-time controls, and the distinction must be explicit.

## E-AUTH-OS-04 — SoD is combinational

Wave A GRC showed segregation-of-duties rules constrain combinations of powers/participation, not merely individual allow decisions.

# 6. One-engine-first comparison

| Requirement | Cedar alone + OS data | OpenFGA alone | AuthZEN | SPIFFE |
| --- | --- | --- | --- | --- |
| principal/action/resource/context | strong | Check relation/object + context | wire form strong | no |
| explicit persistent relationship graph | application supplies | **strong** | no | no |
| contextual conditions | **strong** | strong via conditions | passes context | no |
| explicit deny/forbid precedence | **strong native model** | can model exclusions/conditions but not the same policy-effect model | backend-dependent | no |
| dynamic usersets/ReBAC traversal | possible from supplied entity graph | **strong** | backend-dependent | no |
| task/subagent grant storage | OS ordinary records/entities | possible as tuples/objects | no | no |
| numeric/amount/purpose limits | strong expression/context | conditions can encode many | backend-dependent | no |
| model revision binding | policy/schema artifact under OS control | **authorization model ID** | backend-dependent | trust bundle/SVID not business policy |
| workload authentication | external | external | external | **strong** |
| business on-behalf-of semantics | OS model | OS model | no | no |
| SoD over historical participation | needs history/entity/context supplied | needs relations/history modeled | backend-dependent | no |
| PEP↔PDP standard API | custom/adapter | custom/adapter | **strong** | no |

## Candidate A: Cedar only as PDP

Could pass many scenarios if OS owns a queryable semantic grant/relationship store and constructs Cedar entity/context data. The main risk is that complex graph traversal/data preparation becomes a de facto second authorization engine outside Cedar.

## Candidate B: OpenFGA only

Could pass many RBAC/ReBAC/delegation scenarios using tuples, usersets, contextual tuples and conditions. The main pressure is whether high-dimensional current contextual rules, emergency-deny precedence, numeric/risk limits and explanation remain maintainable without a parallel policy layer.

## Candidate C: OS semantic grant model + one backend adapter

OS defines what a delegation/grant/SoD/current-at-commit contract means, then lowers the subset needed for authorization into Cedar or OpenFGA. This preserves semantic replaceability but risks accidentally inventing a policy language.

## Candidate D: OpenFGA + Cedar

Technically attractive but epistemically expensive: two evaluation systems, two revisions, two explanation graphs, conflict/combination semantics, and more difficult atomic change rollout.

**Current rule:** D must prove materially better correctness on concrete cases. Architectural neatness is not enough.

# 7. Main tensions

## D-AUTH-01 — persistent relationship authority vs request-local policy evaluation

OpenFGA stores/reasons over authorization relationships directly. Cedar expects the application to provide relevant entity/relationship data to evaluation.

**Question:** is the OS ontology itself a sufficiently good relationship store so Cedar can remain the only PDP, or does that require too much graph/query logic in the enforcement path?

## D-AUTH-02 — explicit deny semantics vs monotonic relationship grants

Cedar's `forbid` gives a clear deny-overrides-permit model. Relationship systems can model exclusions/conditions, but that is not automatically equivalent to an emergency deny policy over arbitrary contextual requests.

**Question:** can one OpenFGA model express the required current emergency blocks/SoD/limits with equal clarity and proof, or would a second policy evaluator emerge?

## D-AUTH-03 — delegated authority vs impersonation

Neither generic workload identity nor one `principal=user` field captures:

```text
Agent A acts for Human H
under task Grant G
through Workload W
```

**Conclusion:** even if a PDP sees one request principal, OS must preserve the delegation/representation/workload evidence separately for audit/commit semantics.

## D-AUTH-04 — revocation consistency is not solved by policy language selection

Cedar/OpenFGA can evaluate current data, but revocation-vs-commit correctness depends on how policy/grant revisions are read/fenced relative to #40's transaction and #41's later effect attempt.

**Conclusion:** authority revision/lease/token semantics are a runtime contract above evaluator syntax.

# 8. Source-study conclusion

The external sources strongly suggest that OS should separate:

```text
workload authentication
business actor / represented party
durable delegation grants
request-time authorization evaluation
business approval/GRC
commit/effect-time authority basis
```

No single product specification makes those distinctions automatically. The open competition is whether Cedar or OpenFGA can be the **one** PDP/evaluator behind an OS-owned semantic grant model without a second authorization engine.