# Temporal semantics. Issue 5

**Track:** foundation  
**Issue:** https://github.com/EnzoTironi/OS/issues/5  
**Parent:** https://github.com/EnzoTironi/OS/issues/2  
**Open question:** `docs/open-questions.md` Q7  
**Decision state:** `undetermined`  
**Retrieved:** 2026-08-15  
**Contract used:** `docs/swarm-research-backlog.md` Agent output contract. `docs/swarm-result-contract.md` was not in the tree.

This folder is Wave A evidence for issue 5. It does not settle Q7. It does not edit RFC-0001.

## Files

- `wave-a-issue-5.md` is the single-page contract. Start there.
- `sources.md` is the source-by-source evidence cards.
- `candidate-laws.md` is the smallest claims that still fit the evidence.
- `counterexamples.md` is the domain attacks from inventory, pricing, accounting, employment, contracts, and manufacturing.

## Standing

MIT clean-room. Public docs, standards, and issue text only. No GPL or LGPL source was copied. ERPNext and Odoo behavior is taken from current public manuals plus cited GitHub issue and commit messages, not from a local clone of their trees.

Sibling work that this folder must not absorb:

- Issue 4 owns facts, authority, and contradiction. See `research/foundation/facts/` on `cursor/issue-4-foundation-cfd8` if that branch has landed.
- Issue 59 is the kill test that asks where Fact and bitemporal semantics are unnecessary or harmful. This folder feeds that test. It does not close it.
- Issue 7 owns Action versus Event versus Effect. Temporal stamps attach to those records. They do not replace them.

Wave B runtime storage and Wave C synthesis stay parked.
