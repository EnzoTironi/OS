# Lifecycles forced by the sources

**Kind:** domain evidence  
**Decision:** hypothesis for OS composition. Supported as descriptions of the sources.

These are not a target schema. They record state sequences the sources will not let you collapse.

## LIF-01 Approval request (Palantir, Odoo, ERPNext)

Palantir request states, first-party: `Pending approval` → `Changes requested` | `Closed` | `Rejected and Closed` | `Action required` | `Completed`.

Completed means invoked. Action required means all tasks approved and invoke still blocked on checkpoints. Closed and rejected-and-closed do not reopen.

Odoo adds revoke after approve. ERPNext adds the hard rule that cancel requires prior submit (docstatus 2 only after 1).

```text
draft / pending
    -> approved-not-invoked   (Palantir Action required, Odoo approve-for-another)
    -> invoked / submitted    (effect attempted)
    -> rejected | closed
    -> revoked                (Odoo. Palantir does not reopen)
```

- **Runtime consequence:** commit must re-read. Constitution item 8. Scenario S-003 in `scenarios/README.md` already names stale approval. Governance adds a second stale form. The world can change between approve and invoke even when checkpoints are complete.

## LIF-02 Policy exception / waiver (ServiceNow, SAP mitigating control, FedRAMP OR)

ServiceNow. Submit → analyze (risk assessment only in Analyze) → approve or reject → later extension request.

SAP. SoD violation exists → mitigating control assigned → periodic recertification.

FedRAMP. Finding → POA&M item → remediate | mitigate | operational requirement (accepted unfixed, not for High).

```text
obligation in force
    -> exception requested
    -> residual risk assessed
    -> approved for [start, end] with mitigating controls
    -> expired | extended | revoked
    -> obligation fully binds again
```

The obligation never leaves the model. The exception is a time-bounded overlay.

## LIF-03 Risk (ISO 31000, COSO ERM, OpenBKN)

ISO 31000 process. Scope/context/criteria → identify → analyze → evaluate → treat → monitor/review. Residual risk after treatment is documented.

OpenBKN. RiskType definition is durable. An evaluation is a run (`bkn risk eval`) against an action and context.

```text
risk type (catalog)
    -> assessment instance (dated, scoped to subject)
    -> response chosen (avoid, reduce, share, accept, plus OpenBKN block/downgrade/second-confirm)
    -> residual recorded
    -> monitor / reassess
```

A type with no instance is still a type. An instance without a type is a one-off judgment. Sources keep both.

## LIF-04 Control (COSO, NIST RMF, OSCAL)

NIST RMF. Prepare → Categorize → Select → Implement → Assess → Authorize → Monitor.

OSCAL documents. Catalog → Profile (baseline) → SSP (how implemented) → Assessment Plan → Assessment Results → POA&M.

COSO. Design (present) and operation (functioning). Monitoring then deficiency communication.

```text
requirement / obligation
    -> control selected or designed
    -> implemented
    -> tested (design and/or operating effectiveness)
    -> effective | deficient
    -> remediated and retested
    -> continuously monitored
```

Authorize (ATO) sits *after* assess. It accepts residual risk of the package. It is not a green test badge.

## LIF-05 Finding and remediation (FedRAMP, SEC, COSO)

```text
assessment or incident
    -> deficiency identified
    -> severity classified (e.g. material weakness vs significant deficiency)
    -> communicated to the party who must act
    -> POA&M / remediation plan with dates
    -> closed after evidence of correction
    -> optionally retested
```

SEC requires public disclosure of material weaknesses. That is a reporting obligation on top of the finding.

## LIF-06 Attestation and certification

```text
subject (control, access, policy acknowledgement)
    -> campaign or period opens
    -> attester asserts
    -> (optional) independent assurer attests
    -> valid until
    -> expired | withdrawn | superseded
```

SOX 404(a) is management's annual assertion. 404(b) is the auditor's attestation. ServiceNow acknowledgement campaigns are a lighter form. SAP UAR and SoD review are periodic recertification of access, not of ICFR.

Expired certification is a state. It is not a missing role.

## LIF-07 Regulation clock (GDPR Art. 99)

```text
adopted / signed
    -> published
    -> enters into force
    -> applies / becomes enforceable
    -> amended
    -> repealed (GDPR repealed Directive 95/46/EC on the application date, not the force date)
```

Force and apply are different instants. A control library keyed only to "today's text" cannot explain a 2017 processing decision or a 2018 first-day obligation.

Fiscal filing due dates remain issue #30. This clock is the legal instrument, not the tax calendar.

## LIF-08 Freeze / block overlay (OpenBKN, Palantir markings)

```text
normal permission
    -> freeze asserted (reason, scope, window)
    -> attempts denied or downgraded or sent to second confirmation
    -> freeze lifted
    -> normal permission resumes
```

Palantir markings add inheritance. Downstream derived data stays frozen until the marking is removed at the origin or in a transform.

## LIF-09 Investigation isolation (Palantir case markings)

```text
case opened
    -> unique marking created
    -> evidence objects inherit the marking
    -> investigators granted that marking only
    -> scoped session may hide other case markings
    -> case closed (marking deletion is not allowed per Palantir manage-markings, cited from community pointing at official manage-markings. Treat deletion ban as hypothesis until that page is fetched)
```

CRM case lifecycle stays with issue #27. This lifecycle is the isolation marking, not the ticket.

## What these lifecycles share

- **Kind:** candidate law
- **Decision:** hypothesis
- Almost every durable governance object has a validity window, an actor who asserted it, and a later object that can supersede it without erasing it.
- Almost every runtime check is a *read* of those objects at a time, not the object itself.
- Workflow graphs that move a document through named states are one way to host some of these objects. They are not the objects. See L-12.
