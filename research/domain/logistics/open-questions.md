# Open questions

**Kind:** each card is an open question  
**Decision:** `undetermined` unless noted  
**Rule:** no invented answers. Cite a card in this folder or leave the question open. Do not edit `docs/open-questions.md` or RFC-0001.

## L-Q-001 When do title and risk move relative to custody?

- **Kind:** open question
- **Decision:** undetermined
- **Why it is open:** L-E-008 and L-C-004 show the facts can split. They do not pick one instant. Incoterms (S-ICC-INCO) choose a contractual point. ERPNext and Odoo choose invoice and stock documents. CBV `consigning` mixes possession and ownership. ValueFlows refuses a single "ownership" word (S-VF-TR).
- **Standing order:** custody-versus-title stays undetermined until independent first-party sources agree on one moment. They do not.
- **Related:** L-S-015, L-S-016, L-S-026
- **Not an answer to `docs/open-questions.md` §13.** That agenda item stays open.

## L-Q-002 What kind of thing is in-transit?

- **Kind:** open question
- **Decision:** undetermined
- **Options seen:** disposition (GS1 `in_transit`), seller location (Odoo Output), status field (Moqui Shipped), skip (ERPNext and Odoo one-step book to customer), carrier resource (ValueFlows `toResourceInventoriedAs` on the bill of lading).
- **Evidence:** L-E-009, L-C-012, L-E-021
- **Owner:** logistics plus inventory #18. Do not pick a location model here.

## L-Q-003 Are warehouse steps and carrier legs one kind?

- **Kind:** open question
- **Decision:** undetermined for a shared type. The distinction itself is `supported` (L-C-003).
- **Why a type question remains:** both are "a quantity moved from origin to destination by an actor." A later synthesizer may want one Movement type with a facility-versus-carrier role. That is a metamodel question, not settled by this folder.
- **Related:** L-S-001, L-S-025, `docs/open-questions.md` §2 on Relator versus ordinary object.

## L-Q-004 Shipment versus delivery identity

- **Kind:** open question
- **Decision:** undetermined
- **Evidence:** L-E-010, L-C-010, matrix row "Warehouse exit ≠ carrier consignment"
- **Do not write a winner into RFC-0001.**

## L-Q-005 Is cross-dock a type, a route, or a missing putaway?

- **Kind:** open question
- **Decision:** undetermined
- **Evidence:** L-E-013, L-S-019. No first-party ERPNext, Odoo, or Moqui cross-dock page this session.

## L-Q-006 Failed-delivery object

- **Kind:** open question
- **Decision:** undetermined
- **Ask:** is a failed attempt an event on the existing leg, a new leg, or the start of return-to-sender?
- **Evidence:** L-S-002, L-S-005, L-S-021. Carrier exception dictionaries not fetched.

## L-Q-007 Packed-to-bill as a company policy

- **Kind:** open question
- **Decision:** undetermined as policy, `rejected` as a universal law (L-C-011)
- **Ask:** should billing-trigger be a policy over events, not a status meaning?
- **Related:** `docs/open-questions.md` §9 on Policy versus Function. No answer invented.

## L-Q-008 Tracking contradiction authority

- **Kind:** open question
- **Decision:** undetermined
- **Ask:** when carrier API, EPCIS, warehouse Done, and a customer photo disagree, what is accepted operational state?
- **Evidence:** L-S-027, L-S-030
- **This is `docs/open-questions.md` §3 applied to logistics.** Cite that agenda. Do not resolve it.

## L-Q-009 Customs and installation attachments

- **Kind:** open question
- **Decision:** undetermined
- **Ask:** are international invoice images and Installation Notes logistics evidence, fiscal objects, or service objects?
- **Evidence:** L-S-031, L-S-032
- **Likely owners:** #28 fiscal, #29 projects or services.

## L-Q-010 Over-delivery

- **Kind:** open question
- **Decision:** undetermined
- **Evidence:** L-S-010. Pages fetched describe short-close and over notation at accept, not a full over-delivery workflow.

## L-Q-011 Dropship custody path

- **Kind:** open question
- **Decision:** undetermined for inventory, logistics-only cut recorded
- **Evidence:** L-E-017, L-S-017
- **Leave stock ownership and valuation to #18.**

## L-Q-012 Proof-of-delivery legal form

- **Kind:** open question
- **Decision:** undetermined
- **Ask:** which evidence (signature, scan, photo, AWB, BOL) is sufficient for freight release versus for fulfillment?
- **Evidence:** L-E-011, CBV `accepting` text. No statute or carrier tariff fetched.

## Questions from `docs/open-questions.md` that this folder does not answer

| Agenda item | Touch | Outcome here |
| --- | --- | --- |
| §3 Truth when sources disagree | L-Q-008, L-S-030 | undetermined |
| §5 Action versus Event versus Effect | L-C-005, L-S-020 | distinction supported, Effect primitive not decided |
| §6 Mutable state | Lane A as projection | hypothesis, not a primitive |
| §7 Bitemporality | late POD, void_shipping | undetermined |
| §13 Economic reality / REA | VF transfers used as evidence | no REA subset chosen |
| §15 Ontology versus runtime | tracking integrations | Wave B, not this folder |

## Stop conditions for this issue

Wave A logistics is done enough for synthesis when a later agent can query this folder without the issue thread and can see which claims are `supported` versus `undetermined`. Remaining fetch gaps (carrier scan codes, UN/CEFACT DESADV text, first-party cross-dock) are listed in [sources.md](sources.md). They do not block landing these files.
