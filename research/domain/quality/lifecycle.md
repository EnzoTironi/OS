# Quality lifecycle

**Kind:** candidate law, encoded as a state machine  
**Decision state:** hypothesis

Scattered booleans such as `qi_required`, `check_passed`, and `released` hide illegal combinations. The domain is a machine with named states and named transitions. This is a research model, not a schema.

Inventory custody transitions belong to issue #18. Scrap and rework execution belong to issue #19. Transformation and lot identity belong to issues #20 and #38.

## Objects that persist

These are enduring or documentary things. They are not states of one record.

| Object | Role in the machine | Evidence |
| --- | --- | --- |
| Requirement | What must be fulfilled | ISO 9000 3.6.4 |
| Specification | Document stating requirements, with revision | ISO 9000 3.8.7, ISA-95 Version |
| Characteristic | Distinguishing feature of an object | ISO 9000 3.10.1 |
| Quality characteristic | Inherent characteristic related to a requirement | ISO 9000 3.10.2 |
| Inspection plan or quality plan | When, what, who, how, sample rule | ISO 9000 3.8.9, Odoo QCP, 21 CFR 211.165(c) |
| Sample draw | Which units or quantity were taken | ISO 2859, ERPNext sample size, GS1 sampling |
| Measurement or observation | Value, maybe uncertainty, instrument, time | GUM, ISO 9000 3.11.5, ISA-95 Date |
| Inspection judgment | Conformity, nonconformity, or degree | ISO 9000 3.11.7 |
| Nonconformance record | Identified non-fulfilment plus evidence | ISO 9001 8.7.2 |
| Concession or deviation permit | Time-bounded permission | ISO 9000 3.12.5, 3.12.6 |
| Release authorization | Permission to proceed, with authorizer | ISO 9000 3.12.7, ISO 9001 8.6 |
| Certificate | Document confirming characteristics | GS1 `cert` |
| Corrective or preventive action | Cause elimination, not product dealing | ISO 9001 10.2, ERPNext Quality Action |

## Lot or unit quality states

A tracked quantity, lot, or serial sits in one of these states. Partial lots may split quantity into two state tokens that still cite one parent lot. Whether that split creates new lot identity is undetermined and overlaps #20.

```text
unverified
    --plan inspection--> inspection_due
    --skip-lot policy--> released          [ISO 2859 skip-lot. Authority required.]

inspection_due
    --draw sample--> sampled
    --inspect in place--> measured         [GS1 inspecting, objects stay viable]

sampled
    --record observations--> measured
    --destroy sample instance--> measured  [GS1 sampling, instance end-of-life]

measured
    --judge against pinned spec--> conformant
    --judge against pinned spec--> nonconforming
    --inconclusive or OOS pending--> judgment_pending

conformant
    --authorize release--> released
    --later adverse fact--> recalled or nonconforming

nonconforming
    --contain--> contained                 [custody, #18]
    --concession--> released_under_concession
    --reject--> rejected

contained
    --rework start--> in_rework            [execution, #19]
    --repair start--> in_repair            [#19]
    --scrap--> scrapped                    [#19]
    --return or inform customer--> returned
    --concession--> released_under_concession

in_rework
    --re-verify pass--> conformant         [ISO 9001 8.7, 21 CFR 211.165(f)]
    --re-verify fail--> nonconforming

in_repair
    --accept for use--> released_under_concession
    --still unfit--> nonconforming

released
    --post-delivery nonconformity--> recalled or contained
    --certificate issued--> released       [certificate is a document, not a new state]

released_under_concession
    --limit expires or use exceeded--> contained
    --recall--> recalled

rejected
    --reprocess--> in_rework
    --scrap--> scrapped

recalled
    --return stream--> contained           [GS1 shipping while disposition recalled]
```

Illegal combinations the machine is meant to forbid:

- `released` without a release authorization, except the skip-lot and radiopharmaceutical exceptions, which still require a named authority.
- `released` while required planned arrangements are open, unless ISO 9001 8.6 exception applies.
- `scrapped` without a nonconforming or rejected judgment, unless manufacturing records an independent process loss. That case is #19, not silent quality pass.
- Overwrite of `measured` when a retest happens. Retest adds a new measurement and a new judgment.

## Judgment is not a stock status

GS1 CBV keeps business step and disposition apart on purpose. An object can be `shipping` while disposition is `recalled`. ERPNext header Status Accepted is closer to a judgment. Odoo failure location is closer to custody. Collapsing them into one `qc_status` field loses both stories.

## Specification effectivity

A specification revision is not a state of the lot. It is a document with valid time.

```text
spec_v1  valid [t0, t1)
spec_v2  valid [t1, t2)
```

An inspection at valid time `t` must pin the specification that was valid at `t`, or the specification that the plan named, even if today's spec is newer. ISO 9001 8.5.6 requires control of changes. ISA-95 test specification has Version. See S-002.

Whether the lot should be re-opened when the spec changes after production is a policy question. It is not automatic in any fetched source.

## Override path

ERPNext Manual Inspection sets row status by hand. ISO concession authorizes use of a nonconforming product. 21 CFR 211.165(f) rejects failing drug product.

The machine above treats override as a transition from `nonconforming` to `released_under_concession`, not as a rewrite of `measured` to look conformant.

Whether that transition is a named Action or a Policy that permits `AuthorizeRelease` stays **undetermined**. See Q-002.

## Provenance on every transition

Each transition should be able to answer actor, activity, evidence, valid time, and knowledge time. ISA-95 already splits test Date from record timestamp. GS1 forbids deleting the prior event. Constitution §8 and §11 apply.

## CAPA sits beside the machine

Corrective action can start from a nonconformance, a review, a complaint, or an alert. It does not move the lot. ERPNext Quality Action is this side loop. ISO 9001 10.2 is this side loop. Do not replace `contained` with `capa_open`.
