# Sources

**Kind:** source-system artifact (citation index)  
**Decision state:** `supported` for the fetch list. `undetermined` for unpaid full texts not retrieved.

Fetched or opened on 2026-08-16 unless noted. Prefer first-party pages and spec PDFs. Secondary blogs were not used as evidence.

## In-repo context (not evidence of the standards)

- `docs/thesis.md`
- `docs/constitution.md`
- `docs/open-questions.md` questions 5, 7, 13, 14
- `docs/research-program.md`
- `docs/swarm-research-backlog.md` Agent output contract
- `rfcs/0001-metamodel-hypothesis.md`
- `scenarios/README.md` S-001, S-007, S-008, S-009, S-011
- `research/README.md`
- `research/reference-landscape.md`

`docs/swarm-result-contract.md` is absent on `origin/main` at `dc918a5`.

## GS1 EPCIS and CBV

| ID | Source | What was used |
| --- | --- | --- |
| S-EPCIS-20 | GS1. *EPCIS Standard 2.0*, June 2022. https://ref.gs1.org/standards/epcis/2.0.0/ | Full HTML of the 2.0 text. Event types, dimensions, Action, errorDeclaration, eventTime, recordTime, TransformationEvent. |
| S-CBV-20 | GS1. *Core Business Vocabulary Standard 2.0*, June 2022. https://ref.gs1.org/standards/cbv/2.0.0/ | Full HTML. Standard versus user vocabulary. bizStep and disposition definitions. |
| S-GS1-LANDING | GS1. *EPCIS and CBV* product page. https://www.gs1.org/standards/epcis | Positioning as visibility and chain-of-custody messaging. 2.0 feature list. |
| S-ISO-19987 | ISO/IEC 19987:2024. *Information technology. EPC Information Services (EPCIS)*. https://www.iso.org/standard/85557.html | Official abstract. EPCIS 2.0 as ISO edition 3, published 2024-03. |
| S-ISO-19988 | ISO/IEC 19988:2024. *Information technology. GS1 Core Business Vocabulary (CBV)*. https://www.iso.org/standard/85558.html | Official abstract. CBV 2.0 as ISO edition 3. |
| S-ISO-19987-PREVIEW | ISO/IEC 19987:2024 sample PDF via ISO catalog preview | Confirms JSON, REST, AssociationEvent, How dimension, persistent disposition. Same technical content as S-EPCIS-20. |

## ISA-95, IEC 62264, ISA-88, B2MML

| ID | Source | What was used |
| --- | --- | --- |
| S-ISA95-LANDING | ISA. *ISA-95 Series of Standards*. https://www.isa.org/standards-and-publications/isa-standards/isa-95-standard | Official part list, Purdue-derived levels 0 to 4, purpose as abstract integration model. Notes ANSI/ISA-95.00.01-2025 (IEC 62264-1 Mod). |
| S-IEC-62264-1-2003 | IEC 62264-1:2003 sample. *Enterprise-control system integration. Part 1: Models and terminology*. https://cdn.standards.iteh.ai/samples/35480/106d6c212cc9472bbc89d6a1450ffd7d/IEC-62264-1-2003.pdf | Scope, non-goals, hierarchy and object-model outline, terms for capability, capacity, BOM, area. This is the 2003 edition, not the 2025 ISA text. |
| S-ISA95-P5-2018 | ANSI/ISA-95.00.05-2018 preview PDF. https://www.isa.org/getmedia/bbc0eb3e-d047-440d-88fc-642b14bd8d40/ISA-95-00-05-2018-preview.pdf | Official ISA preview. Transaction scope. Noun list including Equipment and Physical Asset. Verb and noun exchange. OAGIS acknowledgement. |
| S-ISA95-P4-TOC | ANSI/ISA-95.00.04-2018 table-of-contents preview. https://www.isa.org/getmedia/802388c8-0b4f-4420-9cd7-18e7e69db7a3/ISA-95-00-04-2018_toc.pdf | Specification, requirement, actual, and capability headings for personnel, equipment, physical asset, material. Relation to ISA-88. |
| S-ISA88-LANDING | ISA. *ISA-88 Series of Standards*. https://www.isa.org/standards-and-publications/isa-standards/isa-88-standards | Official part list. Recipe models. Batch production records. TR88.95.01 on using ISA-88 and ISA-95 together. |
| S-IEC-61512 | IEC 61512-1:2026 catalog page. https://webstore.iec.ch/en/publication/75287 | Confirms ISA-88 as IEC 61512 and a 2026 revision that references IEC 62264. Full text not retrieved. |
| S-B2MML | MESA International. *B2MML*. https://mesa.org/topics-resources/b2mml/ | Official statement that B2MML is an XML implementation of ISA-95 and IEC 62264. Royalty-free with MESA credit. |
| S-B2MML-GH | MESAInternational/B2MML-BatchML schema header, version 0701. https://github.com/MESAInternational/B2MML-BatchML | Confirms schemas implement ISA-95 Part 2 (2018) and Part 5 (2018). Schema files were not copied. |

## Apache Ossie and semantic interchange

| ID | Source | What was used |
| --- | --- | --- |
| S-OSSIE-HOME | Apache Ossie (incubating). https://ossie.apache.org/ | Project purpose. Core classes. Formerly Open Semantic Interchange. |
| S-OSSIE-SPEC | apache/ossie `core-spec/spec.md`, draft 0.2.0.dev0. https://raw.githubusercontent.com/apache/ossie/main/core-spec/spec.md | Semantic model, datasets, relationships, metrics, dialects, `custom_extensions`. |
| S-OSSIE-DOCS | apache/ossie `docs/index.md`. https://github.com/apache/ossie/blob/main/docs/index.md | Hub-and-spoke converters. Round-trip via `custom_extensions`. |

## Additional public standards discovered this session

| ID | Source | Why it is here |
| --- | --- | --- |
| S-UNTP-DTE | UNECE UNTP. *Digital Traceability Events*. https://untp.unece.org/docs/specification/DigitalTraceabilityEvents/ | Profile that maps Make, Move, Modify onto EPCIS types and CBV URIs. |
| S-OAGIS | Open Applications Group, cited inside S-ISA95-P5-2018 | ISA-95 Part 5 says some transaction work is based on OAGIS BODs. First-party OAGIS text was not fetched. |
| S-ISO-15704 | ISO 15704:2000, cited inside S-IEC-62264-1-2003 | IEC 62264 presents itself as a partial enterprise-reference model in the ISO 15704 sense. |
| S-CEFACT20 | UN/CEFACT Recommendation 20, cited inside S-EPCIS-20 section 7.3.3.1.1 | Units of measure for class-level quantity. |

## Not examined (limits)

- Full paid ANSI/ISA-95.00.01-2025 and IEC 62264-1 current edition body
- Full ISA-88.00.01-2010 PDF
- Full ISA-95 Part 2, Part 3, Part 4, Part 6, Part 7, Part 8 bodies
- GS1 Digital Link standard text
- GS1 EPCIS and CBV Implementation Guideline 2.0
- ISO 22005 (traceability in the feed and food chain)
- ISO 15926
- OPC UA companion specifications
- AutomationML
- OpenEPCIS source
- Ossie converters and TPC-DS example model
- OAGIS BOD catalog

Those absences keep several equipment-versus-asset and recipe-versus-procedure claims at `hypothesis` or `undetermined`.
