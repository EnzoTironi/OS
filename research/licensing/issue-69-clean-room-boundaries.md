# Clean-room evidence extraction and reusable-code boundaries

**Status:** Wave A research note for issue #69.  
**Decision:** mixed. Project process rules below are `supported` as OS policy. Several legal lines stay `undetermined` and need counsel.  
**Not legal advice.** This note records public license text, copyright statute, and project rules so later agents can cite them. It does not decide a court case.

This is process research. It does not answer `docs/open-questions.md` and it does not change RFC-0001.

## Question

OS is MIT. Important corpora are GPL, LGPL, AGPL, CC-BY-SA, Apache-2.0, CC0, mixed custom terms, or proprietary. How can research agents read those systems, extract domain meaning, and write MIT artifacts without turning conceptual learning into an accidental derivative of someone else's implementation?

The issue also asks for citation hygiene so a claim can be traced to an exact doc, file, commit, issue, or test.

## Sources

Fetched 2026-08-15. Locators are exact enough to re-open.

| ID | What | Locator |
| --- | --- | --- |
| S1 | OS MIT license | `LICENSE` in this repo, copyright 2026 Enzo Tironi |
| S2 | Constitution §16 research hygiene | `docs/constitution.md` |
| S3 | Research note template and clean-room posture | `research/README.md` |
| S4 | Issue #69 | https://github.com/EnzoTironi/OS/issues/69 |
| S5 | 17 U.S.C. §102(b) and House Report 94-1476 | https://uscode.house.gov/view.xhtml?req=(title:17+section:102(b)+edition:prelim) text in effect 2026-08-10 |
| S6 | GNU GPL FAQ, archive copy used after gnu.org 403 | https://web.archive.org/web/20161229211715/https://www.gnu.org/licenses/gpl-faq.html sections `#GPLFairUse`, `#CanIUseGPLToolsForNF`, `#MereAggregation`, `#GPLInProprietarySystem`, `#GPLStaticVsDynamic` |
| S7 | ERPNext GPL-3.0 code license | https://github.com/frappe/erpnext `license.txt` on `develop` at `1212a278c6a5fcad4bd67d27ec15c6af9d3e94b4` |
| S8 | ERPNext docs CC-BY-SA-3.0 and trademark policy | https://frappe.io/erpnext/license-trademark fetched 2026-08-15 |
| S9 | Frappe Framework MIT | https://github.com/frappe/frappe `LICENSE` on `develop` at `d9dc348ae8c196487871fcd856e75fc27f68c9b9` |
| S10 | Odoo Community LGPLv3 | https://github.com/odoo/odoo `LICENSE` on `19.0` at `fecc29dd806ccba558d5e3155323a4cac5466853` |
| S11 | Odoo Enterprise and Apps proprietary licenses | https://www.odoo.com/documentation/19.0/legal/licenses.html fetched 2026-08-15 |
| S12 | Moqui CC0 1.0 plus Apache-style patent grant | https://github.com/moqui/moqui-framework `LICENSE.md` on `master` at `2f1de53ee33055b17e71f83629305610da8a7250` |
| S13 | ObjectStack Apache-2.0, ObjectOS commercial | https://github.com/objectstack-ai/objectstack `LICENSE` and `LICENSING.md` on `main` at `716ac9bf8f7419d134d7d90f2ecfc460b84bb2b5` |
| S14 | OpenBKN mixed Apache-2.0 and custom OpenBKN License | https://github.com/openbkn-ai/bkn-foundry `LICENSE`, `LICENSE-APACHE.txt`, `LICENSE-OPENBKN.txt` |
| S15 | ValueFlows CC-BY-SA-4.0 | https://github.com/valueflows/valueflows at `4a28edf1e8069154ecf2b1399e0f7ffcdf4f4ed4` |
| S16 | Apache OFBiz Apache-2.0 | https://github.com/apache/ofbiz-framework `trunk` at `b9dfe95aa10b2857110d6d7c0db2a689d0d1fb65` |
| S17 | W3C Document License 2023 | https://www.w3.org/copyright/document-license-2023/ |
| S18 | W3C PROV-O Recommendation | https://www.w3.org/TR/2013/REC-prov-o-20130430/ |
| S19 | Agent output contract | `docs/swarm-research-backlog.md` section "Agent output contract". `docs/swarm-result-contract.md` is not on this branch. PR 84 is open and was not waited on. |

License facts for the register live in `corpus-license-register.md`. The field list lives in `source-attribution-schema.md`.

## Evidence

Each block names its class.

### Domain evidence

**E1. Copyright does not cover the domain distinction itself.**  
Class: domain-evidence.  
S5 §102(b) says copyright does not extend to "any idea, procedure, process, system, method of operation, concept, principle, or discovery, regardless of the form in which it is described, explained, illustrated, or embodied." House Report 94-1476, quoted on the same page, says the programmer's expression is the copyrightable element and "the actual processes or methods embodied in the program are not within the scope of the copyright law."

That is why a research note may record that ERPNext separates Work Order from Job Card, or that Odoo Community distinguishes manufacturing order from work order, without taking their Python.

**E2. A license is a grant on a copyrighted work, not a ban on reading.**  
Class: domain-evidence.  
S6 `#CanIUseGPLToolsForNF` says using a GPL editor or compiler does not restrict the license of code you write. S6 `#GPLFairUse` says fair-use rights exist in GPL source and do not need the licensor's extra permission. Fair use is not worldwide. The FAQ says so.

GPL, LGPL, and AGPL conditions attach when you copy, modify, or convey the covered work, and, on the FSF reading, when you combine it with other code. They do not attach to the act of opening a file.

**E3. Same vendor, different grants.**  
Class: domain-evidence.  
S9 Frappe Framework on `develop` is MIT. S7 ERPNext on `develop` is GPL-3.0. S8 ERPNext documentation is CC-BY-SA-3.0. S10 Odoo Community 19.0 is LGPLv3. S11 Odoo Enterprise 19 is the Odoo Enterprise Edition License v1.0 and forbids publishing or selling copies. Treating "Frappe" or "Odoo" as one license is false.

### Source artifacts

**A1. Copyleft code grant.**  
Class: source-artifact.  
S7 is the GNU GPL v3 text shipped as ERPNext `license.txt`. Conveying a modified version requires corresponding source and the same license. S6 `#GPLInProprietarySystem` says you cannot incorporate GPL-covered software into a proprietary system. OS is MIT, not proprietary, but MIT is not GPL. Combining GPL code into the MIT tree without relicensing the combination is the failure mode S6 describes.

**A2. Weaker copyleft for libraries.**  
Class: source-artifact.  
S10 states Odoo is published under LGPLv3. S6 `#LGPLStaticVsDynamic` allows an application to link an LGPL library if you meet relink and source-conveyance conditions. Copying LGPL function bodies into MIT files is not linking. It is making a modified version of the library.

**A3. Documentation share-alike.**  
Class: source-artifact.  
S8 licenses ERPNext documentation as CC-BY-SA-3.0. S15 licenses ValueFlows as CC-BY-SA-4.0. Copying those texts into `docs/` or `research/` can create a share-alike adaptation. A paraphrase of a concept with a locator is a different act from pasting a manual chapter.

**A4. Permissive code that still has conditions.**  
Class: source-artifact.  
S13 ObjectStack `LICENSE` is Apache-2.0. `LICENSING.md` says ObjectOS Cloud and Enterprise are separate commercial products. S16 OFBiz is Apache-2.0. Apache-2.0 allows use in MIT software if you keep copyright notices, include the LICENSE, and preserve NOTICE attributions. That is reuse, not a free pass to skip a decision.

**A5. Dedication plus patent grant.**  
Class: source-artifact.  
S12 Moqui `LICENSE.md` opens with CC0 1.0 because CC0 lacks a patent license, then adds a Grant of Patent License adapted from Apache-2.0. Copyright friction is low. Patent and NOTICE hygiene still exist.

**A6. File-level mixed custom terms.**  
Class: source-artifact.  
S14 BKN Foundry `LICENSE` splits upstream `kweaver-ai/kweaver-core` files as Apache-2.0 and OpenBKN net-new files as the OpenBKN License. `LICENSE-OPENBKN.txt` adds commercial-entitlement, no-circumvention, and restricted-hosted-service conditions, and says those conditions control over Apache-2.0 on conflict. A repo-level SPDX of "Other" is not enough. The file header is the grant.

**A7. Standards documents.**  
Class: source-artifact.  
S17 lets you copy W3C documents if you keep the URL, copyright notice, and status. It does not grant a general right to publish a modified technical specification. Code examples marked as code are under the W3C Software License. S18 PROV-O is a W3C Recommendation dated 2013-04-30. Vocabulary reuse for interoperability is in scope for later provenance research. Wholesale restatement of the spec as an OS spec is not granted by S17.

**A8. Trademarks.**  
Class: source-artifact.  
S8 says the ERPNext name and logo are trademarks of Frappe Technologies Pvt. Ltd. Permission is required to use the name as part of a project, product, service, domain, or company name. Referring to ERPNext as a corpus is the allowed pattern on that page. Naming an OS surface "ERPNext Consulting" is not.

**A9. Open Foundry name collision.**  
Class: source-artifact.  
`research/reference-landscape.md` discusses "Open Foundry" as a Palantir-like ontology project. A GitHub search on 2026-08-15 returned several unrelated repos under that name, with Apache-2.0, AGPL-shaped, MIT, and empty license metadata. That document's object of study is not identified to one URL in this pass. License for "Open Foundry" is `undetermined` until a corpus issue pins the repo.

### Candidate laws

These are process laws for OS research. They are not metamodel primitives.

**L1. Extract the distinction, not the writing.**  
Class: candidate-law.  
Decision: `supported` as OS policy. Legal idea/expression line in a given snippet is `undetermined`.  
A note may record a real-world distinction, an invariant, a failure mode, a test scenario, and a public locator. It may not paste or translate implementation into the MIT tree. S2, S3, S4, S5.

**L2. Reading is in bounds. Combining is a decision.**  
Class: candidate-law.  
Decision: `supported` for the license-trigger reading in S6.  
Agents may read GPL, LGPL, and AGPL corpora. Shipping those files, linking them, subclassing their classes, or translating their bodies into OS requires an explicit architectural and license decision recorded in the note and in a review. S6 `#GPLInProprietarySystem`, `#MereAggregation`, and the subclassing FAQ entry.

**L3. Translation is still expression.**  
Class: candidate-law.  
Decision: `hypothesis`.  
Rewriting a GPL stock-valuation routine from Python into TypeScript is not a clean-room extraction. It is a modified version of the writing. S5 House Report plus ordinary derivative-work doctrine. Counsel should confirm. Do not treat this as settled law.

**L4. Every claim carries a locator and a license.**  
Class: candidate-law.  
Decision: `supported` as OS policy.  
A research sentence that cannot point at a repo, path, commit, standard URI, issue, or test is not evidence. The provenance block in `source-attribution-schema.md` is the required shape.

**L5. Implementation reuse is never implicit.**  
Class: candidate-law.  
Decision: `supported` as OS policy, including for MIT and Apache-2.0 sources.  
S2 already says implementation must not be copied into the MIT core without review. Issue #69 repeats that for any implementation reuse. Permissive licenses make reuse *possible*. They do not make it the default.

**L6. Split the archaeologist from the implementer.**  
Class: candidate-law.  
Decision: `hypothesis`.  
Classic clean-room uses two people. One reads the corpus and writes a spec. The other implements from the spec and never sees the corpus. A single agent that reads ERPNext and then writes OS runtime code collapses that split. Until counsel says otherwise, implementation agents consume `research/` notes, not clone trees of copyleft or proprietary code.

**L7. Docs and code can have different grants.**  
Class: candidate-law.  
Decision: `supported` from S7, S8, S9, S10, S11, S14.  
Record license per artifact, not per brand.

### Counterexamples

**C1. Shared names are not theft.**  
Class: counterexample to a sloppy reading of L1.  
"Work Order", "Bill of Materials", and "Journal Entry" appear across independent systems and ordinary English. Their presence in a note is not evidence of copying S7. A 200-line valuation function with the same local variable names and the same comment structure is.

**C2. A short quoted test is not a port.**  
Class: counterexample to a sloppy reading of L1.  
S6 `#GPLFairUse` keeps fair use. A two-line quote of an assertion, with locator, can be evidence of an invariant. Pasting the module that implements the assertion is a port. Prefer paraphrase. If you quote, keep it short and attributed.

**C3. Side-by-side is not a combination.**  
Class: counterexample to "any contact with GPL contaminates MIT".  
S6 `#MereAggregation` allows distributing separate programs together. Pipes, sockets, and command-line arguments are the FSF's usual arms-length examples. A later OS experiment that shells out to an unmodified GPL program is a different decision from vendoring that program's source. The intimacy test is fact-specific. Decision on any real link remains `undetermined` until designed.

**C4. LGPL link is not a GPL transplant.**  
Class: counterexample to treating all copyleft as identical.  
S10 plus S6 `#LGPLStaticVsDynamic`. Linking Odoo Community as a library, if anyone ever proposed it, is a license decision. Copying `stock.move` internals into OS is a different and worse act.

**C5. Permissive corpus, still a decision.**  
Class: counterexample to "Apache means paste it".  
S13 and S16 allow code reuse with attribution. S2 and S4 still require an explicit reuse decision. Semantic fit can reject a permissive library. License fit is necessary, not sufficient.

**C6. Custom additional conditions beat a green SPDX badge.**  
Class: counterexample to "GitHub license key is enough".  
S14 OpenBKN License forbids circumvention of commercial entitlements and restricted hosted services. S11 forbids distributing Odoo Enterprise. GitHub reports Odoo as `NOASSERTION` and OpenBKN Foundry as `Other`. Read the file.

### Runtime consequences

**R1. Two-role pipeline.**  
Class: runtime-consequence of L6.  
Corpus issues #32–#38 write notes. Domain and foundation issues consume notes. An implementation spike that needs a copyleft clone does that in a throwaway worktree that is never committed here.

**R2. Provenance is a required field, not a footer.**  
Class: runtime-consequence of L4.  
Notes use the schema in `source-attribution-schema.md`. After PR 84 lands, also emit the swarm index shard. This branch does not wait for that file.

**R3. Review fails unexplained source-shaped code.**  
Class: runtime-consequence of L1 and L5.  
The checklist in `docs/research-review-checklist.md` is the gate. A PR that adds Python translated into TypeScript without a reuse decision is out of bounds even if tests pass.

**R4. If OS later vendors copyleft, isolate or relicense.**  
Class: runtime-consequence of L2.  
S6 says a combined program must satisfy GPL. MIT-only distribution of that combination would not. Options then are an arms-length process boundary, a license change of the combination, or do not vendor. None of those is chosen here. Decision: `undetermined`.

**R5. Hosted AGPL is a different trigger.**  
Class: runtime-consequence.  
S11 notes Odoo 8 was AGPLv3. Some "Open Foundry" candidates advertise AGPL. AGPL's network clause is about users of a modified program over a network. OS is not hosting those programs today. The moment someone proposes embedding AGPL code in a hosted OS, stop and get counsel. Decision: `undetermined`.

## Convergence

Independent sources agree on the split this issue needs.

- S5 and S6 both treat ideas and methods as outside the copyright grant, and expression plus combination as inside it.
- S2, S3, S4, and the README license paragraph already state the OS default. This note only makes the default checkable.
- S7, S10, S8, and S15 show that operational ERP knowledge is often under copyleft or share-alike, so a research-only posture is not optional.
- S9 versus S7, and S10 versus S11, independently show that brand-level license claims fail.

## Divergence

- FSF FAQ S6 is the licensor's reading of combination and linking. Courts sometimes draw the line differently. Treat S6 as a conservative process bound, not as a judgment.
- Fair use exists in the US FAQ answer and is denied as a worldwide principle in the same answer.
- Moqui S12 is more permissive than ERPNext S7. That does not make Moqui implementation the default foundation. `docs/open-questions.md` question 21 stays open.
- OpenBKN S14 and ObjectStack S13 put commercial products next to open modules. Corpus agents must name the module.
- "Open Foundry" is not one license. See A9.

## Open questions

These need counsel or a later pinned corpus. They are not answers to `docs/open-questions.md`.

1. Does an AI agent that read GPL or LGPL source and later wrote similar MIT code create a derivative work? `undetermined`
2. How much quoted source is fair use in a research note, in the US and in Brazil? `undetermined`
3. Are JSON schemas, DocType field lists, and XML entity definitions protectable expression, unprotectable systems, or mixed? `undetermined`
4. What is the OS rule if a later experiment vendors LGPL or AGPL code? `undetermined`
5. Which GitHub repo is the Open Foundry discussed in `research/reference-landscape.md`? `undetermined`
6. Palantir public documentation terms of use were not fetched in this pass. Treat Palantir as proprietary until a corpus note cites the terms. `undetermined`
7. EU database rights over ERP dumps and fixtures were not researched. `undetermined`

## Decision state

| Claim | State |
| --- | --- |
| OS research default is concepts, behavior, invariants, scenarios, locators. No implementation transplant. | `supported` as policy |
| Copyright statute excludes ideas, processes, and methods of operation from protection. | `supported` for US subject matter via S5 |
| GPL, LGPL, and AGPL conditions trigger on copy, modify, convey, and FSF-combination, not on reading. | `supported` from S6 and license texts |
| Cross-language translation of a routine is a derivative of expression. | `hypothesis` |
| Archaeologist and implementer should be split for copyleft and proprietary corpora. | `hypothesis` |
| Implementation reuse of MIT or Apache-2.0 still needs an explicit OS decision. | `supported` as policy |
| Any specific link, vendor, or hosted-service design is approved. | `undetermined` |
| RFC-0001 primitives. | untouched |

## Related files

- `research/licensing/corpus-license-register.md`
- `research/licensing/source-attribution-schema.md`
- `research/licensing/examples/work-order-distinction.provenance.json`
- `docs/clean-room-research.md`
- `docs/research-review-checklist.md`
