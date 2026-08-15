# Corpus, method, and Wave A contract

**Status.** Wave A, timeboxed.  
**Decision.** none.

## 1. Question

What enterprise distinctions has ERPNext/Frappe been forced to encode after years of production use, especially around ledgers, submit/cancel, manufacturing execution, reservation, lot/serial identity, and partial flows?

The uncertainty is not "what DocTypes exist". It is which of those distinctions are domain laws versus Frappe implementation artifacts.

## 2. Sources

Pinned 2026-08-15. Paths are on those SHAs unless a historical PR is named.

| Repo | License | Ref | SHA |
| --- | --- | --- | --- |
| [frappe/erpnext](https://github.com/frappe/erpnext) | GPL-3.0 | `develop` | `1212a278c6a5fcad4bd67d27ec15c6af9d3e94b4` (2026-08-15) |
| [frappe/frappe](https://github.com/frappe/frappe) | MIT | `develop` | `d9dc348ae8c196487871fcd856e75fc27f68c9b9` (2026-08-15) |
| [frappe/hrms](https://github.com/frappe/hrms) | GPL-3.0 | `develop` | `4eecaef6983049899e78a9e845beff5856eac893` (2026-08-14) |

Official docs (fetched this session):

- [Controllers / document hooks](https://docs.frappe.io/framework/user/en/basics/doctypes/controllers) (updated 2026-02-17)
- [Immutable ledger](https://docs.frappe.io/erpnext/immutable-ledger-in-erpnext) (updated 2026-08-14)
- [How transactions affect the ledger](https://docs.frappe.io/erpnext/how-transactions-affect-the-ledger) (updated 2026-07-30)

Historical source:

- [frappe/erpnext#18740](https://github.com/frappe/erpnext/pull/18740) "feat: Immutable ledger" (reversal-on-cancel, original backdate ban)

Primary code paths inspected (behavior and comments only):

- `frappe/model/document.py` (`submit`, `cancel`, `discard`, `check_docstatus_transition`, `validate_amended_from`)
- `erpnext/controllers/status_updater.py`
- `erpnext/controllers/stock_controller.py`
- `erpnext/controllers/accounts_controller.py`
- `erpnext/stock/doctype/stock_ledger_entry/stock_ledger_entry.py`
- `erpnext/stock/stock_ledger.py`
- `erpnext/accounts/doctype/gl_entry/gl_entry.py`
- `erpnext/accounts/general_ledger.py`
- `erpnext/accounts/utils.py` (`is_immutable_ledger_enabled`)
- `erpnext/accounts/doctype/payment_ledger_entry/payment_ledger_entry.py`
- `erpnext/stock/doctype/stock_reservation_entry/stock_reservation_entry.py`
- `erpnext/stock/doctype/serial_and_batch_bundle/serial_and_batch_bundle.py`
- `erpnext/stock/doctype/quality_inspection/quality_inspection.py`
- `erpnext/stock/report/stock_ledger_invariant_check/stock_ledger_invariant_check.py`
- `erpnext/manufacturing/doctype/{bom,work_order,job_card}/*.py`
- `erpnext/selling/doctype/sales_order/sales_order.py`
- `erpnext/buying/doctype/purchase_order/purchase_order.py`
- `erpnext/accounts/doctype/sales_invoice/sales_invoice.py`
- `erpnext/assets/doctype/asset/asset.py`
- `erpnext/projects/doctype/project/project.py`
- `erpnext/crm/doctype/opportunity/opportunity.py`
- `hrms/hr/doctype/leave_ledger_entry/leave_ledger_entry.py`
- Tests listed under Evidence.

Module trees listed via GitHub Contents API on the ERPNext SHA.

## 3. Evidence

See [`atlas.md`](atlas.md), [`invariants.md`](invariants.md), [`edge-cases.md`](edge-cases.md). Highest-signal facts:

- Document lifecycle is a three-state machine in the framework, not in each domain module.
- Official docs split commitment documents (Quotation, Sales Order, Purchase Order) from ledger documents (invoices, receipts, payments, stock entries).
- GL Entry and Stock Ledger Entry refuse individual cancel. Cancel the voucher.
- Cancel writes reversing ledger rows. Default mode also flags originals `is_cancelled = 1`. `Accounts Settings.enable_immutable_ledger` changes whether originals stay visible and whether the reversal takes today's posting date.
- Payment Ledger uses `delinked`. Leave Ledger often deletes on cancel. Three ledger families, three cancel encodings.
- Stock has an invariant-check report that recomputes `qty_after_transaction` and FIFO value and diffs them against stored SLE fields.
- Work Order cannot cancel while a submitted Stock Entry exists. Job Card cancel is blocked if manufacturing entries already value the finished good.
- Stock Reservation Entry is a submitted document with its own status machine. It cannot be amended. Tests block delivering reserved stock against a different Sales Order.
- Quality Inspection lives in Stock. Quality Management is a separate ISO-style module.
- Employee master still lives in `erpnext/setup`. Leave, attendance, and payroll live in HRMS.

## 4. Source artifacts

Do not promote these into OS primitives without independent convergence:

- DocType / child table / Controller class
- `docstatus` 0/1/2 and `is_submittable`
- `amended_from`, `ignore_linked_doctypes`, `update_after_submit`
- `status_updater` config blocks and `eval:` status maps
- `Bin` cached qty fields
- `Serial and Batch Bundle` as the v15+ identity container
- `Repost Item Valuation` / `Repost Accounting Ledger` jobs
- Module pack boundaries (Selling vs Stock vs Accounts vs HRMS)
- Naming series, Company as the tenant-like scope

## 5. Convergence

Not claimed as proven. These are the places ERPNext independently rhymes with distinctions already named in OS docs:

- Requested versus happened (commitment vs ledger documents). See `docs/constitution.md` §8 and official ledger docs.
- Plan versus execution (BOM / Work Order / Job Card). See `docs/open-questions.md` §14.
- Stock and accounting as ordered histories that cannot be silently rewritten. See scenario S-007 and S-010.
- Reservation as something with identity and lifecycle, not a boolean on a line. See `docs/open-questions.md` §12.
- Partial fulfillment as first-class qty, not a new order. See scenario S-002.

Independent confirmation is the job of [`cross-validation.md`](cross-validation.md).

## 6. Divergence

Inside this one corpus:

- GL/SLE cancel by flag + reverse. Payment Ledger cancel by `delinked`. Leave Ledger cancel by delete (except expiry).
- Default cancel hides both original and reverse via `is_cancelled`. Immutable-ledger mode keeps reverse rows active and re-dates them.
- Quality-as-gate (Stock) versus quality-as-management-system (Quality Management).
- Customer and Supplier are kinds. `Party Link` is the escape hatch when one organization is both.
- `update_after_submit` lets some submitted fields change. Submit is not a full freeze.

Cross-system divergence is not yet measured. Marked undetermined.

## 7. Candidate laws

See invariant cards. The smallest claims this corpus can defend as hypotheses:

1. A commitment is not a stock or accounting fact.
2. A ledger row is a consequence of a posted action. It is not itself an editable action.
3. Cancellation of a posted action adds compensating facts. It does not erase the original facts.
4. Quantity on hand is a projection over an ordered movement history.
5. Specification, authorization, and execution are different objects in manufacturing.
6. Reservation is a claim on identity-bearing stock, not possession.
7. Partial fulfillment mutates remaining open qty on the same commitment. It does not replace the commitment.

## 8. Counterexamples

See [`edge-cases.md`](edge-cases.md). Strongest attacks already present in ERPNext:

- Negative stock discards the FIFO queue (`test_negative_fifo_valuation`).
- `update_after_submit` and Close-without-Cancel.
- Direct invoices that skip the commitment document.
- Leave ledger deletion.
- Immutable-ledger re-dating of reversals (valid time of the reverse is "today", not the original posting date).
- Sales Invoice with Update Stock collapses delivery and billing into one action.

## 9. Runtime pressure

If the surviving claims hold, a runtime must:

- Distinguish commit of an action from assertion of facts the action produced.
- Refuse generic mutation of ledger facts.
- Record reversals as new facts with provenance to the cancelled action.
- Recompute projections after late or backdated facts (or refuse the backdate).
- Enforce reservation exclusivity for identity-bearing units.
- Keep specification versions distinct from execution instances.
- Represent unknown/in-progress external effects. ERPNext mostly does not. See gap `OQ-05` below.

## 10. Open questions

These stay undetermined. They are pointers into `docs/open-questions.md`, not answers.

| ID | OS question | What ERPNext shows | State |
| --- | --- | --- | --- |
| OQ-04 | What exactly is an Action? | Submit is the commit. Draft is editable intent. Preview is not a first-class bound proposal. | undetermined |
| OQ-05 | Action vs Event vs Effect | Document submit writes events in the same transaction. Timeout/unknown is not modeled. | undetermined |
| OQ-06 | What is mutable state? | `status`, `per_billed`, `qty_after_transaction`, and Bin qty are stored projections that can drift (hence invariant-check and repost). | undetermined |
| OQ-07 | Is bitemporality fundamental? | `posting_date`/`posting_time` versus `creation` exist. Immutable-ledger reversals re-date to today. Not a full valid/known model. | undetermined |
| OQ-12 | Relationship-entities | Reservation, Employment-like Employee history, Party Link, Asset Movement. Mixed. | undetermined |
| OQ-13 | Economic reality | Commitment vs ledger docs rhyme with REA. Documents still have legal identity. | undetermined |
| OQ-14 | Manufacturing reality | BOM / WO / Job Card / Stock Entry is a four-layer split. Universality unknown. | undetermined |

## 11. Decision state

The corpus as a whole is `hypothesis`. Individual cards carry their own state. RFC-0001 is untouched.

## Method and gaps

Read schema JSON, controllers, tests, official docs, and one historical PR. Did not run the test suite. Did not exhaust patches or issue history. Did not read every regional or fiscal path. HR and CRM coverage is thinner than Stock/Accounts/Manufacturing.

Timebox stopped further mining.

## Licensing note

OS is MIT. This note extracts behavior and concepts. Pasting or translating GPL controllers into OS would violate the clean-room rule in `research/README.md` and constitution §16.
