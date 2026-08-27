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
  type ControlStore,
  type IssueApprovalControlInput,
  type StepUpSession,
} from "./index.js";

const sealedOperationId = "op.stepup.sealed";

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
    operationId: sealedOperationId,
    principalId: principalIdString("principal.victim"),
    proposalRef: proposalRef("proposal.stepup"),
    sealedAudienceKind: "dm",
    tenantId: tenantIdString("tenant.victim"),
    ...overrides,
  };
}

async function authenticatedSession(input?: {
  readonly store?: ControlStore;
  readonly approval?: IssueApprovalControlInput;
}): Promise<{
  controls: ReturnType<typeof createInteractionControlRegistry>;
  session: StepUpSession;
  stepUps: ReturnType<typeof createStepUpRegistry>;
  store: ControlStore;
}> {
  const store = input?.store ?? createMemoryControlStore();
  const controls = createInteractionControlRegistry({ store });
  const stepUps = createStepUpRegistry({ store });
  const ref = await controls.issueApproval(input?.approval ?? stepUpApproval());
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
  return { controls, session, stepUps, store };
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

test("open does not reuse a leftover rejected durable row", async () => {
  const store = createMemoryControlStore();
  const controls = createInteractionControlRegistry({ store });
  const stepUps = createStepUpRegistry({ store });
  const ref = await controls.issueApproval(stepUpApproval());
  const control = await controls.resolveApproval(ref);
  await store.putStepUp({
    controlRef: control.ref,
    expiresAt: control.expiresAt,
    id: control.ref as unknown as StepUpSession["id"],
    operationId: sealedOperationId,
    proposalRef: control.proposalRef,
    requiredPrincipalId: control.principalId,
    status: "rejected" as unknown as StepUpSession["status"],
    tenantId: control.tenantId,
  });

  const opened = await stepUps.open({
    control,
    expiresAt: control.expiresAt,
  });
  assert.notEqual(String(opened.id), String(control.ref));
  assert.equal(opened.status, "open");
});

test("completeStepUpCommit requires a sealed operationId", async () => {
  const ready = await authenticatedSession({
    approval: stepUpApproval({ operationId: undefined }),
  });
  await assert.rejects(
    () =>
      completeStepUpCommit({
        commit: async (_proposal, operationId) => ({ operationId }),
        controls: ready.controls,
        session: ready.session,
        stepUps: ready.stepUps,
      }),
    /missing sealed operationId/,
  );
  const stillLive = await ready.controls.resolveApproval(
    ready.session.controlRef,
  );
  assert.equal(stillLive.consumedAt, undefined);
});

test("completeStepUpCommit does not burn the control when commit throws", async () => {
  const ready = await authenticatedSession();
  await assert.rejects(
    () =>
      completeStepUpCommit({
        commit: async () => {
          throw new Error("commit unavailable");
        },
        controls: ready.controls,
        session: ready.session,
        stepUps: ready.stepUps,
      }),
    /commit unavailable/,
  );

  const stillLive = await ready.controls.resolveApproval(
    ready.session.controlRef,
  );
  assert.equal(stillLive.consumedAt, undefined);
  assert.equal((await ready.stepUps.get(ready.session.id)).status, "authenticated");

  const seen: string[] = [];
  const receipt = await completeStepUpCommit({
    commit: async (proposal, operationId) => {
      assert.equal(String(proposal), "proposal.stepup");
      seen.push(operationId);
      return { operationId };
    },
    controls: ready.controls,
    session: ready.session,
    stepUps: ready.stepUps,
  });
  assert.deepEqual(seen, [sealedOperationId]);
  assert.equal(receipt.operationId, sealedOperationId);
  await assert.rejects(
    () => ready.controls.resolve(ready.session.controlRef),
    /already consumed/,
  );
  assert.equal((await ready.stepUps.get(ready.session.id)).status, "committed");
});

test("completeStepUpCommit retry after consume throw replays the sealed operation", async () => {
  let consumeAttempts = 0;
  const inner = createMemoryControlStore();
  const store: ControlStore = {
    consumeControl: async (ref, consumedAt, operationId) => {
      consumeAttempts += 1;
      if (consumeAttempts === 1) {
        throw new Error("consume down");
      }
      return inner.consumeControl(ref, consumedAt, operationId);
    },
    findStepUpByControl: (ref) => inner.findStepUpByControl(ref),
    getControl: (ref) => inner.getControl(ref),
    getStepUp: (id) => inner.getStepUp(id),
    listControls: (input) => inner.listControls(input),
    putControl: (control) => inner.putControl(control),
    putStepUp: (session) => inner.putStepUp(session),
  };
  const ready = await authenticatedSession({ store });
  const seen: string[] = [];
  const commit = async (_proposal: string, operationId: string) => {
    seen.push(operationId);
    return { operationId };
  };

  await assert.rejects(
    () =>
      completeStepUpCommit({
        commit,
        controls: ready.controls,
        session: ready.session,
        stepUps: ready.stepUps,
      }),
    /consume down/,
  );
  const receipt = await completeStepUpCommit({
    commit,
    controls: ready.controls,
    session: ready.session,
    stepUps: ready.stepUps,
  });
  assert.deepEqual(seen, [sealedOperationId, sealedOperationId]);
  assert.equal(receipt.operationId, sealedOperationId);
  assert.equal(consumeAttempts, 2);
});

test("overlapping completeStepUpCommit replays one sealed operation", async () => {
  let entered = 0;
  let releaseFirst: (() => void) | undefined;
  const store = createMemoryControlStore({
    beforeConsumeCommit: async () => {
      entered += 1;
      if (entered === 1) {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
        return;
      }
      releaseFirst?.();
    },
  });
  const ready = await authenticatedSession({ store });
  const seen: string[] = [];
  const commit = async (_proposal: string, operationId: string) => {
    seen.push(operationId);
    return { operationId };
  };
  const results = await Promise.all([
    completeStepUpCommit({
      commit,
      controls: ready.controls,
      session: ready.session,
      stepUps: ready.stepUps,
    }),
    completeStepUpCommit({
      commit,
      controls: ready.controls,
      session: ready.session,
      stepUps: ready.stepUps,
    }),
  ]);
  assert.deepEqual(
    results.map((result) => result.operationId),
    [sealedOperationId, sealedOperationId],
  );
  assert.deepEqual(seen, [sealedOperationId, sealedOperationId]);
  assert.equal((await ready.stepUps.get(ready.session.id)).status, "committed");
});
