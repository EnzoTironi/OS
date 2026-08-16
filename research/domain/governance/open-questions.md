# Open questions

**Kind:** mixed  
**Decision:** undetermined unless a card says otherwise  
**Rule:** this file does not answer `docs/open-questions.md`. It points at artifacts in this folder or leaves the item unmarked.

## Q-G01 Is OS `Policy` the same identity as a GRC policy object

- **Kind:** candidate law (identity question)
- **Decision:** undetermined
- RFC-0001 hypothesizes Policy as an authority decision over principal, action, resource, context. COSO uses "policies and procedures" to deploy control activities. ISO 37301 manages compliance obligations. ServiceNow stores Policy and Policy Exception as tables. Cedar uses Policy for allow/deny rules.
- Independent sources agree the *jobs* differ (L-01). They do not agree on one identity.
- **Cite:** `evidence.md` E-03, `candidate-laws.md` L-01, `matrix.md` D-01.
- Do not edit RFC-0001 from this folder.

## Q-G02 Where does an approval live

- **Kind:** domain evidence
- **Decision:** undetermined
- Hosts observed. Document state (ERPNext). Button gate plus entry (Odoo). Request of tasks plus invoke (Palantir). Action-type flag (OpenBKN). System-level risk acceptance (NIST ATO).
- **Cite:** `matrix.md` D-02, `lifecycle.md` LIF-01, `candidate-laws.md` L-05, L-12.
- L-12 rejects workflow-as-kernel. That rejection does not pick a host.

## Q-G03 How do overlays compose

- **Kind:** candidate law
- **Decision:** undetermined
- Freeze, waiver, marking, SoD mitigation, and firefighter can be in force together. S-G25 has no first-party winner.
- **Cite:** `scenarios.md` S-G25, S-G13, S-G14, S-G15.

## Q-G04 Does a policy engine obligation field replace a CMS

- **Kind:** runtime consequence
- **Decision:** undetermined, leaning no on present evidence
- OPA allows structured output. Cedar-native obligations were not confirmed in the guide fetched this session. Even a well-enforced "log this" is not an ISO 37301 obligation register.
- **Cite:** `matrix.md` D-03, `scenarios.md` S-G28, `sources.md` S-OPA, S-CEDAR.

## Q-G05 Which governance kinds, if any, become metamodel primitives

- **Kind:** candidate law
- **Decision:** undetermined
- Constitution item 1. L-02 through L-11 constrain composition. They do not earn Risk, Control, Waiver, Finding, or Attestation a primitive slot.
- Wave C / issue #70 consumes this folder. This worker does not promote.

## Q-G06 How should legal effectivity meet bitemporality

- **Kind:** domain evidence
- **Decision:** undetermined as an answer to `docs/open-questions.md` item 7
- GDPR Article 99 splits force and apply. S-G10 and S-G22 need both legal clocks and knowledge time. That is pressure, not a design.
- **Cite:** `evidence.md` E-15, `candidate-laws.md` L-11, `scenarios.md` S-G10, S-G22.
- Item 7 in `docs/open-questions.md` remains open.

## Q-G07 How should assurer independence be expressed without owning principals

- **Kind:** domain evidence
- **Decision:** undetermined
- L-15 is supported as a constraint. The representation of "this principal must not be that principal" is issue #11.
- **Cite:** `evidence.md` E-19, `scenarios.md` S-G23.

## Q-G08 Are case markings in scope of CRM research

- **Kind:** domain evidence
- **Decision:** rejected as a fold into #27. Isolation stays here as a pointer.
- Palantir case markings are mandatory visibility boundaries. CRM case/SLA clocks are issue #27.
- **Cite:** `evidence.md` E-10, `lifecycle.md` LIF-09, `scenarios.md` S-G17.

## Q-G09 Fiscal calendars vs regulation clocks

- **Kind:** domain evidence
- **Decision:** undetermined for shared machinery
- Filing due dates are issue #30. Instrument force/apply is this folder. Whether one effectivity mechanism serves both is not shown.
- **Cite:** L-11. Do not invent a shared type.

## Q-G10 Vendor GRC object models not fetched

- **Kind:** source-system artifact
- **Decision:** undetermined
- Archer, MetricStream, Diligent, Workiva, COBIT 2019, full ISO 37301, NIST IR 8286, PCI DSS, ISO 27001. A later pass can fill `matrix.md` cells. Absence is not disagreement.

## Pointers into `docs/open-questions.md` (not answers)

| Docs item | Why this folder touches it | State left on the docs item |
| --- | --- | --- |
| 4 Action (approval bind, revalidate) | L-05, S-G05, S-G11, S-G32 | undetermined |
| 7 Bitemporality | L-11, S-G10, S-G22 | undetermined |
| 8 Provenance | Attestation and finding need asserter and evidence. No PROV-O mapping chosen | undetermined |
| 9 Function / Constraint / Policy | L-01, Q-G01 | undetermined |
| 11 Actors and principals | L-15, Q-G07, exclusive approval | owned by #11 |
| 15 Ontology vs runtime | L-13. Cedar/OpenFGA are not the kernel | undetermined |

## New semantic question

No new GitHub issue. Q-G01 is the issue #67 question restated. Q-G03 (overlay composition) is the only genuinely new fork. It can stay in this folder until a source family disagrees in a way that changes other tracks.
