# Sources

**Kind:** source-system artifact index  
**Fetched:** 2026-08-16  
**Decision state:** n/a

Only first-party pages and standards retrieved this session, plus in-repo documents already on `origin/main`. Secondary blog posts were not used as evidence.

## In-repo, already on origin/main

| Path | Use |
| --- | --- |
| `docs/thesis.md` | Humans, agents, automations, and APIs share one Action |
| `docs/constitution.md` | Authority must be explicit. Surfaces must not fork meaning |
| `docs/open-questions.md` §11 | The question this folder investigates. Not answered here |
| `docs/research-program.md` | Evidence loop and convergence matrix |
| `docs/swarm-research-backlog.md` | Agent output contract |
| `rfcs/0001-metamodel-hypothesis.md` | Actor, Principal, SoftwareAgent as interfaces. Policy as principal, action, resource, context. Untouched |
| `docs/hypothesis-history.md` | Earlier Agent-as-interface hypothesis |
| `scenarios/README.md` | S-003 stale approval. Future family includes single-task delegation and mid-action revocation |
| `research/README.md` | Evidence note template and clean-room posture |
| `research/reference-landscape.md` | ObjectStack, Ontologiq, Palantir landscape notes. Secondary to first-party fetches |

## OpenFGA, fetched this session

| URL | What was taken |
| --- | --- |
| https://openfga.dev/docs/modeling/agents | First-party versus third-party agent auth. Task-based grants start at zero |
| https://openfga.dev/docs/modeling/agents/agents-as-principals | `agent` as a first-class principal beside `user`. Durable grants. Avoid `agent:*` |
| https://openfga.dev/docs/modeling/agents/task-based-authorization | Task as principal. Session and agent scopes. Expiration. Call count. Agent-to-task bind. Sub-agent narrowing. Tuple cleanup |
| https://openfga.dev/docs/use-cases/ai-agent-authorization | "On behalf of" is not "as". Delegation is explicit and revocable. Scope is bounded |
| https://openfga.dev/docs/modeling/conditions | Conditional tuples. Persisted context wins over request context. Temporal and usage limits |

## Cedar, fetched this session

| URL | What was taken |
| --- | --- |
| https://docs.cedarpolicy.com/ | Principal, action, resource, context. Context is transient. Schema validates policies, not runtime requests |
| https://docs.cedarpolicy.com/policies/syntax-policy.html | Permit and forbid. Implicit deny. Explicit deny wins. Principal may be a user or a service. Do not reuse identifiers |
| https://docs.cedarpolicy.com/overview/terminology.html | Authorization is not authentication. RBAC via groups. ABAC via attributes. Request is "can this principal take this action on this resource in this context" |

## SPIFFE, fetched this session

| URL | What was taken |
| --- | --- |
| https://spiffe.io/docs/latest/spiffe-specs/spiffe/ | Workload identity framework. SPIFFE ID, SVID, Workload API |
| https://spiffe.io/docs/latest/spiffe-specs/spiffe-id/ | `spiffe://trust-domain-name/path`. Trust domains are self-registered. Path meaning is operator-defined. SVID is a verifiable document for a compute endpoint |
| https://github.com/spiffe/spiffe/blob/main/standards/SPIFFE.md | Canonical spec pointer cited by the rendered pages |

## ObjectStack, fetched this session

Documented ADRs only. No implementation copied.

| URL | What was taken |
| --- | --- |
| https://github.com/objectstack-ai/objectstack/blob/main/docs/adr/0073-automation-execution-identity.md | Automation as a concrete non-human principal. `runAs` is posture, not identity. Attribution is not ownership. No anonymous run |
| https://github.com/objectstack-ai/objectstack/blob/main/docs/adr/0096-execution-surface-identity-admission.md | Missing identity must not grant authority. Agent plus user uses a ceiling intersection. Trusted action bodies can exceed the caller |

## Palantir Foundry, fetched this session

| URL | What was taken |
| --- | --- |
| https://palantir.com/docs/foundry/action-types/permissions/ | View versus apply an action. Submission criteria at apply time. Side effects still require those criteria. Action-only edits can create objects the submitter cannot view |

## Formal vocabularies, fetched this session

| URL | What was taken |
| --- | --- |
| https://www.w3.org/TR/prov-o/#Agent | `prov:Agent` bears responsibility. Subclasses Person, Organization, SoftwareAgent. `actedOnBehalfOf` is delegation. `wasAssociatedWith` ties an activity to an agent |
| http://xmlns.com/foaf/spec/#term_Agent | `foaf:Agent` is "things that do stuff". Subclasses Person, Organization, Group. Chat IDs may belong to software bots |
| https://schema.org/Action | `agent` is the direct performer and is typed Person or Organization. `participant` is an indirect co-agent. `instrument` is the thing that helped |
| https://schema.org/SoftwareApplication | Software as a product or application, not an Action agent |
| https://www.valueflo.ws/specification/all_vf/ | `vf:Agent` can commit to or perform economic activity under its own power. Subclasses Person, Organization, EcologicalAgent |
| https://www.valueflo.ws/specification/all_vf.html | Same ontology, HTML twin |
| Search hit on https://www.valueflo.ws/concepts/agents/ | Software and AI agents are controversial. ValueFlows currently assumes a real agent behind those technologies. Direct fetch of that page timed out. Treat the concepts page as cited via the spec plus the public concepts wording recorded in the search snippet, and mark any use of the timeout page as weaker than the spec tables |

## IAM, RBAC, ABAC, ReBAC, fetched this session

| URL | What was taken |
| --- | --- |
| https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-162.pdf | ABAC evaluates subject, object, operation, and environment attributes against policy. RBAC is roles as a subject attribute |
| https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-192.pdf | Static and dynamic separation of duty. Two-person rule. History-based SoD |
| https://csrc.nist.gov/glossary/term/sod | NIST glossary restatement of SP 800-192 SoD |
| https://www.rfc-editor.org/rfc/rfc8693.html | Impersonation versus delegation. `subject_token` and `actor_token`. JWT `act` claim for a delegation chain. Exchange does not automatically revoke the input token |

## Confused deputy, fetched this session

| URL | What was taken |
| --- | --- |
| https://www.cs.utexas.edu/~witchel/380L/papers/hardy88confused.pdf | Hardy 1988. A deputy with two authorities cannot say which one it meant to use. The compiler overwrote `(SYSX)BILL` because home-files license and invoker authority were mixed |
| https://doi.org/10.1145/54289.871709 | ACM record for the same paper |

## Not fetched, on purpose

Google Zanzibar PDF, AWS IAM AssumeRole pages, Kubernetes ServiceAccount docs, and Ontologiq source were not retrieved as first-party pages this session. ObjectStack ADR-0073 already cites Salesforce, ServiceNow, AWS IAM, Kubernetes, and GitHub Actions as platform comparisons. Those comparisons are ObjectStack's claims, labeled as such in `evidence.md`.

## Licensing note

Conceptual and behavioral extraction only. No source implementation was copied into OS.
