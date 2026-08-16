# Convergence matrix

**Kind:** domain evidence (the matrix) plus source-system artifact (cells)  
**Decision:** none per cell. Cell marks are `yes`, `no`, `partial`, `undetermined`.

A `yes` means the source makes the distinction as a first-class idea in a document fetched this session. It is not a feature score.

| Distinction | COSO IC / ERM | ISO 31000 / 37301 | NIST RMF / 800-53 / OSCAL / FedRAMP | IIA 3 Lines / SOX 404 | Cedar / OpenFGA / OPA | OpenBKN | Palantir | ServiceNow GRC | SAP AC | ERPNext / Odoo / Moqui |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Risk type ≠ current assessment | yes (ERM appetite, portfolio) | yes (31000 process) | yes (assess vs authorize vs monitor) | partial (assurance over management's risk work) | no | yes (RiskType vs risk_level) | undetermined | yes (exception risk assessment) | yes (access risk vs analysis run) | no |
| Control as designed safeguard | yes | partial (37301 CMS) | yes | yes (ICFR) | no | partial (control policy on RiskType) | partial (marking as mandatory control) | yes | yes (Process Control named, not deep-read) | no |
| Policy obligation as lasting object | yes (policies and procedures) | yes (37301 4.5) | yes (requirements → controls) | yes | no | partial (control policy text) | no | yes (Policy + Exception tables) | partial | no |
| Runtime allow/deny engine | no | no | no | no | yes | partial (risk eval allowed flag) | yes (roles + markings) | no | partial (provisioning) | yes (perms / artifact authz) |
| Approval as decision before effect | yes (authorizations and approvals as control activities) | no | yes (ATO is risk acceptance) | yes (management vs auditor) | no | yes (`requires_approval`) | yes (request / invoke) | yes | yes (ARQ) | yes (workflow / Studio) |
| Temporary exception / waiver | partial (alternative controls when SOD impractical) | undetermined (full 37301 paywalled) | yes (POA&M, operational requirement) | partial (deficiency not waiver) | no | undetermined | undetermined | yes | yes (mitigating control) | no |
| Segregation of duties | yes | undetermined | partial (AC family, not deep-read) | yes (ICFR) | expressible, not an object | undetermined | undetermined | undetermined | yes | undetermined |
| Limit / threshold changes path | undetermined | undetermined | undetermined | undetermined | expressible | yes (threshold, freeze) | undetermined | undetermined | undetermined | yes (amount conditions) |
| Case / investigation isolation | no | no | no | no | no | no | yes (case markings, scoped sessions) | undetermined | no | no |
| Audit finding / deficiency | yes | undetermined | yes (SAR, POA&M) | yes (material weakness) | no | partial (audit requirements) | undetermined | yes (issues) | yes (violations) | no |
| Compliance evidence | yes (quality information) | yes (evaluate CMS) | yes (authorization package) | yes | no | partial | partial (approvals persist as audit log) | yes | yes | partial (chatter / entries) |
| Attestation / certification | yes | yes (37301 certifiable) | partial (authorization package) | yes (404(a)/(b)) | no | no | no | yes | yes (UAR / SoD review) | no |
| Freeze / block overlay | no | no | no | no | expressible | yes | yes (marking lockout) | undetermined | partial (firefighter after block) | no |
| Remediation plan | yes (corrective action) | undetermined | yes (POA&M) | yes | no | yes (rollback plan) | undetermined | yes | yes | no |
| Control testing ≠ design | yes (monitoring) | undetermined | yes (assess / 800-53A implied) | yes | no | partial (pre-checks) | undetermined | yes | yes (named) | no |
| Regulation force ≠ application date | no | partial (pub / confirm / amend) | no | no | no | no | no | undetermined | no | no |
| Mandatory vs discretionary access | no | no | no | no | no | no | yes | no | no | partial (ALWAYS vs ALLOW vs DENY) |
| Approved but not yet invoked | no | no | no | no | no | undetermined | yes | undetermined | undetermined | partial (Odoo approve-for-another) |
| Workflow engine as kernel | n/a | n/a | n/a | n/a | n/a | spec says runtime workflows are platform, not BKN | Approvals app is a product | workflow product | MSMP named, not adopted | source artifact only |

## Divergence notes

### D-01 What "authorization" means

- **Kind:** domain evidence
- **Decision:** supported as a disagreement
- NIST/FedRAMP authorization is a senior official accepting residual risk for a *system* to operate, with a package of SSP/SAP/SAR/POA&M.
- Cedar/OpenFGA/OPA authorization is a per-request allow/deny (or structured decision).
- Palantir Approvals "authorization" is a human invoke of a change request.
- Using one word for all three is how the OS `Policy` primitive will get overloaded. Keep them separate in notes even if RFC-0001 still uses one name.

### D-02 Where approval lives

- **Kind:** source-system artifact
- **Decision:** undetermined for OS placement
- ERPNext binds approval to document states.
- Odoo binds approval to buttons and stores entries.
- Palantir binds approval to a request of tasks, then a separate invoke.
- OpenBKN binds `requires_approval` to an action type.
- NIST binds authorization to a system and common-control set.
- These are different hosts for a similar human judgment. Do not pick a host yet.

### D-03 Can a policy engine emit obligations

- **Kind:** runtime consequence
- **Decision:** undetermined
- OPA first-party docs say decisions may be arbitrary structured data. They do not define an `obligations` field.
- Secondary write-ups claim Cedar has native obligations and OPA can return an obligations key. Those claims were not confirmed in the Cedar guide fetched this session. Mark Cedar-native obligations `undetermined`.
- Even if an engine returns "log this" or "redact that," ISO 37301 and SOX still need a durable obligation *object* and later evidence. Structured output is not a CMS.

### D-04 Vendor GRC suites not fetched

- **Kind:** source-system artifact
- **Decision:** undetermined
- Archer, MetricStream, Diligent, Workiva, COBIT 2019. Cells that would have used them stay empty. Do not invent convergence from analyst blogs.

## Cross-issue pointers

| Topic | Owner | This folder's use |
| --- | --- | --- |
| Principal, delegation, `as` / `on behalf of` | #11 | Independence of asserter (E-19) cites the constraint only |
| CRM case, SLA clock | #27 | Palantir case markings are isolation, not a ticket clock |
| Fiscal filing calendar | #30 | GDPR-style force vs apply is the pattern. Filing due dates stay #30 |
