# Adversarial scenarios — issue #157

Every scenario is a falsifier candidate. Passing means only that the bounded model represents/blocks the case; it does not prove production completeness.

## Direct semantic rewrite

- **S-OCC-01** Action posts stock movement qty 10; later Action tries in-place qty 9 -> reject.
- **S-OCC-02** admin tool tries in-place stock movement rewrite -> reject.
- **S-OCC-03** bulk-import tool tries overwrite under same record id -> reject/conflict.
- **S-OCC-04** CDC replay carries changed quantity under accepted id -> conflict, not overwrite.
- **S-OCC-05** connector reconcile receives changed external status -> append evidence/correction, not raw rewrite.
- **S-OCC-06** repair tool changes historical account on posting -> correction/reversal path required.
- **S-OCC-07** migration script changes semantic quantity while claiming representation migration -> reject.
- **S-OCC-08** restore loads stale value over newer accepted value -> replay/reconcile, not semantic overwrite.

## Accounting / inventory history

- **S-OCC-09** posted journal becomes unbalanced after attempted admin edit -> impossible through candidate boundary.
- **S-OCC-10** stock movement already included in downstream balance is changed -> reject regardless of downstream materialization.
- **S-OCC-11** correction states original movement quantity was wrong -> original remains, correction relation added.
- **S-OCC-12** true compensating stock movement occurs -> new reversing occurrence linked to original.
- **S-OCC-13** accounting period later closes -> closure does not mutate prior posting meaning.
- **S-OCC-14** late evidence proves source observation was duplicated -> observation corrected/deduped without inventing new business occurrence.

## External ingest

- **S-OCC-15** bank/marketplace/SEFAZ-originated occurrence enters OS -> no local business Action is invented.
- **S-OCC-16** same source replay and same semantic operation identity -> reconstruct/no duplicate occurrence.
- **S-OCC-17** same external id but conflicting payload -> disagreement, not last-write-wins.
- **S-OCC-18** two source messages refer to one occurrence -> evidence multiplicity does not imply occurrence multiplicity.
- **S-OCC-19** source corrects a message that never represented accepted business truth -> correct source assertion only.
- **S-OCC-20** source correction invalidates an already accepted occurrence -> explicit retraction/correction path.

## Privacy / erasure

- **S-OCC-21** operator display name in payload must be erased -> payload erased, semantic quantity preserved.
- **S-OCC-22** privacy caller attempts to redact semantic quantity via payload API -> reject.
- **S-OCC-23** policy permits digest after redaction -> digest may remain if explicitly selected.
- **S-OCC-24** policy forbids residual digest -> field becomes null/erased without hidden hash.
- **S-OCC-25** jurisdiction requires deletion of a field currently classified semantic -> bounded model declares stronger erasure semantics required; do not fake compliance.

## Schema / ontology revision

- **S-OCC-26** Type StockMovement v2 becomes current -> v1 records retain v1 meaning.
- **S-OCC-27** representation serializer changes -> representation version changes, semantic value equal.
- **S-OCC-28** migration wants to reinterpret old code value -> explicit semantic migration/correction required.
- **S-OCC-29** ontology rename preserves stable semantic identity -> no new occurrence.
- **S-OCC-30** ontology revision changes future validation -> historical record remains tied to original revision.

## Projection / analytics

- **S-OCC-31** rebuild inventory balance projection -> no new business history entry.
- **S-OCC-32** projection corruption -> drop/rebuild derived store; authoritative records unchanged.
- **S-OCC-33** new projection algorithm changes current derived value -> algorithm revision/projection changes, not historical occurrence.
- **S-OCC-34** search index reindexes record -> no business occurrence.

## Disaster recovery

- **S-OCC-35** DB restore loses latest physical rows -> stable operation replay reconstructs them.
- **S-OCC-36** external effect happened after backup -> restore does not assume it failed; #41 reconciliation required.
- **S-OCC-37** replay receives same semantic operation under different physical attempt -> no second business occurrence.
- **S-OCC-38** stale backup conflicts with newer authority evidence -> surface reconciliation instead of overwriting newer meaning.

## Primitive sensitivity

- **S-OCC-39** generic sealed contract protects PublishedDefinition -> demonstrates independent non-event use.
- **S-OCC-40** native Event engine protects StockMovement but allows PublishedDefinition rewrite -> Event-specific hardcoding is observable.
- **S-OCC-41** generic contract removed -> admin mutant can rewrite stock movement.
- **S-OCC-42** generic contract kept but raw replay bypass added -> replay mutant rewrites history.
- **S-OCC-43** physical append-only store used -> protects history but cannot perform required payload erasure/representation rewrite.
- **S-OCC-44** Type tag `event=true` with no authority enforcement -> generic write still mutates; tag-only model rejected.

## Authority / capability

- **S-OCC-45** proof for admin annotate reused as replace-core -> operation mismatch rejects.
- **S-OCC-46** proof for repair path reused by privacy path -> path mismatch rejects.
- **S-OCC-47** correction proof changed to different original target -> target/context mismatch rejects.
- **S-OCC-48** connector authority attempts semantic overwrite because source is external authority -> source authority does not imply generic local rewrite permission.

## Boundary cases

- **S-OCC-49** mutable draft note edits in place -> allowed; sealed_semantics is not universal immutability.
- **S-OCC-50** published definition uses sealed_semantics -> immutable semantic value without Event base sort.
