---
issue: 58
kind: reference
fetched: 2026-08-16
decision_state: hypothesis
---

# Convergence and divergence

The question is not feature comparison. It is whether independent sources treat the same job as a second semantic language or as evaluation of shared laws.

## Convergence

| Distinction | Sources | Kind | Notes |
| --- | --- | --- | --- |
| Debit total equals credit total on a successful post | TigerBeetle S-TB-01. Thesis example. Sibling L1 | domain evidence | Refuse-closed. Not a primitive name. |
| Posted history is append or reverse, not delete | TigerBeetle S-TB-01. ERPNext S-EN-02. Sibling L3 | domain evidence | Physical stores may enforce this. |
| Quantity movement is not automatically a GL event | Odoo S-OD-01. Sibling L11. ValueFlows events vs reports | domain evidence | ERPNext perpetual is the counter-artifact. |
| Valuation is a named formula over movements | IAS 2 §§25-27. ERPNext S-EN-01. Odoo S-OD-01 | domain evidence | FIFO and average converge. LIFO diverges by jurisdiction. |
| Current stock or value may be stored for speed and remains derived | ValueFlows S-VF-01. Constitution §6 | domain evidence | Storage is not authority. |
| Explosion and netting are deterministic given pinned inputs | Sibling planning L-01, L-03. ERPNext projected-qty formula cited there | domain evidence | Function class. |
| Finite schedule can refuse a material-feasible plan | Wikipedia APS. Sibling L-06 | domain evidence | Search class, not the same arithmetic. |
| Fiscal document legal existence is outside the ERP | Ajuste SINIEF 07/05. Sibling CL-003, CL-005 | domain evidence | Signature plus authorizer. |
| Government validators and layouts sit beside the operational system | SPED PVA S-SPED-01, S-SPED-02. eSocial S-ES-01. PAF-ECF S-PAF-01 | domain evidence | Physical checkers. |
| Money is not binary float | Sibling L-NUM-01, L16. TigerBeetle integer amounts | domain evidence | Value type, not a kernel. |
| Language versus Engine | Palantir S-PL-01. Constitution §6. RFC-0001 Compiler exclusion | independent product split | Closest existing statement of this issue's boundary. |
| Context vocabularies may differ without minting engines | Sibling issue 55 | sibling law | Semantic specialization ≠ physical kernel. |

## Divergence

| Topic | Split | Why it matters |
| --- | --- | --- |
| When stock hits the GL | ERPNext default perpetual on each stock voucher. Odoo 19 periodic at closing or perpetual at invoicing. Moqui via sibling, asset events can exist without the journal. | A kernel that always posts both is a source accident. |
| LIFO | IAS 2 excludes it. US GAAP allows it. Some ERPs still ship it. | Formula is policy plus jurisdiction, not engine law. |
| Safety-stock arithmetic | Sibling planning E-04. ERPNext adds cover after netting. Odoo targets ending inventory. | Two Functions. One SafetyStockKernel would lie. |
| Plan as Action versus projection | ERPNext Production Plan submits and reserves. Odoo MPS suggests until Order. | Not a kernel. Standing fork on issue 24. |
| Invoice versus fiscal document | Sibling fiscal OQ-001. Legal split is supported. OS type cut is undetermined. | Do not solve it with a FiscalKernel type. |
| Filing as projection versus ledger | Sibling fiscal OQ-004. SPED has separate validators. | Physical checker exists either way. |
| Function versus optimization | Open question 9. Palantir allows several compute engines under one action. | This folder supports the class split and leaves the primitive word open. |
| Integer minor units versus decimal | TigerBeetle uint128. Sibling values want exact decimal. | Encoding fork. Same prohibition on binary float. |

## Source artifacts that must not become OS primitives

| Artifact | Source | Why it is an artifact |
| --- | --- | --- |
| `AccountingKernel` | H2 | Second business model. Already weakened. |
| Warehouse equals GL account | ERPNext S-EN-01 | Optional convenience. Sibling inventory already warns. |
| Stock interim in/out accounts | Odoo pre-19 | Removed in 19. Variation account replaced them. |
| TigerBeetle Transfer of exactly one debit and one credit | S-TB-01 | Efficiency. Multi-line journals compose from that shape. |
| Palantir TypeScript or Python Functions | S-PL-02 | Authoring language. |
| PAF-ECF Menu Fiscal | S-PAF-01 | Certified POS surface. |
| PVA binary | S-SPED-02 | Official checker program. |
| eSocial S-1200 | S-ES-01 | Dated layout. |
| CFOP, CST, chave de acesso | Sibling fiscal | Brazil tables. |
| Repost Item Valuation | ERPNext S-EN-02 | One product's job name for ordered replay. |
