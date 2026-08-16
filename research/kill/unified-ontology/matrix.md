# Matrix

Convergence and divergence. This is evidence of semantic agreement or conflict, not a feature comparison.

## Homonyms

| Term | Commerce | Manufacturing | Inventory | Accounting | HR or IAM | Party or group | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Product | sellable offer or SKU | resource specification plus process | specification plus identity grain | valuation class or account mapping | none | shared master versus entity terms | one type `rejected` |
| Customer | commercial role | none | Odoo location type smell | debtor or bill-to | none | LegalPerson plus role | Kind `rejected` |
| Inventory | ATP for sale | WIP and issued lots | on-hand, reserved, owned, custodial | carrying amount, NRV | none | per legal person | one quantity `rejected` |
| Identity | billed party | performing agent | owner or custodian | legal person on the book | Person, Employment, User | legal person, site, brand | one key `rejected` |
| Work Order | none | ERPNext authorization versus Odoo execution | none | none | none | none | vendor word `rejected` as a type |
| Company | brand on the storefront | plant as operating unit | warehouse collaborator | books and tax | employer legal person | legal person versus branch | one Company `rejected` |
| Event | occurrence in a flow | job or transformation | movement | journal line | attendance or work | intercompany pair | shared field types must fail closed |

## Independent sources on plurality

| Distinction | Evans DDD | Data mesh | OWL 2 | GraphQL federation | FIBO | Sibling Wave A | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Multiple models are required | yes, Bounded Context | yes, multiple interpretive contexts | documents may be many | subgraphs are many | modular domains | seven domain folders split the same words | Convergence `supported` |
| One axiom or type union is the integration | no, translation | no, products plus governance | yes, axiom closure | no, composition with failure | map words to Party | reject one Item, one Customer | OWL diverges. That divergence is the kill. |
| Shared subset must stay small | Shared Kernel | global standards only where needed | import closure warnings | shareable fields with checks | Foundations plus BE modules | metamodel, not Product | Convergence `supported` |
| Cross-context identity is substitution | no, translation | no, correlate products | sameAs is substitution | entity `@key` is a join, not sameAs | Legal Entity as the shared concept | correspondence implied by role-not-kind | sameAs diverges. Rejected as the OS mapping. |
| Contradictory locals may coexist | Separate Ways, anticorruption | yes | inconsistency if unioned | composition fails | different words, one party | parallel books, S-011 | Union-then-reason diverges from fail-closed composition |

## Source-artifact versus domain cut

| Source artifact | Domain cut it may be standing in for | Risk if promoted |
| --- | --- | --- |
| ERPNext Customer DocType | Party in a customer relationship | Kind explosion. Party L1. |
| Odoo `res.partner` | Party plus address plus tax plus login | God-model inside one product. Party rejected it as canonical. |
| Catalog Item | specification, SKU, instance | Product R-01. |
| Odoo Location Type | party, process, transit, loss | Inventory sibling smell. A-014. |
| Frappe Employee | Person plus current employment | HR L1. |
| SCIM User | Principal and access | Not Employment. E-017. |
| ERPNext Company | legal person, books, sometimes branch | Multi-entity L1. |
| OWL `owl:imports` | document modularization | Axiom-closure god-model. A-006. |
| `owl:sameAs` | identity correspondence | Substitutive mush. A-008. |
| GraphQL subgraph | context module at a query surface | Surface, not ontology. E-010. |
| Data-mesh data product | published language at a boundary | Analytical scope. E-008. |
| ManufacturingPack | distribution unit | RFC-0001 already excluded. A-015. |

## Thesis readings

| Reading of "one executable ontology" | State | Why |
| --- | --- | --- |
| One ubiquitous language and one type universe for the organization | `rejected` | A-001 to A-005, A-011, sibling laws |
| One OWL-style axiom closure of imported domain ontologies | `rejected` | A-006, E-012 |
| One golden Product or Customer dataset | `rejected` | A-009, A-012 |
| One shared metamodel executing many context ontologies with explicit mappings | `hypothesis` | Survives A-005 if the kernel stays small. Not yet evidenced as sufficient. |
| Ontology facade over an ERP that still owns the types | `rejected` as greenfield | A-016, H1 |
| Modules or packs as the semantic split | `rejected` as ontology | A-015, E-026 |

## Divergence that stays open

| Conflict | Claim A | Claim B | Status |
| --- | --- | --- | --- |
| D-001 Name | Call the surviving design "one ontology" | Call it federation | `open`. Synthesis owns the name. |
| D-002 Kernel contents | Metamodel primitives only | Metamodel plus a few surviving kinds | `open`. L-009. |
| D-003 Data mesh scope | Organizational analogy holds for operational OS | Mesh is analytical only | `open`. E-008 limits. |
| D-004 GraphQL `@key` | A join key is enough for cross-context identity | Correspondence needs grain and provenance | `open`. L-005. |
| D-005 Parallel books | Required plural truth | Encoding not yet a primitive | `open`. A-013. |
