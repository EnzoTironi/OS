# Convergence matrix

**Kind:** domain evidence  
**Decision state:** supported for the cells that cite a fetched page. Cells marked `U` are undetermined.

Legend:

- `Y` independent source makes the distinction
- `P` present as a source-shaped field, not clearly the domain concept
- `N` absent in the pages fetched
- `U` not readable or not decided
- `D` disagrees with the row's domain reading

The goal is evidence of shared distinctions, not a feature scorecard.

| Distinction | ISO 9000 or 9001 | ISO 2859 | 21 CFR 211.165 | ISA-95 public | GS1 CBV or EPCIS | ERPNext | Odoo 19 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Specification vs characteristic | Y | U | Y specs named | Y test spec | Y `testprd` | P template parameter | P QCP or check type |
| Characteristic vs measurement | Y | U | Y testing vs specs | Y result vs spec | Y `testres` vs `testprd` | Y reading vs min or max | Y measure vs norm |
| Measurement vs inspection judgment | Y | Y attribute plan | Y lab determination | P result field | Y inspecting vs disposition | Y row status vs readings | Y Pass or Fail vs measure |
| Inspection vs release | Y 8.6 | N | Y 211.165(a) | U | Y cert or testres ≠ ship | P header status plus stock gate | N check pass ≠ MO done |
| Inspection plan vs instance | Y quality plan | Y sampling scheme | Y written plan | Y spec Version | Y `testprd` vs `testres` | P template fetch | Y QCP vs check |
| Sample vs lot judgment | U | Y AQL lot | Y statistical criteria | U | D CBV sampling is destructive | P sample size | P percent or random trigger |
| Destructive sample vs inspect | U | U | U | U | Y | N | N |
| Acceptance criteria as function | Y requirement | Y accept or reject numbers | Y accept or reject levels | U | N | Y range, value, or formula | Y tolerance around norm |
| Nonconformity vs disposition | Y 8.7 | N | Y reject then reprocess | U | Y step vs disposition | D header Rejected | P alert plus failure location |
| Concession after nonconformity | Y 3.12.5, 8.7 | N | D shall be rejected | U | N | P manual inspection | N |
| Deviation permit before realization | Y 3.12.6 | N | N | U | N | N | N |
| Quarantine or hold custody | P segregation | N | N | U | P holding, location 428, no CBV `quarantined` | N | P failure location |
| Rework vs repair | Y 3.12.8 vs 3.12.9 | N | P reprocessing | U | P repairing step | N | N |
| Release authorizer provenance | Y 8.6(b) | N | Y QC unit | U | Y event actor | P verified by | P responsible |
| Certificate vs test result | P 8.6 evidence | N | N | U | Y `cert` vs `testres` | N | N |
| Lot genealogy | Y 8.5.2 traceability | N | N | U | Y transformation and events | P batch mention | P lot on check |
| Calibration context | Y 7.1.5.2 | N | P method validation 211.165(e) | U | P sensor and device | N | P optional device |
| Measurement uncertainty | Y via GUM, 7.1.5 | N | N | N in public result type | P sensor element | N | N |
| Test result expiration | N | N | N | Y Expiration | P cert end date | N | N |
| Valid time vs record time | P | N | N | Y Date ≠ timestamp | Y event time | N | N |
| Event correction by successor | P records | N | N | U | Y append-only | U submit amend unknown | U |
| CAPA vs product NCR | Y 10.2 vs 8.7 | N | U 211.192 unread | U | N | Y split modules | D alert mixes both |
| Partial quantity fail | P 8.7 action by nature | Y lot is the unit | P batch reject | U | P quantity mismatch dispositions | N one QI status | Y Quantity Failed |
| Override or concession path | Y concession | N | D reject required | U | N | Y manual inspection | P fail then alert |
| Auto-pass without reading | N | N | N | N | N | N | Y Shop Floor checkbox |
| ISA-95 Part 1 attributes | none | none | none | U paywalled | none | none | none |

## Convergence that survived

Independent sources agree on all of the following.

1. A specification states requirements. A measurement or test result is not that specification. ISO 9000, ISA-95 public mapping, GS1 `testprd` vs `testres`, ERPNext template vs readings, Odoo QCP vs check.
2. Inspection or test judgment is not permission to ship. ISO 9001 8.6, 21 CFR 211.165, GS1 disposition after inspecting, ERPNext header status after row status.
3. Nonconformity requires a later authorized dealing. ISO 9001 8.7, GS1 `non_conformant` then a follow-up disposition, Odoo fail then location or alert.
4. Release records must name evidence and an authorizer. ISO 9001 8.6, 21 CFR quality control unit.
5. Plan or procedure is not the executed result. ISO quality plan, Odoo QCP, ISA-95 Versioned test spec, GS1 `testprd` vs `testres`.

## Divergence that must not be averaged away

1. **Concession versus reject.** ISO 9001 allows acceptance under concession. 21 CFR 211.165(f) says failing drug products shall be rejected. Reprocessing is allowed. Use under concession is not in that clause. Decision state for a universal concession Action is **undetermined** across industries.
2. **What "sampling" means.** ISO 2859 sampling leaves the lot in commerce and infers quality. GS1 CBV `sampling` removes the instance from the supply chain. ERPNext sample size does neither explicitly.
3. **Where CAPA lives.** ERPNext splits inspection from Quality Action. Odoo Quality Alert mixes notification and CAPA. ISO splits 8.7 from 10.2.
4. **Partial lot.** Odoo can fail a quantity and move it. ERPNext Quality Inspection is one status for the document. ISO 2859 accepts or rejects the lot as the statistical unit.
5. **Override.** ERPNext Manual Inspection writes Accepted on a failing reading. ISO would call a documented concession. 21 CFR would not allow that path for finished drug release.
6. **Uncertainty.** GUM and ISO 9001 7.1.5 make uncertainty part of a trustworthy measurement. ERPNext, Odoo, and the public ISA-95 result type omit it.

## Sibling cells, not rewritten

| Topic | Owner | Quality stance |
| --- | --- | --- |
| Hold, quarantine location, available vs unavailable qty | #18 | Quality may request containment. Inventory records custody |
| Scrap qty, rework execution, completed qty on a work order | #19 | Quality names the dealing. Manufacturing executes it |
| Lot split, transformation, EPCIS event graph | #20, #38 | Quality cites genealogy. It does not own the graph |
