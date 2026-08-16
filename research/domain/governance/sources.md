# Sources

**Kind:** source-system artifact (this file is the source register)  
**Decision:** none  
**Fetched:** 2026-08-16

Each row is a document actually opened this session. Secondary blogs appear only when a first-party page failed and the cell in `matrix.md` is then `undetermined`.

## Standards and public law

| ID | Source | URL | Retrieved | Use |
| --- | --- | --- | --- | --- |
| S-NIST-RMF | NIST SP 800-37 Rev. 2, Risk Management Framework | https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-37r2.pdf | yes, full text | risk, control, assess, authorize, monitor, POA&M, ATO |
| S-NIST-53 | NIST SP 800-53 Rev. 5, Security and Privacy Controls | https://csrc.nist.gov/pubs/sp/800/53/r5/final and PDF | yes, abstract plus PDF | control as catalogued safeguard, functionality vs assurance |
| S-OSCAL | NIST OSCAL concepts, assessment-plan model, leveraged authorizations | https://pages.nist.gov/OSCAL/learn/concepts/ and assessment-plan pages | partial. layers page timed out. assessment-plan and concepts pages retrieved | control catalog, profile, SSP, assessment plan/results as distinct documents |
| S-FEDRAMP-POAM | FedRAMP POA&M Template Completion Guide v3.0 | https://help.fedramp.gov/hc/en-us/articles/28902470807323-FedRAMP-Plan-of-Actions-and-Milestones-POA-M-Template-Completion-Guide-Version-3-0 | yes | finding, residual risk, remediation, operational requirement |
| S-COSO-IC | COSO Internal Control Integrated Framework 2013 executive summary | https://www.coso.org/guidance-on-ic and COSO ICIF PDF | yes, executive summary and official IC page | control components, 17 principles, SOD, policies-and-procedures |
| S-COSO-ERM | COSO ERM Integrating with Strategy and Performance (2017) executive summary | https://aaahq.org/portals/0/documents/coso/coso_erm_2017_-_exec_summary.pdf | yes | risk appetite, risk response, ERM is not a department, ERM is not only internal control |
| S-ISO-31000 | ISO 31000:2018 Risk management Guidelines | https://www.iso.org/standard/65694.html plus AS ISO 31000:2018 identical text excerpt | official page yes. full ISO paywalled. AS identical reprint retrieved | risk as effect of uncertainty on objectives, treatment, residual risk |
| S-ISO-37301 | ISO 37301:2021 Compliance management systems | https://www.iso.org/standard/75080.html and TC 309 FAQ | official page and FAQ yes. full text paywalled | compliance obligation as a managed object, certifiable CMS |
| S-IIA-3L | IIA Three Lines Model (2020 GPI reprint of the position paper) | https://www.theiia.org/globalassets/documents/content/articles/gpi/2020/december/three-lines-model_english-final.pdf | yes | governing body, first/second-line management, independent third-line assurance |
| S-SEC-404 | SEC final rule 33-8809 and interpretive release 33-8810 on ICFR | https://www.sec.gov/files/rules/final/2007/33-8809fr.pdf and https://www.sec.gov/files/rules/interp/2007/33-8810.pdf | yes | management assessment vs auditor attestation, material weakness |
| S-GDPR | Regulation (EU) 2016/679, EUR-Lex, Article 99 | https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX%3A32016R0679 | yes | entry into force ≠ application date |

## Runtime authorization engines

| ID | Source | URL | Retrieved | Use |
| --- | --- | --- | --- | --- |
| S-CEDAR | Cedar Policy Language Reference Guide v4.5 | https://docs.cedarpolicy.com/ | yes | allow/deny on principal, action, resource, context. Policies separate from application code |
| S-OPENFGA | OpenFGA Concepts | https://openfga.dev/docs/concepts | yes | authorization model + relationship tuples. Check is a relationship question |
| S-OPA | Open Policy Agent docs | https://openpolicyagent.org/docs | yes | decision decoupled from enforcement. Output may be structured, not only boolean |

## Operational ontology and GRC products

| ID | Source | URL | Retrieved | Use |
| --- | --- | --- | --- | --- |
| S-BKN-SPEC | BKN Language Specification 2.0.1 | https://github.com/kweaver-ai/bkn-specification/blob/main/docs/SPECIFICATION.en.md | yes | RiskType independent of ActionType. `risk_level` vs how to manage. `requires_approval` |
| S-BKN-FOUNDRY | openbkn-ai/bkn-foundry README | https://github.com/openbkn-ai/bkn-foundry | yes | Object → Action → Rule → Constraint / Risk. Pre-exec simulation, downgrade, block, second confirmation |
| S-BKN-CLI | BKN CLI README risk eval example | https://github.com/kweaver-ai/bkn-specification/blob/main/cli/README.md | yes | month-end freeze as an external rule that sets `allowed: false` |
| S-PAL-MARK | Palantir Foundry Markings | https://palantir.com/docs/foundry/security/markings/ | yes | mandatory vs discretionary control. Case markings. Eligibility ≠ grant |
| S-PAL-APPR | Palantir Foundry Approvals | https://palantir.com/docs/foundry/approvals/overview/ | yes | request, task, approve, invoke. Approved-but-not-invocable when checkpoints incomplete |
| S-SN-EXC | ServiceNow Assess risk for a policy exception (Australia, updated 2026-03-12) | https://www.servicenow.com/docs/r/governance-risk-compliance/grc-risk-management-workspace/assess-the-risk-on-policy-exception.html | yes | policy exception as a record with residual risk, impacted controls, mitigating controls, extensions |
| S-SN-COMP | ServiceNow Policy and Compliance Management installed components | https://www.servicenow.com/docs/r/washingtondc/governance-risk-compliance/policy-and-compliance-management/r_InstallWPolAndCompl.html | yes | tables `sn_compliance_policy_exception`, attestation and acknowledgement roles |
| S-SAP-AC | SAP Access Control application help (10.1 / 12.0) | https://help.sap.com/doc/ca8a8544445e47f5bb0cbc8220ae01b2/12.0.28/en-US/loio8bdd50b2b1f34e049c45ded84788789c_EN.pdf | yes | SoD risk analysis, access request, periodic review, firefighter, Process Control integration |

## ERP approval workflows

| ID | Source | URL | Retrieved | Use |
| --- | --- | --- | --- | --- |
| S-FRAPPE-WF | ERPNext / Frappe Workflows | https://docs.frappe.io/erpnext/workflows | yes | multi-level approval as document state machine over docstatus 0/1/2 |
| S-ODOO-STUDIO | Odoo 17 Studio approval rules | https://www.odoo.com/documentation/17.0/applications/studio/approval_rules.html | yes | approval gates a button. Exclusive approval. Revoke. Approval entries |
| S-ODOO-APPR | Odoo Approvals product page | https://www.odoo.com/app/approvals | yes, marketing page | centralized request hub. Weak as domain evidence. Used only as a source-system artifact |
| S-MOQUI-SEC | Moqui Framework Security | https://moqui.org/docs/framework/Security | yes | artifact-aware allow/deny/always. Not a GRC object model |

## Failed or not used as evidence

| Target | Status | Matrix treatment |
| --- | --- | --- |
| Archer, MetricStream, Diligent, Workiva first-party object models | not fetched this session | `undetermined` |
| COBIT 2019 official text | not fetched | `undetermined` |
| NIST IR 8286, ISO 27001 full text, PCI DSS | not fetched | `undetermined` |
| OSCAL layers overview page | timed out | other OSCAL pages used |
| Full ISO 31000 and ISO 37301 PDFs | paywalled | official abstracts plus AS ISO 31000 identical reprint and TC 309 FAQ |

## Licensing note

OS is MIT. This folder extracts concepts and published behavior. It does not paste or translate implementation from Frappe, Odoo, Moqui, SAP, ServiceNow, or OpenBKN.
