# Candidate laws

**Kind:** candidate law (each card)  
**Fetched:** 2026-08-16

Smallest claims that explain the evidence. Each names what would kill it. None is accepted.

## L-01 Runtime authorization and governance objects are different jobs

- **Decision:** supported for the job split. **undetermined** for shared identity under one OS `Policy` name.
- **Claim:** A per-request allow/deny (or structured decision) is not the same kind of thing as a risk, control, obligation, exception, finding, attestation, or POA&M.
- **Why:** E-01, E-02, E-03, E-20. Cedar/OpenFGA/OPA first-party pages never introduce those GRC objects. COSO/NIST/ServiceNow/ISO 37301 never reduce them to a request check.
- **Falsify:** Find an independent first-party source that treats a waiver, a material weakness, and a Cedar allow as one identity with one lifecycle.
- **Runtime consequence:** If this job split survives, a kernel that only evaluates Policy-as-function-to-bool cannot reconstruct why a process was allowed last year under an expired waiver. Wave B engines are out of scope. The pressure is semantic.

## L-02 Risk type is not a risk assessment instance

- **Decision:** supported
- **Claim:** A catalogued risk kind (what can go wrong, how it is managed) is distinct from a dated assessment of a subject against that kind.
- **Why:** E-04. ISO 31000 process, COSO ERM portfolio, OpenBKN RiskType vs `risk_level`, ServiceNow exception risk assessment.
- **Falsify:** A mature GRC or ERM source that stores only assessments and has no reusable type, or only types and never instances, without losing residual-risk history.
- **Runtime consequence:** Assessment records need valid time and assessor provenance. Types need a slower lifecycle.

## L-03 Control is designed, implemented, and tested. Those are three facts

- **Decision:** supported
- **Claim:** "Control C exists" does not imply "C is implemented here" or "C operated effectively in period P."
- **Why:** E-05, E-14, LIF-04. NIST Assess asks in place / operating as intended / producing desired results. COSO present and functioning. OSCAL plan vs results.
- **Falsify:** A source that treats a control catalog entry as automatically effective once selected.
- **Runtime consequence:** An allow at t1 does not prove operating effectiveness at t1.

## L-04 An obligation outlives any one decision about it

- **Decision:** supported
- **Claim:** A compliance obligation remains in the model while exceptions, attestations, and findings come and go.
- **Why:** E-07, E-20, ISO 37301 4.5, ServiceNow exception overlay, FedRAMP OR still on the POA&M.
- **Falsify:** A first-party CMS that deletes the obligation row when a waiver is approved.
- **Runtime consequence:** Exception expiry must restore the bind without recreating the obligation.

## L-05 Approval binds a judgment. It does not bind the future world

- **Decision:** supported
- **Claim:** An approval is a recorded decision over some bound (actor, object, parameters, assumptions). Invoke or commit can still fail or require revalidation.
- **Why:** E-06. Palantir approved-but-not-invocable. Odoo revoke. `scenarios/README.md` S-003 stale approval. Constitution item 8.
- **Falsify:** A source where approval is defined as the effect itself, with no later apply step and no stale-world problem in production use.
- **Runtime consequence:** Preview/approve/re-read/execute remains a live pattern. Ontologiq in `research/reference-landscape.md` already pointed here. This folder adds Palantir invoke and Odoo revoke as independent pressure.

## L-06 Exception is accepted residual risk for a window, not a deleted rule

- **Decision:** supported
- **Claim:** A waiver or mitigating control records who accepted how much residual risk, on which obligation, until when.
- **Why:** E-07, E-08, ServiceNow residual score, SAP mitigating control, FedRAMP OR rules.
- **Falsify:** A GRC source that implements exception as "policy disabled" with no residual, owner, or end date.
- **Runtime consequence:** Checks during the window must see the overlay *and* the underlying obligation. After the window they must not.

## L-07 SOD is a prohibition over combinations of powers, often lived with

- **Decision:** supported
- **Claim:** Some powers must not be jointly exercisable by one principal. When they are, the domain records a risk plus a mitigating control or emergency path, not silence.
- **Why:** E-08, COSO alternative controls, SAP ARA/ARQ/firefighter/UAR.
- **Falsify:** An enterprise source that treats SOD as ordinary RBAC with no residual-risk object when conflicts remain.
- **Runtime consequence:** An allow of each power separately can still be a SOD failure. Pairwise (or n-wise) evaluation is required. Principal identity is issue #11.

## L-08 A limit is a predicate that changes the required path

- **Decision:** supported
- **Claim:** Crossing a threshold does not itself approve, deny, or post. It selects a stricter governance path (extra approval, freeze, exception, block).
- **Why:** E-09, ERPNext amount conditions, OpenBKN freeze rule.
- **Falsify:** A source where the limit *is* the approval record.
- **Runtime consequence:** The same Action type can be free below the limit and governed above it. The Action definition is not enough.

## L-09 Finding and deny are not interchangeable

- **Decision:** supported
- **Claim:** A deficiency can be open while the related operation remains allowed, and an operation can be denied with no finding on file.
- **Why:** E-11, ATO with open POA&M items, SEC material weakness while the company still operates.
- **Falsify:** A source that models every finding as a runtime deny and every deny as a finding.
- **Runtime consequence:** Authorization logs cannot substitute for a finding register.

## L-10 Attestation is a claim with an expiry, not a permission bit

- **Decision:** supported
- **Claim:** Someone asserts that a subject held a property in a period. Independent assurance may repeat the claim. Both can expire or be withdrawn.
- **Why:** E-12, E-19, SOX 404(a)/(b), IIA independence, ServiceNow campaigns.
- **Falsify:** A source that treats "certified" as a permanent role.
- **Runtime consequence:** Expired certification can block an Action that the principal is still authorized to attempt. Two different reads.

## L-11 Legal force, application, and knowledge time are different clocks

- **Decision:** supported as a domain distinction. **undetermined** as an answer to `docs/open-questions.md` item 7.
- **Claim:** Enactment, entry into force, application, amendment, and repeal can be different instants. A historical Action must be explainable under the instrument that applied then.
- **Why:** E-15, GDPR Article 99.
- **Falsify:** A regulation family that uses one date for force and application *and* never needs the split in audit. One counterexample family does not kill the claim. A showing that no regulated process needs the split would.
- **Runtime consequence:** Control libraries and obligation sets need effectivity. This is not a storage-engine choice.

## L-12 Workflow is not a semantic primitive

- **Decision:** rejected (reaffirmed)
- **Claim:** A configurable state machine over documents is a hosting pattern, not a domain kind.
- **Why:** E-16. ERPNext, Odoo, SAP, Palantir Approvals, and BKN spec ("runtime capabilities such as ... workflows are provided by platforms that consume BKN models") all implement paths. They do not converge on one workflow ontology. RFC-0001 already excludes Workflow as a primitive. Do not silently accept it here.
- **Falsify:** Independent domains that cannot express approval, exception, and remediation without a native workflow kind. Not shown.
- **Runtime consequence:** Compose Actions, recorded decisions, and validity windows. Do not add Workflow to the RFC list from this issue.

## L-13 Cedar, OpenFGA, and OPA are evidence of an enforcement *job*, not a kernel pick

- **Decision:** rejected as OS kernel. **undetermined** as a later runtime library.
- **Claim:** Wave A must not select an authorization product as the OS semantic core.
- **Why:** Standing order 7. E-01 shows they cover only the request-time job. L-01's GRC objects are out of their first-party models.
- **Falsify:** Not a Wave A question.
- **Runtime consequence:** Wave B may evaluate them as *enforcers* of some OS Policy form. They must not become the place GRC objects live.

## L-14 Mandatory restriction, discretionary grant, and eligibility are three facts

- **Decision:** supported as a distinction. **hypothesis** that OS needs all three as first-class.
- **Claim:** "May see PII" (eligibility after training), "is Viewer on Project F" (discretionary grant), and "PII marking cannot be removed without Expand Access" (mandatory restriction) can diverge.
- **Why:** E-17, Palantir markings vs roles, Moqui ALWAYS/ALLOW/DENY.
- **Falsify:** A source where one relation tuple always implies the other two.
- **Runtime consequence:** OpenFGA can encode all three as relations. That encoding is a source-system artifact, not proof they are one concept.

## L-15 Assurer independence is a constraint on who may attest

- **Decision:** supported
- **Claim:** The party responsible for a control or action cannot be the sole independent assurer of that control or action.
- **Why:** E-19, IIA third line, SOX 404(b), SEC 33-8809.
- **Falsify:** A regulated process that treats performer self-attestation as equivalent to independent attestation with no extra disclosure.
- **Runtime consequence:** Policy-as-allow is the wrong tool. This is a constraint over principals and roles. Identity mechanics stay with #11.

## L-16 Investigation isolation is a governance object, not a CRM case

- **Decision:** supported as a split. CRM lifecycle stays #27.
- **Claim:** Some investigations require a unique visibility boundary that travels with derived evidence and must not mix with sibling investigations.
- **Why:** E-10, Palantir case markings and scoped sessions.
- **Falsify:** A first-party investigation system that isolates only by ordinary CRM assignment and never by a traveling mandatory marking.
- **Runtime consequence:** Ordinary role checks leak if derived datasets drop the case boundary.

## Laws not proposed

No law here says OS must add Risk, Control, Waiver, Finding, or Attestation as metamodel primitives. Constitution item 1. Composition may hold. The laws constrain whatever composition is tried.
