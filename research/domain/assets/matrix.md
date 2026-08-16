# Convergence matrix

**Kind:** reference over domain evidence  
**Decision:** cells are `supported`, `absent`, `divergent`, or `undetermined`. This table is not a feature scorecard.

Legend.

- **Y.** First-party page or official teaching states the distinction.
- **P.** Partial. The product has a nearby field or a collapsed document.
- **N.** Fetched first-party pages do not show it.
- **U.** Not readable this session, usually paywall.
- **D.** Sources in that family disagree with each other.

Manufacturing capability and execution details defer to #19. Planning and capacity defer to #24. Spare-part stock defers to #18. Calibration method defers to #25.

| Distinction | ERPNext | Odoo 18 | Maximo / IBM | SAP AM | ISA-95 OPC | ISO 14224 | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Financial capitalization ≠ operational equipment | N collapsed on Asset | Y split apps | P rotating value vs asset | U FI-AA link not fetched | Y PhysicalAsset vs Equipment | N out of scope | See E-001, E-002, E-003. Identity fork `undetermined` |
| Role / install place ≠ serial device | P location + asset | P work center + equipment | Y location vs asset, rotating | Y functional location vs equipment | Y Equipment vs PhysicalAsset | P equipment taxonomy | Strongest independent convergence |
| Location hierarchy | Y tree | P free text plus work center | Y location systems | Y structure indicator | Y EquipmentLevel, MadeUpOf | U | ERPNext tree is facility, not ISA levels |
| Location ≠ warehouse / storeroom | Y explicit FAQ | P | Y storeroom vs operating | P plant vs storage | U Part 1 | N | E-006 |
| Custody ≠ location | Y movement purposes | P Used By | U | U | N | N | E-007 |
| Current place as projection of movements | Y | N edit fields | Y move/swap | Y usage times | Y assignment history | N | L-002 |
| Capability as testable property | N | N | P health/predict product | P measuring points | Y capability tests | N | E-017. #19 owns production capability |
| Operating condition ≠ book status | P mixed status list | P stages and block flag | P | U | U | P consequence | E-012 |
| Meter / measurement | N on Asset pages | N official 18.0 | Y | Y | P properties, not meters | P condition monitoring as detection | E-014 |
| Preventive ≠ corrective | Y plan vs repair | Y type on one request | Y work type / PM | Y plans vs notifications | U Part 3 | Y named in scope | E-008 |
| Predictive as its own kind | N | P MTBF estimate | P Predict product | U | U | P | E-020. Not a kind |
| Plan ≠ occurrence ≠ completion | Y plan + log | P one request | Y job plan + WO | Y task list + plan + order | U | P maintenance data | L-003 identity `undetermined` |
| Failure observation ≠ action | Y two text fields | P notes vs instructions | P failure code on WO | P catalogs | N | Y mode ≠ mechanism ≠ cause ≠ detection | E-010 |
| Downtime interval | Y computed field | P duration and MTTR | P | U | U | Y down time in maintenance data | |
| Spare consumption | Y repair stock items | N official pages | Y issue rotating or consumable | Y spare product master | U | P | #18 |
| Warranty / insurance interval | P insurance on Asset | Y warranty date | U | U | N | N | E-015 |
| Calibration task + certificate | Y type + flag | N | P | U | N | N | E-016. #25 |
| Component replace keeps role | P consume asset in capitalization | N | Y rotate | Y usage times | Y assignment history | N | S-007, S-016 |
| Maintenance blocks production | N fetched pages | Y Block Workcenter | U | P work center on technical object | U | N | E-013. #19 #24 |
| Third-party owned maintainable equipment | P Asset Owner company, supplier, customer on v13 text | Y rental owner | U | U | P vendor ≠ manufacturer | N | E-002 |
| Grouped quantity assets | Y discouraged | N | N serialized rotating | N | N instance | N | Source artifact |
| ISA-95 Part 1 attribute tables | blank | blank | blank | blank | U | blank | Paywalled this session |

## Divergence that must not be averaged away

1. **One object versus many.** ERPNext Asset is finance plus operations. Odoo uses two apps. ISA-95, SAP, and Maximo use role or location plus serial asset. Averaging these into "Asset" would hide the only distinction that relocation and swap scenarios need.

2. **Document shape for work.** ERPNext uses Asset Maintenance, Asset Maintenance Log, and Asset Repair. Odoo uses one Maintenance Request with a type flag and kanban stages. Maximo and SAP use job plan or task list, then work order, then actuals. The shared law is plan ≠ happened, not a shared document.

3. **Failure time.** ISO 14224 and ERPNext treat failure as an observed occurrence with a failure date. Odoo documents Latest Failure as request creation time. That is a product bug relative to valid time, not a competing ontology.

4. **Meters.** Absent in fetched ERPNext Asset and Odoo 18 Maintenance docs. Present in SAP and Maximo. Condition-based scenarios are still required. The gap is coverage, not a vote that meters are optional in the domain.

## Cells left `undetermined` on purpose

- IEC 62264-1 and -2 attribute tables
- Full ISO 14224 failure-mode catalogs
- SAP FI-AA to equipment link
- Odoo official recurrence generation
- Whether Block Workcenter zeros capacity or only rejects new schedule rows
- Moqui / Mantle asset model. Not fetched this session
