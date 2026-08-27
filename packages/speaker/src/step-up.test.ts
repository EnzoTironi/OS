import assert from "node:assert/strict";
import test from "node:test";
import {
  completeStepUpCommit,
  createInteractionControlRegistry,
  createMemoryControlStore,
  createStepUpRegistry,
  openStepUpSession,
  principalIdString,
  proposalRef,
  tenantIdString,
  type IssueApprovalControlInput,
} from "./index.js";

function demoActionRef() {
  return {
    actionId: "inventory.requestStock",
    definition: {
      definitionId: "inventory.governed",
      digest: "step-up.test",
      revision: "1",
    },
    resourceId: "inventory.item.1",
  };
}

function stepUpApproval(
  overrides?: Partial<IssueApprovalControlInput>,
): IssueApprovalControlInput {
  return {
    actionBindingId: "action.inventory.requestStock",
    actionRef: demoActionRef(),
    assurance: "oidc_step_up",
    disclosure: { kind: "require_step_up" },
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    principalId: principalIdString("principal.victim"),
    proposalRef: proposalRef("proposal.stepup"),
    sealedAudienceKind: "dm",
    tenantId: tenantIdString("tenant.victim"),
    ...overrides,
  };
}

test("a mismatched authenticate does not reject the victim step-up session", async () => {
  const store = createMemoryControlStore();
  const controls = createInteractionControlRegistry({ store });
  const stepUps = createStepUpRegistry({ store });
  const ref = await controls.issueApproval(stepUpApproval());
  const control = await controls.resolveApproval(ref);
  const opened = await stepUps.open({
    control,
    expiresAt: control.expiresAt,
  });

  await assert.rejects(
    () =>
      stepUps.authenticate({
        controlRef: ref,
        sessionId: opened.id,
        verified: {
          accountId: "account.attacker",
          oidcSubject: "attacker",
          principalId: principalIdString("principal.attacker"),
          tenantId: tenantIdString("tenant.victim"),
        },
      }),
    /wrong_account/,
  );

  const afterAttack = await stepUps.get(opened.id);
  assert.equal(afterAttack.status, "open");
  assert.equal(afterAttack.accountId, undefined);

  const victim = await stepUps.authenticate({
    controlRef: ref,
    sessionId: opened.id,
    verified: {
      accountId: "account.victim",
      oidcSubject: "victim",
      principalId: principalIdString("principal.victim"),
      tenantId: tenantIdString("tenant.victim"),
    },
  });
  assert.equal(victim.status, "authenticated");
  assert.equal(victim.accountId, "account.victim");
});

test("openStepUpSession with the wrong OIDC principal leaves the session live", async () => {
  const store = createMemoryControlStore();
  const controls = createInteractionControlRegistry({ store });
  const stepUps = createStepUpRegistry({ store });
  const ref = await controls.issueApproval(stepUpApproval());

  await assert.rejects(
    () =>
      openStepUpSession({
        controlRef: ref,
        controls,
        oidcBearerVerified: {
          accountId: "account.attacker",
          oidcSubject: "attacker",
          principalId: principalIdString("principal.attacker"),
          tenantId: tenantIdString("tenant.victim"),
        },
        stepUps,
      }),
    /wrong_account/,
  );

  const control = await controls.resolveApproval(ref);
  const session = await stepUps.open({
    control,
    expiresAt: control.expiresAt,
  });
  assert.equal(session.status, "open");
});

test("completeStepUpCommit does not burn the control when commit throws", async () => {
  const store = createMemoryControlStore();
  const controls = createInteractionControlRegistry({ store });
  const stepUps = createStepUpRegistry({ store });
  const ref = await controls.issueApproval(stepUpApproval());
  const control = await controls.resolveApproval(ref);
  const opened = await stepUps.open({
    control,
    expiresAt: control.expiresAt,
  });
  const session = await stepUps.authenticate({
    controlRef: ref,
    sessionId: opened.id,
    verified: {
      accountId: "account.victim",
      oidcSubject: "victim",
      principalId: principalIdString("principal.victim"),
      tenantId: tenantIdString("tenant.victim"),
    },
  });

  await assert.rejects(
    () =>
      completeStepUpCommit({
        commit: async () => {
          throw new Error("commit unavailable");
        },
        controls,
        session,
        stepUps,
      }),
    /commit unavailable/,
  );

  const stillLive = await controls.resolveApproval(ref);
  assert.equal(stillLive.consumedAt, undefined);
  assert.equal((await stepUps.get(session.id)).status, "authenticated");

  const receipt = await completeStepUpCommit({
    commit: async (proposal) => {
      assert.equal(String(proposal), "proposal.stepup");
      return { operationId: "op.retried" };
    },
    controls,
    session,
    stepUps,
  });
  assert.equal(receipt.operationId, "op.retried");
  await assert.rejects(() => controls.resolve(ref), /already consumed/);
  assert.equal((await stepUps.get(session.id)).status, "committed");
});
