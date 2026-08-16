# Scenarios

**Kind:** counterexample (each card is a probe)  
**Decision:** none on the card until a candidate law fails it. Laws cited are the ones the card can kill.

Happy paths are omitted. These are built to break collapses.

## S-G01 Temporary waiver, still in window

- **Kind:** counterexample
- **Decision:** undetermined (probe)
- **Attacks:** L-04, L-06
- A control says dual approval is required for payments over 50,000. A named waiver, approved by the risk owner, allows single approval for vendor V until 31 August. On 16 August a 60,000 payment to V is submitted with one approver.
- **Must explain:** The obligation still exists. The overlay is in force. Residual risk and owner are reconstructable. Runtime allow is not "policy deleted."
- **Fails if:** The system can only deny (obligation) or allow (no obligation).

## S-G02 Temporary waiver, window closed

- **Kind:** counterexample
- **Decision:** undetermined
- **Attacks:** L-04, L-06
- Same waiver. On 1 September the same payment pattern is submitted. No extension was approved.
- **Must explain:** The obligation binds again without a human recreating it. Historical 16 August payment remains explainable under the then-valid overlay.
- **Fails if:** Expiry deletes history, or expiry requires a new obligation row.

## S-G03 Second approval, exclusive persons

- **Kind:** counterexample
- **Decision:** undetermined
- **Attacks:** L-05, L-07, L-15
- Odoo-style exclusive approval. Amount requires manager then controller. The same human holds both roles.
- **Must explain:** First approval does not satisfy the second. Exclusive-person is a constraint on principals (issue #11) applied to an approval object.
- **Fails if:** Role membership alone counts as two approvals.

## S-G04 Second confirmation after risk threshold (OpenBKN)

- **Kind:** counterexample
- **Decision:** undetermined
- **Attacks:** L-02, L-05, L-08
- Action `restart_erp` is permitted to an on-call engineer. Risk evaluation returns high and demands second confirmation. The engineer confirms alone.
- **Must explain:** Permission to the Action ≠ clearance of the RiskType path. Simulation/assessment is an instance, not a type.
- **Fails if:** `risk_level` on the ActionType is treated as already-approved.

## S-G05 Breached limit after approval, before invoke

- **Kind:** counterexample
- **Decision:** undetermined
- **Attacks:** L-05, L-08
- A purchase is approved at 49,000, under the 50,000 extra-approval limit. Before invoke, a line is added. Total is 61,000. Palantir-style invoke has not run. Odoo-style button has not posted.
- **Must explain:** The bound of the approval (amount, lines) is stale. Revalidation is required. Crossing the limit selects a new path.
- **Fails if:** Invoke applies the old approval to the new total.
- Related seed: `scenarios/README.md` S-003.

## S-G06 Breached limit at commit, approval still green

- **Kind:** counterexample
- **Decision:** undetermined
- **Attacks:** L-05, L-08
- Approval bound the amount. FX move or tax calc after approval pushes the booked amount over the limit at commit.
- **Must explain:** The Action outcome is not the approval. Unknown or recomputed values can invalidate the bound.
- **Fails if:** Posted amount can exceed the approved bound with no new decision.

## S-G07 Expired certification, role still assigned

- **Kind:** counterexample
- **Decision:** undetermined
- **Attacks:** L-10, L-14
- Palantir-style PII marking requires training. The user's training certificate expired yesterday. The Viewer role on the finance project remains. The user opens a PII-marked dataset.
- **Must explain:** Eligibility failed. Discretionary grant remains. Mandatory restriction should deny. Three facts, not one role.
- **Fails if:** Role assignment is treated as current certification.

## S-G08 Expired ICFR attestation period

- **Kind:** counterexample
- **Decision:** undetermined
- **Attacks:** L-03, L-10
- Management's last 404(a) assessment covered the fiscal year ended 31 December. An agent asks in March whether ICFR is currently attested as effective.
- **Must explain:** The attestation is a claim about a period. It is not a live permission. A new period can be unattested while last year's report still exists.
- **Fails if:** "effective" is stored as a boolean on the company with no period.

## S-G09 Retrospective audit of a discount under a changed policy

- **Kind:** counterexample
- **Decision:** undetermined
- **Attacks:** L-01, L-11
- Year 1 policy allows a discount. The Action is approved and executed. Year 3 policy forbids it. An auditor asks why year 1 was allowed.
- **Must explain:** The decision pins the obligation text, approver, and instrument that *applied* then. Today's Cedar-style policy set is the wrong read.
- **Fails if:** Replay under current rules is the only explanation path.
- Related seed: `scenarios/README.md` S-012.

## S-G10 Retrospective audit during GDPR force-but-not-apply gap

- **Kind:** counterexample
- **Decision:** undetermined
- **Attacks:** L-11
- Processing occurs on 1 June 2017. GDPR has entered into force (24 May 2016) and does not apply until 25 May 2018. Directive 95/46/EC still applies.
- **Must explain:** Force ≠ apply. The applicable instrument is the Directive. A control library that only stores "GDPR effective 2016" mis-explains the Action.
- **Fails if:** One date field is the only legal clock.

## S-G11 Approved, checkpoints incomplete, invoke attempted

- **Kind:** counterexample
- **Decision:** undetermined
- **Attacks:** L-05
- Palantir request. All tasks approved. Required justification checkpoint is empty. A caller invokes.
- **Must explain:** `Action required` is not `Completed`. Approval is not invoke.
- **Fails if:** Task-approved implies change applied.

## S-G12 Revoke after approve, before perform

- **Kind:** counterexample
- **Decision:** undetermined
- **Attacks:** L-05
- Odoo approver approves-for-another, then revokes. A second user clicks the gated button.
- **Must explain:** The approval entry is superseded. The button is gated again.
- **Fails if:** Revoke is only a chatter note.

## S-G13 SoD conflict with mitigating control

- **Kind:** counterexample
- **Decision:** undetermined
- **Attacks:** L-06, L-07, L-09
- A user can create vendors and approve payments. SAP-style ARA flags the pair. A mitigating control (monthly manager review) is assigned and current.
- **Must explain:** Runtime may still allow each Action. A SoD risk object remains open. The mitigating control is evidenced on a cycle. A finding is not required if the mitigation is accepted. A deny is not required.
- **Fails if:** The only representations are "allow both" with no risk, or "deny one" with no residual.

## S-G14 Firefighter emergency access

- **Kind:** counterexample
- **Decision:** undetermined
- **Attacks:** L-06, L-07, L-13
- Production is down. An operator checks out a firefighter ID that combines otherwise segregated powers for four hours. Session is logged.
- **Must explain:** This is a time-bounded overlay with extra evidence duty, not a permanent role grant and not a silent allow.
- **Fails if:** Emergency access is modeled as ordinary provisioning.

## S-G15 Month-end freeze

- **Kind:** counterexample
- **Decision:** undetermined
- **Attacks:** L-08, L-13, LIF-08
- OpenBKN-style rule. `restart_erp` is denied with reason "Month-end freeze" even for the platform owner.
- **Must explain:** Freeze is a world-state overlay. Owner role is unchanged. After close, the same role works.
- **Fails if:** Freeze is implemented by deleting the role.

## S-G16 Marking inheritance lockout

- **Kind:** counterexample
- **Decision:** undetermined
- **Attacks:** L-14, L-16
- A raw dataset is marked PII. A transform builds a dashboard. Downstream users have Project Viewer and no PII marking. Palantir says they may see file metadata and not the data, or not discover the resource, depending on whether the marking is file or data inherited.
- **Must explain:** Discretionary grant on the derived object does not pierce mandatory inheritance.
- **Fails if:** Derived objects drop the marking by default.

## S-G17 Case marking mix

- **Kind:** counterexample
- **Decision:** undetermined
- **Attacks:** L-16
- Investigator I works cases 12 and 13. While in a scoped session for case 12, a join accidentally pulls case 13 evidence into a case 12 worksheet.
- **Must explain:** Unique case markings must not mix. Scoped session is an additional restriction, not a substitute.
- **Fails if:** Assignment to the investigator is the only isolation.
- Not a CRM SLA problem. Issue #27 owns ticket clocks.

## S-G18 ATO with open POA&M

- **Kind:** counterexample
- **Decision:** undetermined
- **Attacks:** L-01, L-09, D-01
- FedRAMP package. SAR has Other Than Satisfied items. POA&M is complete and aligned. Authorizing official issues ATO, accepting residual risk. A Cedar-style check on "is the system authorized" returns allow.
- **Must explain:** System authorization (risk acceptance) ≠ absence of findings ≠ per-request allow for every Action inside the system.
- **Fails if:** ATO is stored as "no open findings" or as a user permission.

## S-G19 Operational requirement, High not allowed

- **Kind:** counterexample
- **Decision:** undetermined
- **Attacks:** L-06, L-09
- A vendor will not fix a Medium finding. 3PAO validates an operational requirement. A later High finding is proposed as an OR.
- **Must explain:** Accepted unfixed is typed and bounded. High OR is rejected by FedRAMP rule. Residual risk remains visible.
- **Fails if:** All unfixed items share one "accepted" flag.

## S-G20 Control designed, not operating

- **Kind:** counterexample
- **Decision:** undetermined
- **Attacks:** L-03, L-10
- Dual-approval control is in the SSP and the COSO narrative. Sample testing for the quarter shows 4 of 25 payments posted with one approval. Management concludes a deficiency. The workflow engine still allows a second-approver skip via a broken condition.
- **Must explain:** Design present, operation failed. A finding is opened. Runtime allow during the quarter is evidence *for* the finding, not proof of effectiveness.
- **Fails if:** Presence of a workflow configuration counts as operating effectiveness.

## S-G21 Closed remediation, no retest

- **Kind:** counterexample
- **Decision:** undetermined
- **Attacks:** L-03, L-09
- POA&M item marked closed because a ticket says "fixed." No assessment result records a retest. An auditor asks for evidence.
- **Must explain:** Remediation plan ≠ test result. Closure without evidence is itself a deficiency or at least an unproven claim.
- **Fails if:** Status=closed is the only evidence object.

## S-G22 Late finding after ATO

- **Kind:** counterexample
- **Decision:** undetermined
- **Attacks:** L-09, L-11, constitution item 9
- ATO issued 1 March. On 10 March a scan from 28 February arrives and shows a High. Knowledge time and valid time split.
- **Must explain:** What was known at ATO vs what is now believed about February. Continuous monitoring updates the POA&M. The March ATO explanation must remain possible.
- **Fails if:** The ATO record is rewritten in place and the old knowledge is lost.
- Does not answer open-questions item 7. It only pressures it.

## S-G23 Self-attestation as sole assurance

- **Kind:** counterexample
- **Decision:** undetermined
- **Attacks:** L-15
- The process owner who designed the control also signs the only 404(a)-style assertion. No internal audit, no external attestation, no disclosure of that fact.
- **Must explain:** IIA third line and SOX 404(b) treat this as missing independence. The system should be able to represent the missing assurer, not invent one.
- **Fails if:** Any signed boolean counts as independent assurance.
- Who may sign is a principal question (#11). That they may not be the same person is this folder.

## S-G24 Obligation never encoded as a check

- **Kind:** counterexample
- **Decision:** undetermined
- **Attacks:** L-01, L-20, E-20
- ISO 37301-style obligation. "Gifts above 100 require disclosure." No Cedar/OpenFGA/OPA rule was ever written. Employees record gifts in a spreadsheet. An agent posts a 500 gift with an ordinary create permission.
- **Must explain:** Runtime allow is true. Obligation is unmet. A CMS that only watches the policy engine is blind.
- **Fails if:** Absence of a deny is treated as compliance.

## S-G25 Concurrent freeze and waiver

- **Kind:** counterexample
- **Decision:** undetermined
- **Attacks:** L-06, LIF-08
- A waiver allows single approval for vendor V. A month-end freeze blocks all payments. Both are in force on 31 August.
- **Must explain:** Overlay composition. Sources do not agree which wins. OpenBKN freeze example is a hard deny. ServiceNow exception is an allow overlay. The conflict is the point.
- **Fails if:** The model has only one overlay slot.
- **Decision on winner:** undetermined.

## S-G26 Backdated exception

- **Kind:** counterexample
- **Decision:** undetermined
- **Attacks:** L-06, L-11
- On 20 August a manager approves an exception "effective 1 August" covering a 5 August payment that already posted.
- **Must explain:** Valid time of the overlay vs knowledge time of the approval. Retrospective audit must show the payment was unauthorized *as known on 5 August* and later covered.
- **Fails if:** Backdating silently rewrites the 5 August explanation.
- Related seed: `scenarios/README.md` S-007.

## S-G27 Multi-company approval host

- **Kind:** counterexample
- **Decision:** undetermined
- **Attacks:** L-12, D-02
- Odoo forum (secondary) says approval categories are company-specific by default. A shared-services controller must approve a bill in company B while employed by company A.
- **Must explain:** The approval object has a scope (which legal entity). Hosting the path in a per-company workflow is a source artifact. The durable question is the scope of the decision.
- **Fails if:** We adopt per-company workflow as a kernel to solve this.
- First-party confirmation of the company restriction is weak. Treat the exact Odoo default as `undetermined`. The scope question remains.

## S-G28 Structured OPA output treated as a CMS

- **Kind:** counterexample
- **Decision:** undetermined
- **Attacks:** L-01, L-13, D-03
- A Rego rule returns `{ "allow": true, "obligations": ["log to audit table"] }`. The caller drops the obligations array. The allow is enforced.
- **Must explain:** OPA first-party docs allow structured decisions and still separate decision from enforcement. An unenforced obligation is not ISO 37301 evidence.
- **Fails if:** Returning JSON is counted as a compliance management system.

## S-G29 Common control inherited, then broken upstream

- **Kind:** counterexample
- **Decision:** undetermined
- **Attacks:** L-03, D-01
- NIST common-control authorization. System S inherits logging from platform P. P's control fails in June. S's SSP still says inherited.
- **Must explain:** Inheritance is a live dependency. Authorizing officials "consider the risk of inheriting common controls." S's residual risk changed without S changing its own implementation.
- **Fails if:** Inherited = always effective.

## S-G30 Assessment plan ≠ assessment results

- **Kind:** counterexample
- **Decision:** undetermined
- **Attacks:** L-03
- OSCAL assessment plan lists 40 controls. Results show 37 assessed. Three were out of scope after a production freeze. An official reads the plan and assumes 40.
- **Must explain:** Plan and results are different documents. OSCAL says results reflect changes from the plan.
- **Fails if:** One "assessment" object holds only the plan.

## S-G31 Cancel before submit (ERPNext)

- **Kind:** source-system artifact / counterexample
- **Decision:** supported as ERPNext behavior. rejected as a universal law.
- **Attacks:** L-12
- A workflow author puts Cancelled (docstatus 2) before any Submitted (docstatus 1) state. ERPNext errors. A document cannot be cancelled unless submitted.
- **Must explain:** This is a source invariant about *that* document machine. It is not a domain law that every governance object has a three-value docstatus.
- **Fails if:** We promote docstatus 0/1/2 into the metamodel.

## S-G32 Agent proposes, human approves, world moved

- **Kind:** counterexample
- **Decision:** undetermined
- **Attacks:** L-05, L-15
- Same shape as seed S-003, restated in governance terms. An agent proposes a 1,000-unit buy because stock is 20. Human approves at 10:07. A receipt of 800 posted at 10:06.
- **Must explain:** Approval bound assumptions (stock=20) are false at invoke. Re-read can refuse or replan. The human did not become the assurer of the agent's forecast.
- **Fails if:** Approval of a proposal is treated as a fact about the world.

## Coverage of the issue's named scenarios

| Named in #67 | Cards |
| --- | --- |
| Temporary waiver | S-G01, S-G02, S-G25, S-G26 |
| Second approval | S-G03, S-G04 |
| Breached limit | S-G05, S-G06 |
| Expired certification | S-G07, S-G08 |
| Retrospective audit | S-G09, S-G10, S-G22, S-G26 |
