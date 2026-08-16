# Open questions

**Kind:** open questions  
**Decision:** undetermined unless a card says otherwise  
**Retrieved:** 2026-08-16

This file records unresolved semantic uncertainty. It does not answer `docs/open-questions.md`. When a constitution question is touched, the note cites a research card and leaves the constitution item open.

## OQ-001. Fiscal document versus commercial invoice as OS types

- Kind: open question
- Decision: undetermined
- Question: Given that Brazilian law distinguishes documento fiscal eletrônico from fatura and duplicata, should OS have two types, one type with roles, or a generic documentary interface implemented by both?
- Why it stays open: Independent official sources agree the legal instruments differ. See E-010, CL-004, S-FISC-009. They do not say how a generic executable ontology should factor that difference. A standing order keeps this fork open until that extra agreement exists.
- Would close it: a cross-domain pattern, outside Brazil, that forces one of the three shapes, plus a counterexample that kills the other two.
- Related constitution items: 13, commercial documents versus economic events. Not answered.

## OQ-002. Authorized XML as evidence, event, fact, or all three

- Kind: open question
- Decision: undetermined
- Question: Is the authorized NF-e a Fact about a supply, an Event of authorization, a piece of Evidence attached to another fact, or a constitutive declaration that is all of those?
- Why it stays open: LC 214 art. 60, § 1º, makes the document a confession of tax. Ajuste SINIEF 07/05 makes authorization the source of legal validity. Those are compatible with several RFC-0001 readings. This folder does not pick Event versus Fact.
- Related cards: E-015, CL-005, CL-006
- Related constitution items: 5, 8. Not answered.

## OQ-003. Accounting linkage

- Kind: open question
- Decision: undetermined
- Question: What fact, if any, should create an accounting journal from a fiscal document, and what fact should create a fiscal credit from an accounting event?
- Why it stays open: ECD and EFD are different official deliveries. LC 214 arts. 47 to 57 define credit without speaking of journal entries. No sibling accounting note existed on `origin/main` to cite. Inventing the link would violate standing order 8.
- Related cards: E-014, E-016, CL-011, S-FISC-021
- Related constitution items: 13. Not answered.

## OQ-004. Filing as projection versus separate ledger

- Kind: open question
- Decision: undetermined
- Question: Are SPED and IBS or CBS apuração projections over shared operational facts, or first-class ledgers that can diverge?
- Why it stays open: Official sources prove distinct accessory obligations and scoped document sets. See E-016, CL-012, S-FISC-020. They do not use the OS word "projection". Assisted apuração can constitute a tax credit by silence. That looks constitutive, not merely derived. Independent official sources do not agree on an OS projection reading, so the fork stays undetermined.
- Related constitution items: 6, 14. Not answered.

## OQ-005. Tax determination as Function, Policy, or both

- Kind: open question
- Decision: undetermined
- Question: Is ordinary Brazilian determination a Function of facts and dated rules, a Policy over principals, or a pair?
- Why it stays open: Amounts look deterministic once facts and the valid rule revision are known. Credenciamento, regime option, and credit bans look like authority. Constitution question 9 already asks whether Constraint and Policy collapse into Function. This folder adds Brazil pressure and does not answer.
- Related cards: CL-009, E-019
- Related constitution items: 9, 10. Not answered.

## OQ-006. Establishment as a generic place or a Brazil tax site

- Kind: open question
- Decision: undetermined
- Question: Is the ICMS establishment, with its own inscription and NF-e series, a generic organizational site, a Brazil extension, or a relator between a legal entity and a jurisdiction?
- Why it stays open: Numbering and same-taxpayer transfers need a site concept. Whether that concept is Brazil-shaped is not settled. Party and organization research was not on `origin/main`.
- Related cards: E-004, S-FISC-003
- Related constitution items: 12, 16. Not answered.

## OQ-007. How Brazil packs compose without contaminating the engine

- Kind: open question
- Decision: undetermined
- Question: Constitution question 16 already asks how Brazil-specific fiscal concepts compose without contaminating unrelated domains. This research supports keeping classifiers as extensions. It does not choose modules, packs, or another composition device.
- Why it stays open: Packaging is not ontology. Standing order 7 blocks Wave B toolchain design.
- Related cards: CL-010, matrix rejected promotions
- Related constitution items: 16. Not answered.

## OQ-008. Live manifestation window

- Kind: open question
- Decision: undetermined
- Question: Is the recipient manifestation window 90 days or 180 days from authorization in the clause now in force?
- Why it stays open: The compiled Ajuste SINIEF 07/05 text fetched on 2026-08-16 contains successive redactions of cláusula décima quinta-C showing both numbers. The NF-e portal home page timed out, so the current MOC package was not confirmed.
- Related cards: E-007
- This is a factual legal-currentness gap, not an OS primitive question.

## OQ-009. SPEDIR and Odoo file-level archaeology

- Kind: open question
- Decision: undetermined
- Question: What invariants do a named SPEDIR corpus and OCA `l10n_br_*` modules actually enforce?
- Why it stays open: SPEDIR was not independently located as a public first-party tree this session. Odoo Brazil was not cloned. ERPNext community mapping was read only at README level. Those cells stay source-system artifacts with incomplete cites.
- Related cards: E-018, A-SPEDIR, A-ODOO-BR

## OQ-010. Lei Kandir ICMS circulation details

- Kind: open question
- Decision: undetermined
- Question: Which ICMS circulation distinctions in Lei Complementar nº 87/1996 still matter after EC 132, and which are transition-only?
- Why it stays open: S-LC87 was not fetched in full. CONFAZ adjustments were enough for document families. They are not enough for a complete ICMS operation ontology.

## Constitution items touched, not answered

| Constitution item | Touch | Research cite |
| --- | --- | --- |
| 3, disagreeing sources | Recipient manifestation versus emitter XML | E-007, S-FISC-010 |
| 5, Action versus Event versus Effect | Authorization timeout and contingency | E-020, S-FISC-002 |
| 6, mutable state versus projection | Filings and apuração | OQ-004 |
| 7, bitemporality | Emission, authorization, supply, payment, vigência | E-003, E-019 |
| 8, provenance | Authorized XML as confession and evidence | E-015, OQ-002 |
| 9, Function, Constraint, Policy | Determination versus credenciamento | OQ-005 |
| 13, economic reality versus documents | Fatura, NF-e, MDF-e | OQ-001, CL-014 |
| 16, Brazil composition | Classifiers as extensions | OQ-007 |

No answer was invented for those items.

## New issue?

No new GitHub issue is warranted. The questions above refine issue 30 and existing constitution items. They are not a new semantic family.
