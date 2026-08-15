# Adversarial cases. Provenance

**Decision state:** `hypothesis`  
**Targets:** laws in `wave-a-issue-6.md` and roles in `vocabulary.md`  
**Observed result:** not run. These are paper attacks.  
**Related seed:** `scenarios/README.md` S-003 stale approval.

Each case names the kind of record it produces if it lands. Domain evidence, source-system artifact, candidate law, counterexample, runtime consequence.

## X-001 Stale sources

**Targets:** L-001, L-006, L-002  
**Kind:** counterexample

**Setup.** Warehouse A posts a count of 20 at 09:00. Knowledge time 09:00. At 09:40 a correction event sets on-hand to 5. `corrects` points at the 09:00 event. Knowledge time 09:40. At 10:01 an agent proposes `Purchase(1000)` because it still read the 09:00 artifact. A human approves at 10:07. S-003 in `scenarios/README.md` is the same shape with a receipt instead of a correction.

**Falsifying result.** The DecisionRecord cannot name which SourceArtifact was consumed, or it names the 09:00 count without the 09:40 correction, and the system still calls the explanation complete.

**What the sources already do.**

- ValueFlows stores `created` so late entry is visible. Accounting page, retrieved 2026-08-15.
- ERPNext closed periods and freeze dates can block the late correction itself. Immutable ledger page, 2026-08-14.
- Palantir Data Lineage colors out-of-date tables. That is pipeline staleness, not Action-assumption staleness.
- Ontologiq session note. Recheck after approval. Not re-fetched in this pass.

**Consequence if the case holds.** A belief graph that only stores "source system = WMS" fails. Consumption must pin the artifact version. Approval must bind assumptions or re-read. Q4 Action stages stay open. This case does not close them.

**Runtime consequence.** Pin evidence identities on the DecisionRecord. Re-validate or fail closed when a consumed artifact has a newer correction.

## X-002 Derived forecasts

**Targets:** L-003, L-004  
**Kind:** counterexample

**Setup.** Function `ForecastDemand` revision 12 reads twelve accepted issue events and emits `demand_next_week = 980` with confidence 0.81. An agent treats 980 as if it were on-hand deficit and proposes a purchase. Policy for `Purchase` allows the Action because 0.81 is "high".

**Falsifying result.** The derived value has no Function revision and no input list, or confidence is accepted as authority, and a later audit cannot separate forecast from observation.

**What the sources already do.**

- ValueFlows. Economic Events are past only. Flows page, retrieved 2026-08-15. A forecast is Intent or Commitment material, not an Event.
- OpenLineage. The job, run, inputs, outputs, and often SQL or source hash are first-class. Quality facets do not authorize a write.
- DataHub. `transformation_text` can sit on the edge. It still does not pay a supplier.
- PROV-DM abstract. Provenance supports later trust assessment. It does not elect the purchase.

**Consequence if the case holds.** Derived Facts must carry Function identity and a speech-act or layer tag. Forecast, observation, and accepted operational quantity are different artifacts even when the number matches.

**Runtime consequence.** Refuse to let a Confidence value inhabit a Policy allow signature unless a named rule declares that use. Brand the types.

## X-003 Agent reasoning

**Targets:** L-002, L-004, Q10  
**Kind:** counterexample

**Setup.** A software agent writes a long chain of thought. "Inventory looks low, last summer we stocked out, buy 1000." It then calls `Purchase`. The runtime stores the prose as the derivation of `demand_next_week`. No Function revision. No input artifacts. The DecisionRecord cites the prose as evidence.

**Falsifying result.** The belief graph treats free text as a reproducible Function, and a later replay cannot reproduce the number. Or the permission graph is considered satisfied because a human later clicked Approve on the prose, with no bound parameters or ontology revision.

**What the sources already do.**

- RFC-0001 Function section, read only. Asks whether agent reasoning can appear as a typed function with explicit uncertainty and provenance. Unanswered.
- Open questions Q10. Same uncertainty. Unanswered.
- Palantir. Function-backed Actions apply edits only through an Action. The authoring helper does not mutate. `@Edits` must declare the write-set for permissions.
- OpenLineage. A job can store `sourceCode` and `sourceCodeLocation`. That is pinned code, not a chat transcript.

**Consequence if the case holds.** Agent prose may be an Evidence artifact of type proposal-rationale. It must not pretend to be a deterministic Function derivation. Q10 stays `undetermined`. This case is why it cannot be closed from style.

**Runtime consequence.** If an agent may propose, the DecisionRecord stores the proposal text as evidence and still pins Action, policy, and ontology revisions. Commit remains a different activity.

## X-004 Manual overrides

**Targets:** L-001, L-005, L-006  
**Kind:** counterexample

**Setup.** Pipeline-backed quantity is 5. A planner overrides the object property to 20 so a dashboard turns green. Default Palantir strategy. User edits win, including after the source row disappears and returns. How-edits-applied page, retrieved 2026-08-15. No action log enabled. Edit history disabled.

**Falsifying result.** The visible 20 cannot name the defeated source artifact, the actor, or the activity. A later Action `IssueStock(12)` is allowed on the override. After the source row returns, the 20 still wins, and no graph shows the fight.

**What the sources already do.**

- Palantir. User-edit-wins is an election in the index. Action log is optional. Edit history is optional and starts only after enablement.
- ERPNext. A stock reconciliation posts a new counted quantity as of a posting date. It does not silently paint the ledger. Cited from issue 4's ERPNext stock-reconciliation doc and from the immutable-ledger correction table.
- ValueFlows. Override of an event is another event.

**Consequence if the case holds.** A manual override is an Activity that generates a new SourceArtifact and a Derivation of type override. The defeated artifact stays. If the override is allowed to drive `IssueStock`, the DecisionRecord must cite the override, not the pipeline row.

**Runtime consequence.** Do not hide defeated evidence behind a conflict strategy if the value can authorize an Action.

## X-005 Corrected records

**Targets:** L-005, L-007  
**Kind:** counterexample

**Setup.** A submitted purchase invoice posts GL rows. The invoice is wrong. Two later pressures arrive on the same day.

1. Accounting cancels and amends. Original debit and credit remain. Opposite rows are added. Immutable ledger page, 2026-08-14.
2. The clerk who submitted the invoice exercises GDPR Art. 17 erasure on their personal identifier. EUR-Lex CELEX 32016R0679 Art. 17. Finance still needs the trail for a legal claim. Art. 17(3)(e).

A third pressure. Someone disables Palantir-style edit history for the Invoice object type and permanently deletes it. User-edit-history page, retrieved 2026-08-15.

**Falsifying result.** Either the original GL rows disappear, so reviewers cannot see what was posted first, or the personal name stays visible to every reader of current state, or the whole DecisionRecord is deleted to satisfy erasure and the legal-claim exception is ignored.

**What the sources already do.**

- ERPNext. Cancelled documents that own ledger rows cannot normally be deleted. Closed periods block silent rewrite.
- ValueFlows. `corrects` plus `created`. Display may collapse or show both.
- GDPR. Erasure is real. So are listed exceptions. Storage limitation is purpose-bound.
- Palantir. Current-state read implies full-history read. Disable deletes history.

**Consequence if the case holds.** Correction and redaction are different operations. Correction adds a record. Redaction removes or replaces an identifier inside a retained structure. L-007 lives or dies here.

**Runtime consequence.** RetentionClass on nodes and on properties. Fiscal evidence and personal identifiers do not share one delete switch.

## Extra attacks that fell out of the sources

### X-006 Identifier reuse after delete

Palantir edit history remains visible across delete-and-recreate of the same primary key. PROV would rather invalidate the old entity and mint a new one. If OS reuses identity the way Palantir does, the belief graph can attribute last year's override to this year's object. Status `hypothesis`. Related to issue 3.

### X-007 Denied Actions have no record

The Palantir action-log pages describe submissions. They do not, in the text read, store denied attempts as objects. If OS only records allows, "why was this refused?" is unanswerable. Status `undetermined`. Worth a later issue only if Wave A synthesis wants it. Not opened here.

### X-008 Tracking disabled

Odoo `mail_notrack` and `tracking_disable` skip the chatter trail. A caller who can suppress the log can perform the write. That kills any claim that optional audit mixins are DecisionRecords. Status `supported` as a limit on E-010, `hypothesis` as an OS law.

## Mapping back to issue 6 deliverables

| Issue ask | Case |
| --- | --- |
| Stale sources | X-001 |
| Derived forecasts | X-002 |
| Agent reasoning | X-003 |
| Manual overrides | X-004 |
| Corrected records | X-005 |

None of these cases is marked `accepted`. None closes Q8.
