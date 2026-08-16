# Execution order snapshot, 2026-08-16

**Kind.** reference.  
**Decision.** `hypothesis` for the ranking. Presence rows are `supported`.  
**Rule.** This is the next-action list, not a close list.

Ranks are information-gain order. A lower rank number is a higher remaining gain. Issue numbers inside a row are names, not priority.

## Next actions

| Rank | Action | Issues | Why this still pays | Parallelism |
| --- | --- | --- | --- | --- |
| 1 | Review-correct existing Wave A drafts against the issue 2 gate | Especially #3, #4, #5, #7, #14, #55, #56, #59, #68. Then the rest of #84 to #119 | Inference-boundary defects block every later use of those notes. #70 cannot consume them yet | One writer per exclusive branch. Not a new VM on a second tree |
| 2 | First kill on integration duplication | #72 | No remote tree. Tests whether OS adds a stale replica. Independent of proposing agents | `parallel_now` if the exclusive branch is free |
| 3 | Stress the #73 top cluster, or file the six children #73 named | #79, and coordinator-filed children of #73 | Missing forms that break Action then Event then Fact then Resource then boolean Policy. Outranks runtime polish | #79 `parallel_now` on public standards. Children wait for the coordinator to file |
| 4 | Archive already-rejected claims so they cannot be rediscovered as fresh ideas | #81 | #55, #57, #58, #59, #60, #61, #68 already record folder-level `rejected` claims on remotes | `parallel_now` via `git show`. Do not copy sibling folders |
| 5 | Decision-discipline note that names hypothesis versus evidence versus experiment | #82 | The review gate is already failing this split | `parallel_now` |
| 6 | Literature watch seeded by #73 | #78 | #73 already named GHG Protocol, NAESB, ACORD, NIEM, PREMIS as watch items | `parallel_now` |
| 7 | Land the result contract | #74, [PR 84](https://github.com/EnzoTironi/OS/pull/84) | Later notes should share one shape. Standing order 16 still uses the backlog contract until this lands | Review-correction on that exclusive branch |
| 8 | Domain-to-engine leakage audit of notes, not of a runtime | #83 | Constitution rule 12 and open question 15 already name the smell. There is no engine to audit | `parallel_now` as a note audit. `blocked_on_evidence` as a runtime audit |
| 9 | Widen existing issues that #73 said to widen | #3, #10, #14, #15, #18, #31, #38, #62 | SID, CMMN, CIM, LADM, FHIR, LegalRuleML. Do not file twin module issues | Only after those exclusive writers finish or the coordinator assigns a new angle |
| 10 | Real-company reality check | #77 | Highest possible falsifier for laws that only hold on clean reference systems | `blocked_needs_data` |
| 11 | Machine-readable research graph | #75 | Useful after review-clean notes exist. Backlog places it in Wave B | `parked_wave_b` |
| 12 | Storage, transactions, effects, auth, durable execution, surfaces | #39 to #49, #66 | Must derive from surviving semantics. #59 and #5 currently reject default bitemporal rows | `parked_wave_b` |
| 13 | Composition without Packs, authoring, compiler | #63 to #65 | Toolchain is not a business primitive | `parked_wave_b` |
| 14 | Self-evolution and generated surfaces | #52 to #54 | Product-side AGI waits for semantic pressure | `parked_wave_b` |
| 15 | Cross-domain synthesis and first vertical | #70, #71, #80 | Consume disagreements and counterexamples. Do not average draft notes | `parked_wave_c` |

## Gain already spent on first-pass writing

Do not spawn a second exclusive writer for a new first-pass on these issues. Review correction is the remaining work.

| Cluster | Issues | Remote first-pass | Notes |
| --- | --- | --- | --- |
| Foundation | #3 to #13, #62 | yes | #3 no longer needs an early empty start. Relator encoding is the leftover, via review and D-001 |
| Domain | #14 to #31, #67 | yes | Party and HR already absorbed role-versus-kind. O2C, inventory, and manufacturing still have `undetermined` local questions. Those wait on review, not on a twin writer |
| Corpus | #32 to #38 | yes | Domain agents may `git show` these. They must not wait for perfect archaeology, and they must not rewrite them |
| AGI protocol | #50 to #51 | yes | Protocol notes. Not a license to run #52 to #54 |
| Kill | #55 to #61, #68 | yes | Folder-level `rejected` claims already exist as drafts. #72 is the hole |
| Ops present | #69, #73 | yes | Licensing and unknown-unknowns maps exist. #73 children are not filed |

## Parallel now

Safe if each unit has its own exclusive branch and does not write another issue's tree.

- #72
- #78
- #79
- #81
- #82
- #83 as a note-only leakage pass
- Review corrections on already-owned exclusive branches

These may run together. They must not close anything. They must `git show` siblings instead of copying them.

## Blocked on evidence

| Issue | Block | What would unblock |
| --- | --- | --- |
| #77 | No messy company corpus in-repo | De-identified operational data plus a licensing path |
| #70 | Wave A notes are not review-clean. #55 leaves the thesis reading `undetermined` | Review-clean foundation, domain, corpus, and kill notes, plus an explicit disagreement ledger |
| #71 | Needs #70-scale surviving laws | #70 |
| #80 | Readiness gate for synthesis | Enough review-clean evidence to state stop conditions without inventing them |
| #39 | #59 and #5 currently reject default bitemporal Fact rows. Review has not accepted those kills | Review-clean temporal and Fact notes. Then derive storage requirements |
| #40 to #49, #66 | No surviving semantic pressure on `origin/main` | Same as #39, plus Action, Event, and Effect from #7 after review |
| #63 to #65 | Toolchain follows semantics | Wave A laws that actually force an authoring or execution property |
| #52 to #54 | Self-evolution and generated apps | Stable-enough types and actions to mutate |
| #75 | Graph of claims | Review-clean notes worth indexing. #74 landing helps the shard shape |
| Second first-pass on #3 to #38 | Exclusive trees already occupied | Do not unblock. Review instead |

## Parked on purpose

Wave B runtime and toolchain recommendations stay parked until Wave A evidence exists. Wave C synthesis stays parked until that same bar. This snapshot does not lower the bar because many draft PRs exist.

## Do not do

- Close #3 through #83 because a first-pass file exists
- Open a twin issue that restates Party, Inventory, or Work Order
- Start #39 as if RFC-0001 already chose Fact storage
- Treat #68 as permission to implement on Palantir or ERPNext
- File the #73 children from this unit. The coordinator files genuinely new questions
