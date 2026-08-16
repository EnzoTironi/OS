# Sources

**Kind:** source artifact 
**Decision state:** supported for retrieval facts on 2026-08-16. Interpretation of those texts stays on the evidence and law cards.

This list is the corpus for issue 73. Prefer these URLs over secondary blogs. Paywalled ISO and TM Forum texts were used from official abstracts, primers, and public HTML extracts only.

## In-repo context

| ID | Artifact | Used for |
| --- | --- | --- |
| SRC-OS-THESIS | `docs/thesis.md` at `origin/main` `dc918a50e550d384d1e18a6f24424e6ed4595b9c` | Action versus Event, one ontology, many surfaces |
| SRC-OS-CONST | `docs/constitution.md` same commit | Requested is not happened, time, provenance, falsifiability |
| SRC-OS-OQ | `docs/open-questions.md` same commit | Questions this scan must not invent answers for |
| SRC-OS-PROG | `docs/research-program.md` same commit | Domain-question method |
| SRC-OS-BACKLOG | `docs/swarm-research-backlog.md` same commit | Agent output contract. `docs/swarm-result-contract.md` is absent on `origin/main` |
| SRC-OS-RFC1 | `rfcs/0001-metamodel-hypothesis.md` same commit | Candidate primitives under attack |
| SRC-OS-SCEN | `scenarios/README.md` same commit | Existing adversarial families |
| SRC-OS-RESH | `research/README.md` same commit | Evidence-note bar |
| SRC-OS-73 | https://github.com/EnzoTironi/OS/issues/73 | Assigned question |
| SRC-OS-79 | https://github.com/EnzoTironi/OS/issues/79 | Later stress-test unit, not this unit |
| SRC-OS-38 | https://github.com/EnzoTironi/OS/issues/38 | Existing standards corpus |

## Revenue, lease, and insurance measurement

| ID | Source | Retrieved | Notes |
| --- | --- | --- | --- |
| SRC-IFRS15 | IFRS 15 *Revenue from Contracts with Customers*, IFRS Foundation issued PDF, 2021 Part A. https://www.ifrs.org/content/dam/ifrs/publications/pdf-standards/english/2021/issued/part-a/ifrs-15-revenue-from-contracts-with-customers.pdf | 2026-08-16 | Paras 22-23, 31-38, 39-44. Performance obligation, series, over time versus point in time, progress remeasurement |
| SRC-IFRS16 | IFRS 16 *Leases*, IFRS Foundation HTML 2024 issued text and overview. https://www.ifrs.org/content/dam/ifrs/publications/html-standards/english/2024/issued/ifrs16.html and https://www.ifrs.org/issued-standards/list-of-standards/ifrs-16-leases/ | 2026-08-16 | Paras 9-10, 22-27. Identified asset, right-of-use, lease liability |
| SRC-IFRS17 | IFRS 17 *Insurance Contracts*, IFRS Foundation HTML 2026 issued text and standard page. https://www.ifrs.org/content/dam/ifrs/publications/html-standards/english/2026/issued/ifrs17.html and https://www.ifrs.org/issued-standards/list-of-standards/ifrs-17-insurance-contracts/ | 2026-08-16 | Paras 32-37, 40. Probability-weighted fulfilment cash flows, risk adjustment, liability for incurred claims |

IFRS texts are copyright of the IFRS Foundation. Extract concepts only.

## Clinical and consent

| ID | Source | Retrieved | Notes |
| --- | --- | --- | --- |
| SRC-FHIR-OBS | HL7 FHIR R5 Observation. https://hl7.org/fhir/R5/observation.html | 2026-08-16 | Measurements and simple assertions. Not the home of diagnosis |
| SRC-FHIR-COND | HL7 FHIR R5 Condition. https://hl7.org/fhir/condition.html | 2026-08-16 | `clinicalStatus` and `verificationStatus` including `differential`, `unconfirmed`, `refuted` |
| SRC-FHIR-CONS | HL7 FHIR R5 Consent. https://www.hl7.org/fhir/R5/consent.html | 2026-08-16 | Purpose-limited permit or deny, not a generic ACL row |

## Deontic and rights languages

| ID | Source | Retrieved | Notes |
| --- | --- | --- | --- |
| SRC-LRML | OASIS LegalRuleML Core Specification Version 1.0. https://docs.oasis-open.org/legalruleml/legalruleml-core-spec/v1.0/legalruleml-core-spec-v1.0.html | 2026-08-16 | Obligation, Permission, Prohibition, Violation. Constitutive versus prescriptive norms. Institutional facts |
| SRC-ODRL | W3C ODRL Information Model 2.2. https://www.w3.org/TR/odrl-model/ | 2026-08-16 | Permission, Prohibition, Duty over an Asset, with constraints |
| SRC-ODRL-VOC | W3C ODRL Vocabulary and Expression 2.2. https://www.w3.org/TR/odrl-vocab/ | 2026-08-16 | Policy subclasses and rule disjointness |

## Records, erasure, and regulated electronic records

| ID | Source | Retrieved | Notes |
| --- | --- | --- | --- |
| SRC-ISO15489 | ISO 15489-1:2016 abstract and public sample. https://www.iso.org/standard/62542.html and https://cdn.standards.iteh.ai/samples/62542/fe383f4fe10448d5b22ce628b1542ed6/ISO-15489-1-2016.pdf | 2026-08-16 | Authenticity, reliability, integrity, useability. Disposition as a records control |
| SRC-GDPR17 | Regulation (EU) 2016/679 Article 17, EUR-Lex consolidated text. https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX%3A02016R0679-20160504 | 2026-08-16 | Right to erasure and the legal-claim, legal-obligation, and archiving exceptions |
| SRC-21CFR11 | 21 CFR Part 11, eCFR. https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-11 | 2026-08-16 | Criteria for trusting electronic records and signatures. Cited as a regulated-records pressure, not mined in full this pass |

## Product configuration, telecom layering, and land rights

| ID | Source | Retrieved | Notes |
| --- | --- | --- | --- |
| SRC-PLCS | ISO 10303-239:2024 abstract and OASIS PLCS overview. https://www.iso.org/standard/78832.html and https://docs.oasis-open.org/plcs/plcslib/v1.0/cs01/help/plcslib_overview_content.html | 2026-08-16 | Through-life product support. Design-time definition versus as-maintained reality |
| SRC-SID | TM Forum Information Framework (SID) public pages. https://www.tmforum.org/open-digital-architecture/information-framework-sid/ and https://www.tmforum.org/Browsable_HTML_SID_R20.0/content/_3E3F0EC000E93C5DB97B0118-content.html | 2026-08-16 | ProductSpecification, CustomerFacingService, ResourceSpecification |
| SRC-LADM | ISO 19152 family. https://www.iso.org/standard/51206.html and FIG overview https://gdmc.nl/3Dcadastres/Figpub84.pdf | 2026-08-16 | Party, basic administrative unit, right or restriction or responsibility, spatial unit |

## Energy, case work, and construction interchange

| ID | Source | Retrieved | Notes |
| --- | --- | --- | --- |
| SRC-CIM | IEC 61970-301:2020+AMD1:2022 abstract. https://webstore.iec.ch/en/publication/74467 and EPRI CIM primer ch. 1 https://msites.epri.com/rd/research/062333/common-information-model-primer/chapter-1-introduction-to-the-iec-cim | 2026-08-16 | Utility objects, measurements, SCADA, plus IEC 61968 and IEC 62325 siblings |
| SRC-CMMN | OMG CMMN 1.1. https://www.omg.org/spec/CMMN/1.1 and https://www.omg.org/cmmn/ | 2026-08-16 | Case, CaseFile, discretionary tasks, planning at runtime |
| SRC-IFC | buildingSMART IFC 4.3.2.0 and ISO 16739-1:2024. https://standards.buildingsmart.org/IFC/RELEASE/IFC4_3/ and https://www.iso.org/standard/84123.html | 2026-08-16 | Shared built-asset schema across design, build, and operate. Interchange, not OS semantics |

## Sources noted but not opened in full

These are real traditions. This timebox did not read their normative text. Treat claims about them as undetermined until a later unit opens them.

| ID | Pointer | Why it matters |
| --- | --- | --- |
| SRC-OPENEHR | https://specifications.openehr.org/ | Archetyped clinical record, distinct from FHIR resource exchange |
| SRC-PREMIS | https://www.loc.gov/standards/premis/ | Preservation metadata for digital objects |
| SRC-NIEM | https://www.niem.gov/ | Public-sector information exchange |
| SRC-CPSVAP | https://joinup.ec.europa.eu/collection/semantic-interoperability-community-semic | Public-service vocabulary |
| SRC-GHG | https://ghgprotocol.org/corporate-standard | Double counting of emissions and credits |
| SRC-NAESB | https://www.naesb.org/ | Energy nominations versus actuals |
| SRC-ACORD | https://www.acord.org/ | Insurance operational messages, distinct from IFRS 17 measurement |
| SRC-UCUM | https://ucum.org/ | Already in scope for #62 |
| SRC-QUDT | https://www.qudt.org/ | Already in scope for #62 |
| SRC-ISO20022 | https://www.iso20022.org/ | Payments and securities messages. Overlaps #22 |
| SRC-FIBO | https://spec.edmcouncil.org/fibo/ | Already in scope for #37 |

## Licensing note

**Kind:** source artifact 
**Decision state:** supported

No copyleft implementation was copied. Public specifications were used as evidence of distinctions. Implementation reuse is out of scope for this unit and belongs to #69.
