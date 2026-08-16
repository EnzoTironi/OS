# Sources

**Kind.** source list  
**Fetched.** 2026-08-16  
**Decision.** none

Primary pages were fetched this session. Sibling notes were read with `git show` and are not copied.

## First-party standards and product docs

| ID | Source | URL | Used for |
| --- | --- | --- | --- |
| S-FHIR-EOC | HL7 FHIR R5 EpisodeOfCare | https://hl7.org/fhir/episodeofcare.html | Healthcare responsibility period versus visit |
| S-FHIR-ENC | HL7 FHIR R5 Encounter | https://www.hl7.org/fhir/encounter.html | Visit as activity, not container |
| S-FHIR-CLM | HL7 FHIR R5 Claim | https://www.hl7.org/fhir/claim.html | Claim as request. Predetermination versus preauthorization versus claim |
| S-FHIR-COV | HL7 FHIR R5 Coverage | https://www.hl7.org/fhir/coverage.html | Coverage instance versus InsurancePlan definition versus Contract |
| S-STRIPE-SUB | Stripe Subscription object | https://docs.stripe.com/api/subscriptions/object | Standing commercial object, period, cancel timing |
| S-STRIPE-UBB | Stripe advanced usage-based billing | https://docs.stripe.com/billing/subscriptions/usage-based/advanced/about | Service interval versus billing interval. Meter versus license |
| S-STRIPE-MGT | Stripe manage usage-based setup | https://docs.stripe.com/billing/subscriptions/usage-based/manage-billing-setup | Mid-cycle price change, backdate, cancel accrued usage |
| S-IFRS16 | IFRS 16 Leases, issued HTML 2025 | https://www.ifrs.org/content/dam/ifrs/publications/html-standards/english/2025/issued/ifrs16.html | Right of use versus legal title. Identified asset |
| S-IFRS16-BC | IFRS 16 Basis for Conclusions BC19-BC40, PwC Viewpoint | https://viewpoint.pwc.com/dt/dk/en/iasbv2/part-c/IFRS_16_Leases/IFRS16_BC_TI/IFRS16_gBC19-BC40.html | Lessor keeps residual rights. Lessee controls use |
| S-IFRS15-IE | IFRS 15 illustrative examples, issued HTML 2026 | https://www.ifrs.org/content/dam/ifrs/publications/html-standards/english/2026/issued/ifrs15-ie.html | Over-time satisfaction. Payroll processing IE68 |
| S-IFRS15-PWC | PwC Viewpoint IFRS 15 IE66-IE90 | https://viewpoint.pwc.com/dt/gx/en/iasbv2/part-b/IFRS_15_Revenue_from_Contracts_with_Customers/IFRS15_IE_TI/IFRS15_gIE66-IE90.html | Simultaneous consumption. Progress measure |
| S-ASC606-EY | EY Technical Line, construction under ASC 606, 2020-07-10 | https://www.ey.com/content/dam/ey-unified-site/ey-com/en-us/technical/accountinglink/documents/ey-tl04813-171us-07-10-2020.pdf | Change order as modification. Input versus output progress |
| S-ASC606-RSM | RSM, revenue recognition for construction | https://rsmus.com/content/dam/rsm/insights/financial-reporting/1pdf/changes-to-revenue-recognition-in-the-construction-industry.pdf | Unpriced change order as variable consideration |
| S-FIBO-GH | EDM Council FIBO repository README | https://github.com/edmcouncil/fibo | Instrument, loan, derivative, ownership modules |
| S-FIBO-FBC | OMG EDMC-FIBO FBC 1.0 | https://www.omg.org/spec/EDMC-FIBO/FBC/1.0/PDF | Financial instrument as agreement or contract |
| S-FIBO-FND | OMG EDMC-FIBO FND 1.2 | https://www.omg.org/spec/EDMC-FIBO/FND/1.2/PDF | Ownership and control as separate ontologies |
| S-CIM-EPRI | EPRI CIM primer, chapter 1 | https://msites.epri.com/rd/research/062333/common-information-model-primer/chapter-1-introduction-to-the-iec-cim | IEC 61970 network versus 62325 market settlement |
| S-CIM-MG | UCAIug CIM modeling guide, artifacts | https://cim-mg.ucaiug.io/latest/section9-artifacts-under-cim-management/ | IEC 62325-451-4 settlement and reconciliation |
| S-VF-EX | Valueflows exchanges | https://www.valueflo.ws/concepts/exchanges/ | Agreement as reciprocal commitments |
| S-VF-FL | Valueflows flows | https://www.valueflo.ws/concepts/flows/ | Intent, Commitment, Economic Event, Claim |
| S-VF-ONT | Valueflows ontology | https://www.valueflo.ws/specification/all_vf.html | EconomicResource, Agreement, Commitment |
| S-SF-PC | Salesforce ProductConsumed | https://developer.salesforce.com/docs/atlas.en-us.field_service_dev.meta/field_service_dev/sforce_api_objects_productconsumed.htm | Parts used on a job. Inventory decrement optional |
| S-SF-INV | Salesforce Field Service inventory model | https://developer.salesforce.com/docs/atlas.en-us.field_service_dev.meta/field_service_dev/fsl_dev_soap_inventory.htm | Product Required versus Product Consumed versus Product Item |
| S-NIEM-CASE | NIEM 2.1 nc:CaseType | http://www.datypic.com/sc/niem21/t-nc_CaseType.html | Case as aggregation of related activities |
| S-NIEM-OFF | NIEM 2.0 j:CaseOfficialType | https://www.datypic.com/sc/niem20/t-j_CaseOfficialType.html | Official role with start and end on a case |
| S-ACORD-25 | The Hartford, ACORD certificate | https://www.thehartford.com/business-insurance/acord-certificate-of-insurance | Certificate is evidence of a policy, not the policy |
| S-ACORD-3 | ACORD 3 loss notice instruction guide | http://www.larrypressclaims.com/claims/PDF/ACORD3_Guidelines.pdf | Occurrence date versus claim date. Claims-made versus occurrence |

## Repo documents on this branch

| ID | Path |
| --- | --- |
| S-THESIS | `docs/thesis.md` |
| S-CONST | `docs/constitution.md` |
| S-OQ | `docs/open-questions.md` |
| S-PROG | `docs/research-program.md` |
| S-BACK | `docs/swarm-research-backlog.md` |
| S-RFC | `rfcs/0001-metamodel-hypothesis.md` |
| S-SCEN | `scenarios/README.md` |
| S-RREADME | `research/README.md` |

`docs/swarm-result-contract.md` was not present on `origin/main` at fetch.

## Sibling notes, git show only

| ID | Ref |
| --- | --- |
| SIB-15 | `origin/cursor/issue-15-domain-cfd8:research/domain/product/` |
| SIB-16 | `origin/cursor/issue-16-domain-cfd8:research/domain/o2c/` |
| SIB-19 | `origin/cursor/issue-19-domain-cfd8:research/domain/manufacturing/` |
| SIB-22 | `origin/cursor/issue-22-domain-cfd8:research/domain/finance/` |
| SIB-23 | `origin/cursor/issue-23-domain-cfd8:research/domain/pricing/` |
| SIB-26 | `origin/cursor/issue-26-domain-cfd8:research/domain/assets/` |
| SIB-29 | `origin/cursor/issue-29-domain-cfd8:research/domain/projects/` |
| SIB-37 | `origin/cursor/issue-37-corpus-cfd8:research/` |
| SIB-38 | `origin/cursor/issue-38-corpus-cfd8:research/standards/` |
| SIB-56 | `origin/cursor/issue-56-kill-cfd8:research/kill/primitives/` |
| SIB-67 | `origin/cursor/issue-67-domain-cfd8:research/domain/governance/` |
| SIB-73 | `origin/cursor/issue-73-ops-cfd8:research/ops/unknown-unknowns/` |

## Licensing

OS is MIT. This folder extracts concepts and public behavior. It does not paste implementation.
