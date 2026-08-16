# Attack scenarios

**Kind:** counterexample suite  
**Decision state:** hypothesis as a coverage list. The failures they name are supported by the cited evidence.  
**Fetched:** 2026-08-16

Each scenario is a test a later synthesis or kill-test agent can try to run against the candidate model. Happy paths are not included.

## A1. Privilege escalation by impersonation collapse

**Kind:** counterexample  
**Cites:** E1, E14, E2

A copilot is granted `on_behalf_of` Alice for `CreateTicket` on project Alpha. An implementation copies Alice's full role set onto the copilot and stores no grant object. The copilot then calls `ApprovePayment` on a vendor Alice can approve.

**Expected if the model holds.** Deny. The grant named one action and one project. Copied roles are not a grant.

**Fails if.** Durable agent membership (E2) is treated as "the agent is Alice."

**Variant.** The copilot exchanges a stolen user token at an STS that does not require client authentication. RFC 8693 warns that this turns a compromised token into new tokens. E14.

## A2. Confused deputy

**Kind:** counterexample  
**Cites:** E20, E17, E18, E4

A connector Service holds a standing credential that can write any invoice in the tenant. A SoftwareAgent asks the connector to "attach this file" and supplies an invoice id the agent cannot write. The connector uses its own credential and overwrites the invoice.

This is Hardy's compiler and `(SYSX)BILL`. The deputy has two authorities and cannot say which one it meant.

**Expected if the model holds.** The connector designates the grant it is using. If it uses the agent's grant, the write is denied. If it uses its own grant, the invocation record shows the connector as Actor in `own` mode, and policy on that principal must allow the write. Mixing them without a name is a defect.

**ObjectStack instance.** An action body that drops `ExecutionContext` and hits the empty-principal skip. E18. The deputy is the data engine.

**OpenFGA instance.** A check that trusts a client-supplied `calling_agent` contextual tuple. E4.

## A3. Stale delegation

**Kind:** counterexample  
**Cites:** E3, E5, E21 S-003, E19

At 10:01 an agent receives a 30-minute grant to `Purchase` 1,000 units because stock is 20. A human approves the proposal at 10:07. At 10:06 a receipt of 800 units posted. The grant has not expired.

**Expected if the model holds.** Expiration of the grant is not expiration of the world's assumptions. Commit re-reads state. Submission criteria, or an equivalent constraint, can still fail. Palantir checks criteria at apply time (E19). S-003 already asks this.

**Variant.** The grant expired at 10:05. A caller passes `current_time` in the past. E5 says persisted grant time must win. Deny.

**Variant.** Mid-action revocation. `scenarios/README.md` lists this as a future family. The grant's `revoked_at` is checked on every subsequent effect, not only at first preview.

## A4. Cross-tenant leakage

**Kind:** counterexample  
**Cites:** E9, E17, E7

An agent in tenant Acme is assigned `agent:triage-bot`. Tenant Beta also has `agent:triage-bot`. A shared policy store or a copied SPIFFE path grants the Acme bot read on Beta issues.

**Expected if the model holds.** Principal identifiers are unique and never reused (E7). Workload identities include a trust domain (E9). A colliding trust-domain name does not federate because roots differ. A colliding agent id inside one store is a construction error.

**ObjectStack claim.** Physical one-database-per-environment isolation makes in-kernel cross-tenant automation "not exist." That is a source artifact. It does not excuse a shared identifier scheme if OS ever hosts two organizations in one store.

**Variant.** A wildcard `agent:*` grant. OpenFGA tells you not to do this in production. E2.

## A5. Agent self-approval

**Kind:** counterexample  
**Cites:** E15, E21, Ontologiq note in `research/reference-landscape.md` as secondary

An agent proposes `Purchase` 1,000 units. The same agent identity, or a second SoftwareAgent bound to the same grant, calls `ApprovePurchase` on that proposal. Static SoD says "Requester and Approver roles are exclusive," but both calls used Alice's copied role set.

**Expected if the model holds.** SoD is evaluated on Actor identities and on proposal provenance, not on role names alone. The proposing Actor cannot be the approving Actor. A second agent using the same grant is still the same delegated Actor for this purpose unless a different Party is the second pair of eyes.

**NIST wording.** The two-person rule requires the second user to be a different authorized user. E15.

**History-based variant.** The same Actor must not both create and close the same exception.

## A6. Stolen or replayed grant

**Kind:** counterexample  
**Cites:** E3, E4, E9, E14

Task tuples remain after the task completes. Another agent, or the same agent on a different workload, replays the task id.

**Expected if the model holds.** Tuple cleanup on completion (E3). Bind to agent and to workload. Exchange of a token does not keep the old token alive as a linked grant (E14). Workload API credentials are short-lived SVIDs (E9).

## A7. Sub-delegation widening

**Kind:** counterexample  
**Cites:** E3

A parent grant allows `Read` on folder F. A sub-agent is given a child grant that also allows `Write` on F, or `Read` on folder G.

**Expected if the model holds.** Child scope is a subset of parent scope. OpenFGA's documented options are share-the-task or create a narrower task. Widening is not listed.

## A8. Workload identity used as Party

**Kind:** counterexample  
**Cites:** E9, E10

A purchase order records `provider = spiffe://acme/ns/buyer/sa/bot`. Accounting later cannot say which Organization owes money.

**Expected if the model holds.** The Party is the Organization. The SPIFFE ID belongs on the invocation record.

## A9. Connector credential outlives the grant

**Kind:** counterexample  
**Cites:** E14, E20, E3

The agent's grant expires. The OAuth token the connector obtained by exchange is still valid because token exchange is a one-time event and does not bind lifetimes. E14.

**Expected if the model holds.** Either the issued token's `expires_in` is no later than the grant, or each connector call re-checks the grant. Refresh tokens for user-not-present agents are an explicit, narrower grant, not a silent extension.

## A10. Self-approve by surface fork

**Kind:** counterexample  
**Cites:** E21, E18, E19

The human UI requires a second approver. The MCP tool bound to the same Action does not. The agent calls the tool.

**Expected if the model holds.** Surfaces do not fork meaning. Submission criteria, or the SoD constraint, run on the Action, not on the button.

## Coverage matrix

| Attack family | Scenario | Primary evidence |
| --- | --- | --- |
| Privilege escalation | A1, A7, A10 | E1, E2, E14, E18 |
| Confused deputy | A2, A8 | E20, E17, E18 |
| Stale delegation | A3, A6, A9 | E3, E5, E14, S-003 |
| Cross-tenant leakage | A4 | E7, E9 |
| Agent self-approval | A5, A10 | E15 |

## What these attacks do not settle

They do not choose Cedar versus OpenFGA versus a custom checker. That is Wave B runtime work.

They do not choose whether `task` is a Principal or a context attribute. They only require that the grant exist as a fact the checker can see.
