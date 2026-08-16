# Sources

**Kind.** reference
**Fetched.** 2026-08-16
**Decision.** none

## Question

Which independent public sources were read for issue 72, and what was left unread?

## Examined

| Source | What was read | Grade if used as evidence | Locator |
| --- | --- | --- | --- |
| Palantir Foundry Ontology overview | Ontology sits on datasets, virtual tables, and models. Semantics defined by mapping datasources. | official-doc | https://palantir.com/docs/foundry/ontology/overview/ accessed 2026-08-16 |
| Palantir virtual tables | Pointer to external table. Objects can be backed by virtual tables. Downstream datasets and objects still store data. | official-doc | https://palantir.com/docs/foundry/data-integration/virtual-tables/ accessed 2026-08-16 |
| Palantir Action webhooks | Writeback runs before object changes. External success plus Ontology failure is possible. Side effects run after success. | official-doc | https://palantir.com/docs/foundry/action-types/webhooks/ accessed 2026-08-16 |
| Palantir how user edits are applied | Funnel merge. Default "user edits always win". Recency strategy. Deletion hides the object regardless of datasource. | official-doc | https://palantir.com/docs/foundry/object-edits/how-edits-applied/ accessed 2026-08-16 |
| Microsoft Dataverse virtual tables | External data at runtime without replication. Capability list of what virtual tables do not support. | official-doc | https://learn.microsoft.com/en-us/power-apps/maker/data-platform/create-edit-virtual-entities dated 2026-04-17, git commit `be08db439b471951d6b83f7733d1ac598cfd3566` |
| Microsoft F&O virtual entities | CRUD against finance and operations. Data stays in the app. Source entity logic runs. | official-doc | https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/power-platform/virtual-entities-overview dated 2026-01-21, git commit `f3620b9f4e646da05b8104ef906fc7bff4811316` |
| Microsoft dual-write overview | Bidirectional near-real-time replica. Schema changes in Dataverse. Pause and catch-up. | official-doc | https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/data-entities/dual-write/dual-write-overview dated 2026-01-15, git commit `df3b6529af0c026724975543fb431cf8c2b2041f` |
| Microsoft dual-write system requirements | No distributed transactions. `doInsert`, `doUpdate`, and `doDelete` do not trigger sync. 1:1 environments. | official-doc | https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/data-entities/dual-write/dual-write-system-req dated 2026-05-04, git commit `0b72f2d54cccc32c2892032ea3b03342e8156d6a` |
| Microsoft dual-write live sync limits | Two-minute timeout. 1,000-record and payload caps. Aborted transactions. | official-doc | https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/data-entities/dual-write/sync-limits accessed 2026-08-16 |
| Microsoft dual-write what's new | Paused maps keep data 24 hours. Two-minute commit must succeed on both sides. | official-doc | https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/data-entities/dual-write/whats-new-dual-write accessed 2026-08-16 |
| Microsoft Learn dual-write vs virtual tables | Official use-case split by ownership, replication, and offline. | official-doc | https://learn.microsoft.com/en-us/training/modules/get-started-with-powerapps-common-data-service/2b-dual-write-vs-virtual-table dated 2025-06-02, git commit `aaf48eca5c8fcc8c166212128ed16833900e0cc3` |
| SAP CVI / Business Partner | BP is the entry point. Customer and vendor records still exist and are synchronized. | official-doc | SAP Help, Business Partner Conversion Activities, S/4HANA 1610, https://help.sap.com/doc/f2ca09fbcb444d0c906dedacc1775288/1610/en-US/loiocef3a8570239a30be10000000a44147b.pdf . SAP Learning, Manage Customer / Vendor Integration, https://learning.sap.com/courses/managing-customer-and-vendor-accounts/manage-customer-vendor-integration_b3f948ee-b6e4-4f7c-85cd-08dc926ce427 accessed 2026-08-16 |
| SAP Note 2265093 pointer | CVI is a prerequisite for ERP to S/4HANA conversion. Cited via SAP Community RIG post, not the paywalled note text. | official-doc | https://community.sap.com/t5/enterprise-resource-planning-blogs-by-sap/bp-and-cvi-in-sap-s-4hana-system-conversion/ba-p/13369018 accessed 2026-08-16. Note 2265093 itself was not retrieved. |
| SAP Postprocessing Office | Sync failures become postprocessing orders. Periodic check required. | official-doc | SAP Community blog by SAP, Business Partner Usage of Postprocessing Office, https://community.sap.com/t5/enterprise-resource-planning-blog-posts-by-sap/business-partner-usage-of-postprocessing-office-ppo/ba-p/13439767 accessed 2026-08-16 |
| Salesforce Data Virtualization | External Objects hold no rows. Schema projection. Zero-copy is no persistent replica. | official-doc | https://architect.salesforce.com/docs/architect/fundamentals/guide/data-virtualization.html accessed 2026-08-16 |
| W3C SPARQL 1.1 Federated Query | `SERVICE` sends a graph pattern to a remote endpoint. Results merge locally. | official-doc | W3C Recommendation 21 March 2013, https://www.w3.org/TR/2013/REC-sparql11-federated-query-20130321/ |
| Apollo Federation sharing types | Unshared fields break composition. `Event.timestamp` Int versus String fails. Resolvers of a shareable field must behave identically. | official-doc | https://www.apollographql.com/docs/graphos/schema-design/federated-schemas/sharing-types accessed 2026-08-16 |
| GS1 EPCIS 2.0 | Capturing Application asserts events. Capture Interface delivers them. Enterprise apps are insulated from capture detail. eventTime versus recordTime. | official-doc | GS1, EPCIS Standard, Release 2.0, ratified Jun 2022, https://ref.gs1.org/standards/epcis/2.0.0/ |
| SEFAZ/MS NF-e | Legal validity from qualified signature plus SEFAZ authorization of use, before the taxable event. | official-doc | https://www.sefaz.ms.gov.br/documentos-fiscais-eletronicos/nf-e/ accessed 2026-08-16 |
| RFB NF-e sharing manual | Authorizing SEFAZ assigns a protocol number for authorization, denial, cancel, and events. | official-doc | Manual de Compartilhamento da NF-e, retrieved 2026-08-16 from https://hom.nfe.fazenda.gov.br/arearestrita/inicial/exibirArquivo.aspx?conteudo=%2FRzDxklkYPU%3D |
| This repo | Thesis, constitution, open questions, research program, backlog, RFC-0001, scenarios S-004 and S-011, `research/reference-landscape.md`, `research/README.md`. Read only. | design-claim | files on `origin/main` at `dc918a50e550d384d1e18a6f24424e6ed4595b9c` |

## Sibling notes read by `git show` only

These are pointers. Their prose is not copied into this folder and is not treated as primary evidence.

| Branch | SHA | Path used as a pointer |
| --- | --- | --- |
| `cursor/issue-15-domain-cfd8` | `80637d0ecadb9e123afc773a10e16c055ceeb2eb` | `research/domain/product/` |
| `cursor/issue-16-domain-cfd8` | `9d82f27e9cea2a8d2d71ed77de9eaa553121e6b5` | `research/domain/o2c/` |
| `cursor/issue-31-domain-cfd8` | `59a5c79f939518f5cacccced8ace26e93be4a91b` | `research/domain/multi-entity/` |
| `cursor/issue-35-corpus-cfd8` | `a2bb627d9929d9bdd332958cf4b482b0ba9d61af` | `research/notes/issue-0035-palantir-ontology-primitives.md` |
| `cursor/issue-38-corpus-cfd8` | `f49621af098d28ae6132ac9378d2371c90ee0a88` | `research/standards/` |
| `cursor/issue-55-kill-cfd8` | `5f4233579cf3057783775126afa64c39ed631353` | `research/kill/unified-ontology/` |
| `cursor/issue-60-kill-cfd8` | `0a8551c04f25c0feefd8ed616d14e3ff605ed047` | `research/kill/authority/` |

## Not examined

- ERPNext, Odoo, Moqui, SAP, or Palantir source trees. No product clone.
- ISO 8000 master-data quality text. Paywalled. MDM style names stay `hypothesis` unless a public vendor doc already names the style.
- IEC 62264 full PDFs. ISA-95 pressure is cited through sibling issue 38 and through EPCIS's enterprise-versus-capture split.
- Bank-statement matching manuals and ISO 20022 `camt.053` text. Cash-book versus bank-book is inferred from ordinary reconciliation plus the NF-e legal-issuer pattern and stays `hypothesis` until a named bank-rec manual is cited.
- Amazon SP-API or Mercado Livre order-ownership contracts. Marketplace order ownership stays `hypothesis` from the standing assumption plus dual-write's 1:1 limit.
- Issue 74 contract schema. The schema is not on `origin/main`. This exclusive tree cannot write `research/index/` or `docs/swarm-result-contract.md`.
- `cursor/issue-68-kill-cfd8`. Remote ref missing.
