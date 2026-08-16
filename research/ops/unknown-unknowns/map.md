# Ranked unknown-unknowns map

**Kind:** candidate law for the ranking itself 
**Decision state:** hypothesis

Rank is information gain against RFC-0001, not industry size. A domain rises when it can falsify a foundational assumption that the current backlog is unlikely to touch. A domain falls when an open issue already owns that assumption under another name.

[#79](https://github.com/EnzoTironi/OS/issues/79) should consume the top rows as stress scenarios. It should not rediscover the list.

## Rank table

| Rank | Domain or tradition | Assumption under threat | Already owned? | Child issue? |
| --- | --- | --- | --- | --- |
| 1 | Recurring and over-time performance obligations | Meaningful commercial change is a discrete Action that yields discrete Events. A commitment is fulfilled by shipments or milestones | #16 and #29 see documents and projects. They do not own IFRS 15 series and over-time control transfer | Propose |
| 2 | Insurance contingent occurrence and incurred-but-unreported service | An Event is a known occurrence. A Fact is a point assertion. Unknown is an integration failure | #4, #5, #7, #62 own disagreement, time, Action or Event, and values. They do not own probability-weighted incurred service | Propose |
| 3 | Clinical observation, condition, and consent | Mutation is Action-first. Accepted operational state is the normal fact. Policy is authorization to act | #4, #6, #11, #27, #67 own truth, provenance, principals, CRM cases, and GRC | Propose. Healthcare-as-CRM is not enough |
| 4 | Deontic obligation, permission, prohibition, violation | Policy and Constraint are boolean functions with enforcement | #8 and #67 own policy and controls | Propose. GRC checklists are not deontic operators |
| 5 | Records authenticity, required destruction, and erasure | Explainable history can be kept. Facts are append-only | #6, #9, #12 own provenance, revision, and projections | Propose. The clash with GDPR Article 17 is new |
| 6 | Right-of-use and other legal rights as resources | A resource is a physical item, lot, or serial with ownership or custody | #15, #18, #26, #31 own product, stock, assets, and ownership | Propose only the right-versus-thing split. Do not open a lease ERP module |
| 7 | Product, service, and resource layering | Product identity is SKU, variant, lot, serial | #15 owns product identity | Do not file yet. Send as required pressure into #15. File later if #15 stays SKU-shaped |
| 8 | Through-life configuration and effectivity | Valid time on a part or BOM is enough. One product structure | #15, #19, #26 | Same as rank 7. Required pressure into those issues first |
| 9 | Continuous-flow networks and interval measurements | Inventory is discrete stock movement. Quantity is a balance | #18, #38, #62 | Do not file yet. Send CIM into #38 and interval quantities into #62. File later if stock laws cannot absorb flow |
| 10 | Adaptive case and discretionary planning | Workflow is composition of named Actions defined in advance | #10 | Do not file yet. Required pressure into #10. File later if #10 stays BPMN-shaped |
| 11 | People-to-land RRR and spatial units | Ownership is a party attribute or a simple relator | #3, #14, #31 | Do not file yet. Required pressure into those issues |
| 12 | Construction progressive work-in-place | Fulfillment is shipment of finished goods | #29 plus rank 1 | Do not file. Use #29 plus the over-time child |
| 13 | Public-sector eligibility and statutory time | Process is commercial fulfillment | Ranks 4, 5, 10 | Do not file a "government module" |
| 14 | Field service | Distinct from maintenance and CRM | #26, #27 | Do not file |
| 15 | Retail POS | Distinct from order-to-cash and pricing | #16, #23, maybe #57 | Do not file unless #57 needs an anonymous-tender counterexample |
| 16 | Warehouse automation | Distinct from inventory and logistics | #18, #20, runtime | Do not file. Control-loop timing is Wave B |
| 17 | Scheduling and overbooking | Distinct from planning | #24 | Do not file yet |
| 18 | Asset finance and beneficial ownership of pools | Distinct from payments and FIBO | #22, #37, rank 6 | Do not file yet |
| 19 | Carbon, credits, and double counting | Distinct from inventory identity | #18, #25, #38 | Park. Open SRC-GHG in the literature watch (#78) |
| 20 | Securities clearing, novation, and netting | Distinct from payments | #22, #37, SRC-ISO20022 | Park on #22 and #37 |

## Cluster view

The top six ranks are one cluster. They all attack the same quiet picture.

```text
a named Action
 -> a known Event
 -> an append-only Fact
 -> a physical Resource
 -> a boolean Policy
```

Subscriptions, insurance, clinics, statutes, records programs, and leases each break at least one arrow in that picture.

Ranks 7-11 are a second cluster. They attack identity and process shape. Existing foundation and domain issues can absorb them if those issues are told to do so. The failure mode is that #15 writes a SKU note, #10 writes a state-machine note, and the swarm later declares the metamodel universal.

Ranks 12-20 are mostly labels. Using them as new issues would recreate an ERP module list.

## Backlog additions this scan actually recommends

Add these child issues under #73 or #2, when a coordinator files them. This unit does not file them.

1. Recurring and over-time performance obligations. Primary sources IFRS 15, with SaaS usage and construction WIP as counterexample families.
2. Contingent occurrence, incurred-but-unreported service, and probability-weighted facts. Primary source IFRS 17. Keep ACORD operational messages secondary.
3. Clinical observation versus condition versus consent. Primary sources FHIR R5. openEHR is a second corpus, not a second issue.
4. Deontic operators and institutional facts. Primary sources LegalRuleML and ODRL. Keep this out of #67 until the operator question is answered.
5. Retention, legal hold, required destruction, and erasure versus explainable history. Primary sources ISO 15489-1 and GDPR Article 17. 21 CFR Part 11 is a regulated-trust sibling.
6. Legal rights as economic resources, starting with IFRS 16 right-of-use versus the identified underlying asset.

Widen existing issues rather than filing twins.

- #15 must face SID product or service or resource, and PLCS as-designed versus as-maintained.
- #10 must face CMMN CaseFile and discretionary planning.
- #18 and #62 must face CIM interval measurements and conservation on a network.
- #3, #14, and #31 must face LADM RRR and spatial units.
- #38 must add CIM, FHIR, LegalRuleML, ODRL, ISO 15489, ISO 10303-239, ISO 19152, CMMN, and SID to the standards watch. GS1 and ISA-95 stay.
- #79 must run a primitive stress matrix on ranks 1-6, not a second discovery essay.
- #78 should watch GHG Protocol, NAESB, ACORD, NIEM, and PREMIS.

## What would move a rank

A sibling Wave A note that already extracts the same distinction from independent corpora would drop that row into "owned". This scan did not read those branches, by brief. Re-rank after synthesis, not by guessing their contents.

A demonstration that IFRS 15 over-time is just #16 plus #5 valid time would reject rank 1 as a child. That demonstration does not exist in this folder.

A demonstration that LegalRuleML Obligation is Policy plus Constraint would reject rank 4. ODRL Duty as a required Action looks closer to RFC-0001 than LegalRuleML Violation does. That split is still open.
