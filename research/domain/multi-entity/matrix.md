---
issue: 31
kind: reference
fetched: 2026-08-16
decision_state: hypothesis
---

# Convergence and divergence

The goal is evidence of semantic agreement or disagreement. This is not a feature comparison. Cells are `yes`, `no`, `partial`, or `undetermined`. `undetermined` means the first-party page was missing, timed out, or silent.

## Distinction matrix

| Distinction | ERPNext | Odoo | Moqui | IFRS / IAS | FIBO / GLEIF | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Legal person versus operating site or branch | yes | yes | partial | yes | yes | E1, E9, E23. Moqui uses Party plus role, not a Branch type |
| Parent that cannot post | yes | no | undetermined | no | undetermined | E27. IFRS parents are entities. Odoo parents transact |
| Independent subsidiary must be its own company | yes | yes | partial | yes | yes | E1, E9, E16, E24 |
| Shared Customer, Supplier, Item masters | yes | yes | yes | n/a | n/a | E2, E10, E14. Labels, not kinds. E26 |
| Entity-specific terms on a shared master | partial | yes | undetermined | n/a | n/a | Odoo 19 company-specific Cost. E10 |
| Intercompany is two documents or two entries | yes | yes | undetermined | yes | n/a | E3, E4, E11, E17 |
| Automatic counterpart validation | no | partial | undetermined | n/a | n/a | ERPNext requires review. Odoo can auto-validate. E3, E11 |
| Intercompany stock as commercial flow | yes | partial | undetermined | n/a | n/a | ERPNext DN/PR. Odoo 19 can sync stock moves. E5, E11 |
| Shared physical warehouse, separate books | yes | undetermined | undetermined | n/a | n/a | E5. Issue 18 owns location ownership |
| Consolidation is a projection | partial | yes | undetermined | yes | yes | E8 404 on elimination. E12, E17, E24 |
| Full intragroup elimination | undetermined | partial | undetermined | yes | n/a | E17. Odoo uses excluded adjustment journals. E12 |
| Control ≠ ownership percent | no | no | no | yes | partial | E16, E20, E24. ERPs store parent links, not IFRS control tests |
| Significant influence / associate | no | no | no | yes | undetermined | E20 |
| NCI in equity | undetermined | undetermined | undetermined | yes | undetermined | E18 |
| Functional versus presentation currency | partial | partial | partial | yes | n/a | E6, E12, E21. ERPNext company and reporting currency |
| Books kept in a third currency | undetermined | undetermined | undetermined | yes | n/a | IAS 21 paragraph 34. E21 |
| Finance book ≠ legal entity | yes | partial | undetermined | yes | n/a | E7, E19. Odoo multi-ledgers. Issue 21 owns the identity fork |
| Cross-company permission ≠ legal control | yes | yes | yes | n/a | n/a | E13, E15, E30 |
| Effective-dated corporate structure | undetermined | undetermined | yes | yes | yes | E18, E22, E24, E31 |
| Customer or Supplier as Kind | rejected | rejected | rejected | n/a | rejected | E26. Issue 14 |

## Source artifacts that must not become OS types

| Source artifact | Kind | Why it is an artifact | Safer domain cut |
| --- | --- | --- | --- |
| ERPNext Company DocType | source-system artifact | Mixes legal person, books, localization, and a non-posting group folder | Legal person plus books plus optional group membership |
| ERPNext Is Group | source-system artifact | Holding companies transact in IFRS | Group membership is a relationship, not a posting flag |
| ERPNext Represents Company | source-system artifact | A field on Customer or Supplier | Role of one legal person toward another. Issue 14 |
| Odoo `res.company` versus Branch | source-system artifact | Branch enables multi-company billing and cannot convert back to company | Legal person versus operating unit. E9 |
| Odoo blank Company field | source-system artifact | Visibility hack for shared masters | Common identity with optional entity-specific terms |
| Odoo Synchronize Stock Moves | source-system artifact | Can hide the two-ledger commercial event | Two stock events plus a link, or one physical move with two ownership facts. Issue 18 |
| Moqui Internal role | source-system artifact | Role name for "we operate this party" | Operated-organization relationship |
| Moqui `filterOrgIds` | source-system artifact | Query rewrite | Policy over principal and legal person |
| GLEIF StartNode or EndNode | source-system artifact | File orientation, child reports parent | Dated consolidating-parent relationship |
| Finance Book name | source-system artifact | ERPNext report filter | Reporting basis. Issue 21 |

## Convergence that survived this session

1. A legal person that keeps books is not a site, branch, or brand. E1, E9, E23.
2. Intercompany trade writes two legal-person ledgers. E3, E4, E11, E17.
3. Shared catalog identity is compatible with entity-specific terms and books. E2, E10.
4. Consolidation presents a group as one economic entity and must eliminate intragroup positions. E12, E16, E17.
5. Control, significant influence, and mere ownership percent are different. E16, E20. ERPs do not encode the IFRS test.
6. Functional, transaction, and presentation currencies are different facts. E6, E21, E25.
7. Cross-company visibility is policy, not ownership. E13, E15, E30.
8. Customer and Supplier remain roles. E26.

## Divergence that remains a research question

1. Whether a parent record may post. ERPNext group nodes cannot. IFRS parents can. Odoo parents can.
2. Whether intercompany stock may sync as one move. Odoo 19 offers it. ERPNext collaborators reject a shared warehouse ledger.
3. Whether company record identity equals legal-person identity. All three ERPs collapse them. FIBO and GLEIF do not have to. Stays `undetermined`.
4. Whether a book is an identity or a filter. ERPNext Finance Book and Odoo multi-ledgers look like filters. IAS 27 separate statements look like a second report over the same person. Stays `undetermined`. Issue 21.
5. How much of IFRS elimination an ERP report actually performs. ERPNext page 404. Odoo uses extra journals. IFRS requires full elimination.

## Cells marked undetermined because a page failed

| Cell | Reason |
| --- | --- |
| ERPNext elimination | `consolidated-financial-statement` 404 |
| ERPNext drop-ship between subsidiaries | page 404 |
| FIBO ownership and control properties | viewer rendered no class text |
| IFRS 11 joint arrangements | full text not fetched |
| OECD transfer pricing methods | official guidelines not fetched |
| ERPNext and Odoo valid-time parent trees | docs silent |
