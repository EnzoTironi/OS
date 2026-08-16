# Matrix

**Kind:** reference  
**Retrieved:** 2026-08-16  
**Decision:** per cell. None accepted.

## RFC form versus core

How each RFC-0001 candidate is treated. `base` means the core keeps it as a sort. `encode` means the core claims to express it with other sorts. `omit` means the core has no honest place for it.

| RFC form | M1 quartet | M2 fact-rule | M3 UFO+verbs | M4 six | Folder decision on the form as a base sort |
| --- | --- | --- | --- | --- | --- |
| Type | base | encode as schema | split into Kind, Role, Phase | base | `supported` required |
| Property | encode as field | encode as predicate | encode as Quality | encode as typed attribute | `rejected` as base sort |
| Interface | encode as flag | encode as query | encode as RoleMixin | encode as structural contract | Role carrier `rejected`. Kernel sort `undetermined` |
| Link | base | encode as binary Fact | omit, Relator only | base | `supported` required |
| Relator, not RFC but adjacent | encode as Type | encode as n-ary Fact | base | encode as Type plus Binds | native sort `rejected`. Pattern `supported` |
| Action | base | encode as asserting rule | base | base | `supported` required |
| Function | base, too wide | encode as deriving rule | omit, smuggled | base as Eval | bare Function as only logic sort `rejected` |
| Constraint | encode as Bool Function | encode as forbidding rule | encode as dependence | encode as Bind | sort `rejected` |
| Policy | encode as Bool Function | encode as rule | base | encode as Bind | product engine `rejected`. Authority job `hypothesis` |
| Event | encode as Type+tag | encode as Fact class | base as nature | base | nature `supported`. Type+tag `rejected` |
| Fact | encode as fields | base | omit | encoding, optional later | sole atom `rejected`. Kernel sort `undetermined` |

## Convergence

Independent sources agree on these distinctions. They do not agree on one atom.

| Distinction | Who | Kind |
| --- | --- | --- |
| Attempted intervention is not occurrence | ValueFlows E-001. Issue 7 L-005. Thesis. Constitution §8. ERPNext submit versus stock or GL rows | domain evidence |
| Correction appends | ValueFlows `corrects`. ERPNext E-007. PROV revision. Issue 12 CL-6 | domain evidence |
| Authority combination is not a Bool | Cedar E-002. Kubernetes validationActions versus failurePolicy, via issue 8. OpenFGA 400, via issue 8 | source-system artifact of a real job |
| Role is not Kind and not Interface | UFO via issue 3. ValueFlows AgentRelationshipRole. FIBO ContractParty. Odoo one partner. ERPNext split masters as the outlier | domain evidence |
| Relationship with lifecycle needs identity | UFO Relator examples. Palantir object-backed links. HR L3. Seed S-006 | domain evidence |
| Remainder is derived. Some current values are facts | Issue 12 CL-2, CL-3. ValueFlows quantity stored or derived. Inventory L-INV-05 | domain evidence |
| Valid-then is not known-then | Issue 5 L1. XTDB, SQL:2011, EPCIS, ERPNext posting date | domain evidence |
| Stock quantity Event is not automatically a GL Event | Issue 21 L11. Issue 18 L-INV-10 | domain evidence |
| Unknown after dispatch is not failed | Ontologiq E-004. Stripe E-006. Constitution §9 | domain evidence |
| One organizational vocabulary is false | Issue 55 L-012 | candidate law next door |

## Divergence

| Topic | Split | Why it matters to reduction |
| --- | --- | --- |
| Unit of information | Foundry object property. REA or VF event. PROV entity. ERP document plus ledger row. Ontologiq SQL view | M2 claims convergence on Fact. The sources do not. E-015 |
| Rival values | Foundry deletes the loser. ERP and VF keep records. Ontologiq avoids the case | M1 object snapshot fails S-011. M2 overfits the audit style |
| Relator | UFO wants a sort. Issue 3 and HR L4 prefer composition | M3 pays early. M4 waits for enforcement failure |
| Policy engine | Cedar skip-on-error. OPA optional default-deny. OpenFGA tuples. Palantir submission criteria | No engine is a metamodel sort. E-014 |
| Current quantity | VF allows stored or derived. ERPs store movements and cache balances. Palantir writes current properties | M2 universal projection is too strong. E-016 |
| Event encoding | Issue 7 leaves type, interface, or Fact `undetermined` | This folder rejects interface-tag for enforcement. That is a new claim, L-P-04 |

## Source artifacts that look like primitives

Do not promote these.

| Artifact | Looks like | Really |
| --- | --- | --- |
| Palantir Interface | Role | Shared shape. E-011 |
| Palantir Action type | The only verb | Definition plus apply plus webhooks. E-003 |
| ERPNext Customer and Supplier DocTypes | Two Kinds | Module behavior, then Party Link. Issue 3 |
| ERPNext Employee master | Person Kind | Source artifact. Issue 28 L1 |
| Odoo `state` on stock move | Stored Event | Stored predicate. Issue 12 CL-4 |
| ValueFlows `Action` | OS Action | Flow verb such as `produce`. Issue 7 D-001 |
| ValueFlows `Claim` | Epistemic claim | Economic receivable. Issue 4 |
| Cedar policy | OS Policy sort | One authorizer algebra. E-002 |
| Outbox row | Business Event | Intent to notify. E-024 |
| XTDB every-table bitemporal | Time primitive | Storage thesis. Issue 5 L2 |
| Pack, Compiler, Workflow, Deterministic Kernel | Extra sorts | Already excluded in RFC-0001. E-013 |

## Loss summary if a later agent deletes a surviving M4 sort

| If you delete | First failure I would expect |
| --- | --- |
| Type | Identity merge and Kind rigidity become graph folklore. Issue 3 L6, L7 |
| Link | Cheap associations become fake Relators or untyped blobs |
| Action | Propose, approve, unknown, and actor disappear into asserted rows. E-004, E-021 |
| Event | Posted ledgers grow `edit` Actions. E-007, E-009 |
| Eval | Agents improvise debit math. Thesis journal example dies |
| Bind | Preview is treated as commit. Policy error becomes false. E-002, E-012 |

## Decision board

| Claim | State |
| --- | --- |
| RFC-0001 ten forms are all base sorts | `rejected` |
| M1 is enough | `rejected` |
| M2 is enough | `rejected` |
| M3 is enough | `rejected` |
| M4 is enough | `hypothesis` |
| Fact is the only atom | `rejected` |
| Fact is a kernel sort | `undetermined` |
| Event is a Type plus interface | `rejected` for enforcement |
| Action equals Event | `rejected` |
| Policy equals Function plus fail-closed | `rejected` |
| Relator is a native engine category | `rejected` on present evidence |
| Interface carries Role | `rejected` |
| Property is a base sort | `rejected` |
| Workflow is a base sort | `rejected`, already out |
| Effect is a base sort | `hypothesis` that it is not, from issue 7 |
