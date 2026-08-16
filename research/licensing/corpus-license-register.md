# Corpus license register

**Status:** reference snapshot, fetched 2026-08-15.  
**Decision:** none. Facts only.  
**Not legal advice.**

Use this table when filling a provenance block. Re-fetch the license file before a reuse decision. GitHub's `license.spdx_id` is a hint. The file is the grant.

## Register

| Corpus | Repo | Ref / SHA | Declared grant | SPDX hint | OS default extraction | Reuse class |
| --- | --- | --- | --- | --- | --- | --- |
| OS | this repo | `LICENSE` | MIT | MIT | n/a | n/a |
| ERPNext code | [frappe/erpnext](https://github.com/frappe/erpnext) | `develop` `1212a278c6a5fcad4bd67d27ec15c6af9d3e94b4` | GNU GPL v3 in `license.txt` | GPL-3.0 | concept, behavior, invariant, scenario | copyleft-link-needs-decision |
| ERPNext docs | [frappe.io license page](https://frappe.io/erpnext/license-trademark) | page fetched 2026-08-15 | CC-BY-SA-3.0. ERPNext name and logo are trademarks | n/a | paraphrase with locator | share-alike-text-needs-decision |
| Frappe Framework | [frappe/frappe](https://github.com/frappe/frappe) | `develop` `d9dc348ae8c196487871fcd856e75fc27f68c9b9` | MIT in `LICENSE` | MIT | concept, behavior | permissive-reuse-needs-decision |
| Odoo Community 19 | [odoo/odoo](https://github.com/odoo/odoo) | `19.0` `fecc29dd806ccba558d5e3155323a4cac5466853` | LGPLv3 in `LICENSE` | NOASSERTION | concept, behavior, invariant, scenario | copyleft-link-needs-decision |
| Odoo Enterprise 19 | [odoo.com licenses](https://www.odoo.com/documentation/19.0/legal/licenses.html) | page fetched 2026-08-15 | Odoo Enterprise Edition License v1.0. Execution needs a valid subscription. Distribution of copies is forbidden | n/a | do not clone or mine unless counsel and a subscription say otherwise | forbidden-without-counsel |
| Odoo Apps by Odoo SA | same page | page fetched 2026-08-15 | Odoo Proprietary License v1.0 unless stated otherwise | n/a | same as Enterprise | forbidden-without-counsel |
| Odoo 8 historical | same page | page fetched 2026-08-15 | AGPLv3 | n/a | concept only if a note must cite history | copyleft-link-needs-decision |
| Moqui Framework | [moqui/moqui-framework](https://github.com/moqui/moqui-framework) | `master` `2f1de53ee33055b17e71f83629305610da8a7250` | CC0 1.0 plus Apache-style patent grant in `LICENSE.md` | NOASSERTION | concept, behavior | permissive-reuse-needs-decision |
| ObjectStack | [objectstack-ai/objectstack](https://github.com/objectstack-ai/objectstack) | `main` `716ac9bf8f7419d134d7d90f2ecfc460b84bb2b5` | Apache-2.0. `LICENSING.md` excludes ObjectOS commercial products | Apache-2.0 | concept, behavior | permissive-reuse-needs-decision |
| ObjectOS | [LICENSING.md](https://github.com/objectstack-ai/objectstack/blob/main/LICENSING.md) | same commit | commercial, not this repo | n/a | public docs only, if terms allow | cite-only until terms cited |
| OpenBKN Foundry | [openbkn-ai/bkn-foundry](https://github.com/openbkn-ai/bkn-foundry) | `LICENSE` fetched 2026-08-15 | Per file. Upstream kweaver files Apache-2.0. OpenBKN net-new files use OpenBKN License with extra commercial and hosting conditions | Other | concept, behavior. Read the file header | custom-additional-terms |
| OpenBKN samples | [openbkn-ai/bkn-samples](https://github.com/openbkn-ai/bkn-samples) | GitHub API 2026-08-15 | MIT | MIT | concept | permissive-reuse-needs-decision |
| OpenBKN engineering | [openbkn-ai/bkn-engineering](https://github.com/openbkn-ai/bkn-engineering) | GitHub API 2026-08-15 | Apache-2.0 | Apache-2.0 | concept | permissive-reuse-needs-decision |
| ValueFlows | [valueflows/valueflows](https://github.com/valueflows/valueflows) | `master` `4a28edf1e8069154ecf2b1399e0f7ffcdf4f4ed4` | CC-BY-SA-4.0 | CC-BY-SA-4.0 | paraphrase concepts | share-alike-text-needs-decision |
| Apache OFBiz | [apache/ofbiz-framework](https://github.com/apache/ofbiz-framework) | `trunk` `b9dfe95aa10b2857110d6d7c0db2a689d0d1fb65` | Apache-2.0 | Apache-2.0 | concept, behavior | permissive-reuse-needs-decision |
| W3C PROV-O | [TR/prov-o](https://www.w3.org/TR/2013/REC-prov-o-20130430/) | REC 2013-04-30 | W3C Document License 2023 for the spec text. Marked code examples use the W3C Software License | n/a | cite vocabulary, keep URL and notice if quoting | standards-document |
| Palantir Ontology | public product docs | not fetched this pass | proprietary product. Terms of use not cited here | n/a | concepts from public docs only after a later note cites terms | cite-only |
| Open Foundry | several GitHub names | search 2026-08-15 | conflicting Apache-2.0, AGPL-shaped, MIT, and empty metadata | mixed | do not extract until a corpus issue pins one repo | undetermined |

## Reuse classes

| Class | Meaning |
| --- | --- |
| cite-only | Point at the source. Do not copy text or code. |
| concept-ok | Implied by every row that allows extraction. Not a license to copy. |
| permissive-reuse-needs-decision | License may allow code reuse with attribution. OS still requires an explicit decision. |
| copyleft-link-needs-decision | Reading is allowed. Linking, vendoring, or translating code needs a recorded decision. Default is no. |
| share-alike-text-needs-decision | Copying documentation or spec prose can force share-alike on the adaptation. Paraphrase. |
| custom-additional-terms | File header and additional conditions control. Do not infer from the repo badge. |
| standards-document | Quote with the required notice. Do not republish a modified spec as an OS specification. |
| forbidden-without-counsel | Do not clone, paste, or translate. |
| undetermined | Identity or grant not pinned. Stop. |

## What this register does not do

It does not approve any library as an OS dependency.

It does not answer whether OS should build from scratch. That is `docs/open-questions.md` question 21.

It does not replace a file-level header on a mixed-license repo.
