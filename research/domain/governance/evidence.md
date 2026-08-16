# Evidence

**Kind:** mixed cards  
**Fetched:** 2026-08-16

Each card is one distinction. Kind and decision state sit on the card, not in a later summary.

## E-01 Runtime allow/deny is a decision, not a GRC object

- **Kind:** domain evidence
- **Decision:** supported
- Cedar evaluates a request against policies and entities and returns allow or deny. The official guide says the application asks "Is this request authorized?" then performs the operation or returns an error. Policies are separate from application code. Schema is used to validate policies, not to evaluate the request. Source: S-CEDAR.
- OpenFGA answers whether a relationship exists between a user and an object given an authorization model and relationship tuples. A check is a graph question. Source: S-OPENFGA.
- OPA "decouples policy decision-making from policy enforcement." Output may be structured JSON, not only boolean. Source: S-OPA.
- None of these three first-party pages define Risk, Control, Waiver, Finding, Attestation, or POA&M as engine objects.

## E-02 GRC systems store policy, exception, control, and assessment as records

- **Kind:** domain evidence
- **Decision:** supported
- ServiceNow stores policy exceptions in `sn_compliance_policy_exception`. A compliance manager can attach residual likelihood, residual impact, residual score, impacted controls, mitigating controls, risks, and approvers before approve or reject. Extensions are a first-class follow-on. Source: S-SN-EXC, S-SN-COMP.
- NIST RMF treats control selection, implementation, assessment, system authorization, common-control authorization, continuous monitoring, and POA&M as named tasks that produce artifacts. An authorizing official issues an authorization to operate or to use, accepting residual risk. Source: S-NIST-RMF.
- OSCAL splits catalog, profile (baseline), system security plan, assessment plan, assessment results, and POA&M into separate models. An assessment plan is always in the context of a specific system and an SSP. Source: S-OSCAL.
- FedRAMP requires SSP, SAP, SAR, and POA&M as a package. The POA&M "identifies the system's known weaknesses and security deficiencies and describes the specific activities the CSP will take to correct them." Source: S-FEDRAMP-POAM.

These are business objects with identity, owners, and dates. They are not the same thing as a Cedar allow.

## E-03 Policy-as-authorization and governance-object identity

- **Kind:** candidate law
- **Decision:** undetermined
- Independent sources agree the *jobs* differ. Cedar/OpenFGA/OPA decide a request. COSO/NIST/ServiceNow/ISO 37301 manage obligations, controls, exceptions, and evidence over time.
- Independent sources do **not** agree that those jobs share one identity that OS should name `Policy`. RFC-0001 still hypothesizes Policy as "authority decision over a principal/action/resource/context." COSO Principle 12 deploys control activities "through policies and procedures." ISO 37301 manages "compliance obligations." ServiceNow has a Policy table *and* a Policy Exception table. Those are three different uses of the word.
- Do not collapse them into one OS primitive on this evidence. See L-01.

## E-04 Risk type is not a risk assessment

- **Kind:** domain evidence
- **Decision:** supported
- ISO 31000:2018 defines risk as "effect of uncertainty on objectives." The process identifies, analyzes, evaluates, treats, monitors. Residual risk after treatment is documented and reviewed. Source: S-ISO-31000.
- COSO ERM 2017. ERM is "the culture, capabilities, and practices that organizations integrate with strategy-setting." It is not a function or department. It is not a risk listing. It is not only internal control. Risk appetite is defined. Risks are prioritized by severity in that context. The organization selects risk responses and takes a portfolio view. Source: S-COSO-ERM.
- OpenBKN. `RiskType` is an independent type, not a sub-field of `ActionType`. `ActionType.risk_level` declares "how dangerous." `RiskType` declares "how to manage" via control scope, control policy, pre-checks, rollback, audit requirements. Source: S-BKN-SPEC.
- A type (credit risk, SoD risk, month-end freeze risk) can exist with zero current assessments. An assessment is a dated judgment about a subject against a type.

## E-05 Control is a designed safeguard, not an allow rule

- **Kind:** domain evidence
- **Decision:** supported
- COSO ICIF. Control activities are "actions established through policies and procedures" that help carry out management directives. They may be preventive or detective. They include authorizations and approvals, verifications, reconciliations, and performance reviews. SOD is typically built in. Where SOD is not practical, management develops alternative control activities. Source: S-COSO-IC.
- NIST SP 800-53 Rev. 5. Controls are a catalog of safeguards addressing requirements from laws, orders, directives, regulations, policies, standards, and guidelines. The catalog addresses functionality (strength of mechanisms) and assurance (confidence that the capability is provided). Source: S-NIST-53.
- A Cedar policy can *implement* a control at request time. The control still exists as a designed, tested, evidenced thing when no request is in flight.

## E-06 Approval is a decision object that may not yet have happened as an effect

- **Kind:** domain evidence
- **Decision:** supported
- Palantir Approvals. A request contains tasks. All tasks must be approved before the request is *invoked*, which applies the change. A request can sit in `Action required` after every task is approved if required checkpoints are incomplete. Closed and rejected-and-closed requests cannot be reopened. Completed means invoked. Source: S-PAL-APPR.
- Odoo Studio. Approval rules gate a button. Exclusive approval requires different users. An approver can approve-and-perform, approve-for-another, reject, or revoke. Approvals are tracked as entries. Source: S-ODOO-STUDIO.
- ERPNext. A workflow overrides default Save/Submit. States map onto docstatus 0 (saved), 1 (submitted), 2 (cancelled). A document cannot be cancelled unless submitted. Transitions can carry amount conditions. Source: S-FRAPPE-WF.
- NIST RMF authorization is a senior-official risk acceptance, not a document-state click. Source: S-NIST-RMF.
- Constitution item 8 still holds. Requested is not happened. An approval record is not the downstream Effect.

## E-07 Exception and waiver are time-bounded permissions to violate a stated obligation

- **Kind:** domain evidence
- **Decision:** supported
- ServiceNow treats a policy exception as a request that can be risk-assessed, tied to impacted and mitigating controls, approved, and later extended. Source: S-SN-EXC.
- SAP Access Control assigns mitigating controls when SoD cannot be separated. Periodic SoD review certifies whether conflicting access remains appropriate. Source: S-SAP-AC.
- FedRAMP operational requirement is a finding that cannot be remediated, often because the system will not function or a vendor will not fix it. It still appears on the POA&M. High vulnerabilities are not approved as ORs. Source: S-FEDRAMP-POAM.
- An exception does not delete the obligation. It records accepted residual risk for a window.

## E-08 Segregation of duties is a combinatorial prohibition, often mitigated rather than removed

- **Kind:** domain evidence
- **Decision:** supported
- COSO names SOD as a typical control-activity design, with explicit fallback to alternative controls when SOD is impractical. Source: S-COSO-IC.
- SAP Access Control Access Risk Analysis compares user authorizations to a risk ruleset of conflicting functions. Access Request lets approvers run SoD analysis before approve, reject, or modify. Emergency firefighter IDs exist. Source: S-SAP-AC.
- Cedar or OpenFGA can express "must not hold both relations." That expression is not the SoD *risk object*, the mitigating control, or the periodic certification. Those live in GRC.

## E-09 Limit and threshold are numeric predicates that change the required governance path

- **Kind:** domain evidence
- **Decision:** supported
- ERPNext workflow conditions can require a different role when `doc.grand_total` crosses a bound. Source: S-FRAPPE-WF.
- Odoo Purchase can require administrator approval above a configured minimum amount. Studio rules can add further filters. Source: S-ODOO-STUDIO and community confirmation of the settings flag. The settings-flag page used here is secondary. Treat the exact Odoo Purchase setting UI as `undetermined` if only the Studio page is first-party.
- OpenBKN CLI example. A rule `{ "allowed": false, "risk_level": 5, "reason": "Month-end freeze" }` blocks `restart_erp`. Source: S-BKN-CLI.
- A limit is not itself an approval. Crossing it *creates* an approval, freeze, or exception demand.

## E-10 Case and investigation isolate visibility. They are not CRM tickets

- **Kind:** domain evidence
- **Decision:** supported as a governance isolation pattern. CRM case/SLA clocks stay with issue #27.
- Palantir. Case investigation data, including AML, must not mix across cases. Each case gets a unique `Case - xxxxxx` marking. Only investigators on that case receive the marking. An investigator may hold several case markings at once. Scoped sessions can further restrict which markings are active. Source: S-PAL-MARK.
- That is a mandatory access-control object used to isolate an investigation. It is not a support SLA. Do not fold it into issue #27.

## E-11 Audit finding is a dated deficiency with residual risk, not a deny

- **Kind:** domain evidence
- **Decision:** supported
- COSO Principle 17. The organization evaluates and communicates internal control deficiencies in a timely manner to parties responsible for corrective action, including senior management and the board. Source: S-COSO-IC.
- FedRAMP POA&M items must align with SAR "Other Than Satisfied" / risk exposure. The POA&M portrays residual risk to the authorizing official. Source: S-FEDRAMP-POAM.
- SEC 33-8810. Management evaluates severity of each control deficiency. Material weaknesses are disclosed. Significant deficiencies are reported to the audit committee and external auditor. Source: S-SEC-404.
- A finding can exist while the related action remains allowed. Authorization engines do not model that.

## E-12 Attestation is a signed claim about a control or obligation at a time

- **Kind:** domain evidence
- **Decision:** supported
- SOX 404 and SEC rules. Management annually evaluates ICFR effectiveness and discloses the assessment. A registered public accounting firm attests to and reports on that assessment where 404(b) applies. Source: S-SEC-404.
- ServiceNow installs attestation and acknowledgement operations for GRC business users. Source: S-SN-COMP.
- IIA Three Lines. The governing body needs "objective confirmation and assurance on all significant matters independent from responsibility for them." First-line attestation and third-line assurance are different roles. Source: S-IIA-3L.
- An attestation can be stale. An expired certification is a first-class failure mode. See S-22.

## E-13 Freeze and block are temporary world-states that override ordinary permission

- **Kind:** domain evidence
- **Decision:** supported
- OpenBKN documents "automatic downgrade/blocking/secondary confirmation when thresholds are hit" and the month-end freeze rule. Source: S-BKN-FOUNDRY, S-BKN-CLI.
- Palantir markings immediately inherit along file and data dependencies. Applying or removing a marking is called a sensitive action because it can lock out downstream users. Source: S-PAL-MARK.
- A freeze is not a user lacking a role. A user who could act yesterday cannot act during the freeze even with the same role.

## E-14 Remediation and control testing are distinct from design

- **Kind:** domain evidence
- **Decision:** supported
- NIST RMF Assess step. Determine if controls are in place, operating as intended, and producing the desired results. Authorize is a later step. Monitor is continuous. Source: S-NIST-RMF.
- OSCAL assessment plan identifies controls, objectives, and methods in scope. Assessment results record what was actually assessed, which may differ from the plan. Source: S-OSCAL.
- FedRAMP POA&M tracks correction activities and due dates after the SAR. Closing a POA&M item without a retest is a known operational failure mode, not licensed here as correct. Source: S-FEDRAMP-POAM.
- COSO monitoring. Ongoing evaluations and/or separate evaluations, then communication of deficiencies. Source: S-COSO-IC.

## E-15 Regulation effective dates split enactment, force, and application

- **Kind:** domain evidence
- **Decision:** supported
- GDPR Article 99. The regulation enters into force on the twentieth day after publication in the Official Journal. It applies from 25 May 2018. EUR-Lex records Date of effect 24/05/2016 (entry into force) and 25/05/2018 (application). Source: S-GDPR.
- ISO 37301 published 2021-04, confirmed 2026, with Amendment 1 in 2024. Publication, confirmation, and amendment are different events. Source: S-ISO-37301.
- A control tested against today's text can be wrong for a historical action, and a future-dated obligation can exist before it binds. This pressures valid time vs knowledge time. It does not answer `docs/open-questions.md` item 7. That item stays undetermined.

## E-16 ERP approval workflows are source-system artifacts, not a kernel

- **Kind:** source-system artifact
- **Decision:** rejected as a semantic primitive
- ERPNext, Odoo Studio, and SAP Access Request all implement approval as a configurable path over documents or access requests. They disagree on shape. ERPNext maps states onto a three-value docstatus. Odoo gates buttons and stores approval entries. SAP runs SoD analysis inside the request.
- The project already rejects workflow-as-kernel. These sources reinforce that approval *paths* are composition. The durable objects are the approval decision, the bound parameters, and the later effect. See L-12.

## E-17 Mandatory control is not discretionary grant

- **Kind:** domain evidence
- **Decision:** supported
- Palantir. Markings are mandatory. Roles are discretionary. Owner on a PII-marked dataset cannot remove the marking without Expand Access on the marking. Eligibility for a marking after training does not grant Project access. Roles still govern level of access. Source: S-PAL-MARK.
- Moqui. `AUTHZT_ALWAYS` overrides deny. `AUTHZT_ALLOW` is overridden by deny. Inheritable authz plus targeted deny is the documented pattern. Source: S-MOQUI-SEC.
- This is still authorization machinery. It is evidence that "can" splits into eligibility, grant, and mandatory restriction. It is not a GRC control-test object.

## E-18 OpenBKN binds risk to action without making risk a permission bit

- **Kind:** source-system artifact
- **Decision:** hypothesis for OS, supported as OpenBKN behavior
- Spec. Action frontmatter may set `risk_level` and `requires_approval`. RiskType files add control scope, control policy, pre-checks, rollback, audit requirements. Source: S-BKN-SPEC.
- Foundry README. Risk types link to action types. Assessment and simulation run before execution. Threshold hits cause downgrade, block, or second confirmation. Source: S-BKN-FOUNDRY.
- Useful as a candidate composition. Not a kernel pick. Mixed licensing. Extract behavior only.

## E-19 Assurance independence is a role constraint, not an access check

- **Kind:** domain evidence
- **Decision:** supported
- IIA Three Lines. Governing body, management (first- and second-line roles), internal audit (third-line). Minimum governance alignment is accountability, actions, and objective assurance independent from responsibility for those actions. When the CAE assumes second-line work, safeguards must protect independence. Source: S-IIA-3L.
- SOX 404(b). The auditor attests to management's assessment. SEC 33-8809 says an audit restricted to evaluating what management has done may not give enough assurance for an independent opinion. Source: S-SEC-404.
- A principal who performed the control cannot be the sole asserter of its effectiveness. Delegation semantics stay with issue #11. The independence *constraint* is a governance fact.

## E-20 Compliance obligation has a life independent of any one request

- **Kind:** domain evidence
- **Decision:** supported
- ISO 37301. The organization shall establish a CMS that reflects values, objectives, strategy, and compliance risks. Clause 4.5 in the official sample addresses compliance obligations, including outsourced and third-party processes, reviewed periodically and when context changes. Source: S-ISO-37301.
- COSO ICIF applies the same 17 principles to operations, reporting, and compliance objectives. Source: S-COSO-IC.
- An obligation can be unmet while every runtime check still returns allow, if the check was never written. That is the point of a GRC domain.
