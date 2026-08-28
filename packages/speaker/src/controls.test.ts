import assert from "node:assert/strict";
import test from "node:test";
import {
  createInteractionControlRegistry,
  createMemoryControlStore,
  createPostgresControlStore,
  createStepUpRegistry,
  principalIdString,
  proposalRef,
  tenantIdString,
  type IssueApprovalControlInput,
  type PostgresControlStoreClient,
} from "./index.js";

function demoActionRef() {
  return {
    actionId: "inventory.requestStock",
    definition: {
      definitionId: "inventory.governed",
      digest: "controls.test",
      revision: "1",
    },
    resourceId: "inventory.item.1",
  };
}

function approvalInput(
  overrides?: Partial<IssueApprovalControlInput>,
): IssueApprovalControlInput {
  return {
    actionBindingId: "action.inventory.requestStock",
    actionRef: demoActionRef(),
    assurance: "channel_inline",
    disclosure: { kind: "deliver_full" },
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    operationId: "op.sealed.1",
    principalId: principalIdString("principal.a"),
    proposalRef: proposalRef("proposal.1"),
    sealedAudienceKind: "dm",
    tenantId: tenantIdString("tenant.a"),
    ...overrides,
  };
}

function overlappingConsumeLatch() {
  let entered = 0;
  let releaseFirst: (() => void) | undefined;
  return async () => {
    entered += 1;
    if (entered === 1) {
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      return;
    }
    releaseFirst?.();
  };
}

test("createInteractionControlRegistry requires an explicit store", async () => {
  const store = createMemoryControlStore();
  const controls = createInteractionControlRegistry({ store });
  const ref = await controls.issue({
    actionBindingId: "binding.1",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    kind: "approval",
    principalId: principalIdString("principal.a"),
    proposalRef: "proposal.1",
    tenantId: tenantIdString("tenant.a"),
  });
  const live = await controls.resolve(ref);
  assert.equal(live.principalId, "principal.a");
});

test("createStepUpRegistry requires an explicit store", async () => {
  const store = createMemoryControlStore();
  const stepUps = createStepUpRegistry({ store });
  assert.equal(typeof stepUps.open, "function");
});

test("overlapping consume lets only one winner treat the approval as live", async () => {
  const controls = createInteractionControlRegistry({
    store: createMemoryControlStore({
      beforeConsumeCommit: overlappingConsumeLatch(),
    }),
  });
  const ref = await controls.issueApproval(approvalInput());
  const results = await Promise.allSettled([
    controls.consume(ref),
    controls.consume(ref),
  ]);
  const fulfilled = results.filter((result) => result.status === "fulfilled");
  const failed = results.filter((result) => result.status === "rejected");
  assert.equal(fulfilled.length, 1);
  assert.equal(failed.length, 1);
  const failure = failed[0];
  assert.ok(failure !== undefined && failure.status === "rejected");
  assert.match(String(failure.reason), /already consumed/);
  await assert.rejects(() => controls.resolve(ref), /already consumed/);
});

test("listLiveApprovals reads the durable store after a new registry is created", async () => {
  const store = createMemoryControlStore();
  const issuer = createInteractionControlRegistry({ store });
  const tenantId = tenantIdString("tenant.a");
  const principalId = principalIdString("principal.a");
  const liveRef = await issuer.issueApproval(approvalInput());
  await issuer.issueApproval(
    approvalInput({
      principalId: principalIdString("principal.other"),
      proposalRef: proposalRef("proposal.other"),
      tenantId: tenantIdString("tenant.other"),
    }),
  );
  const expiredRef = await issuer.issueApproval(
    approvalInput({
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
      proposalRef: proposalRef("proposal.expired"),
    }),
  );
  const consumedRef = await issuer.issueApproval(
    approvalInput({ proposalRef: proposalRef("proposal.consumed") }),
  );
  await issuer.consume(consumedRef);
  await issuer.issue({
    actionBindingId: "binding.plain",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    kind: "approval",
    principalId,
    proposalRef: "proposal.plain",
    tenantId,
  });

  const restarted = createInteractionControlRegistry({ store });
  const live = await restarted.listLiveApprovals({
    principalId,
    tenantId,
  });
  assert.deepEqual(
    live.map((control) => String(control.ref)),
    [String(liveRef)],
  );
  await assert.rejects(() => restarted.resolve(expiredRef), /expired/);
  await assert.rejects(() => restarted.resolve(consumedRef), /already consumed/);
});

test("putControl cannot un-consume a live consume winner", async () => {
  const store = createMemoryControlStore();
  const controls = createInteractionControlRegistry({ store });
  const ref = await controls.issueApproval(approvalInput());
  const consumed = await controls.consume(ref);
  await store.putControl({ ...consumed, consumedAt: undefined });
  await assert.rejects(() => controls.resolve(ref), /already consumed/);
});

test("overlapping postgres consume UPDATEs leave one winner", async () => {
  const rows = new Map<
    string,
    {
      payload: Record<string, unknown>;
      principalId: string;
      tenantId: string;
    }
  >();
  const queries: string[] = [];
  let consumeUpdates = 0;
  let releaseFirst: (() => void) | undefined;
  const applyConsume = (values: readonly unknown[]) => {
    const ref = String(values[0]);
    const consumedAt = String(values[1]);
    const operationId =
      values[2] === null || values[2] === undefined
        ? undefined
        : String(values[2]);
    const row = rows.get(ref);
    if (row === undefined) {
      return { rows: [] };
    }
    const payloadConsumed =
      typeof row.payload.consumedAt === "string"
        ? row.payload.consumedAt
        : undefined;
    const expiresAt = String(row.payload.expiresAt ?? "");
    const live =
      payloadConsumed === undefined &&
      Date.parse(expiresAt) > Date.parse(consumedAt);
    const replay =
      payloadConsumed !== undefined &&
      operationId !== undefined &&
      row.payload.operationId === operationId;
    if (!live && !replay) {
      return { rows: [] };
    }
    if (live) {
      row.payload = { ...row.payload, consumedAt };
    }
    return { rows: [{ payload: row.payload }] };
  };
  const client: PostgresControlStoreClient = {
    async query(text, values = []) {
      queries.push(text);
      if (text.includes("INSERT INTO interaction_controls")) {
        const payload = JSON.parse(String(values[13])) as Record<
          string,
          unknown
        >;
        rows.set(String(values[0]), {
          payload,
          principalId: String(values[2]),
          tenantId: String(values[1]),
        });
        return { rows: [] };
      }
      if (text.includes("jsonb_set") && text.includes("consumedAt")) {
        consumeUpdates += 1;
        if (consumeUpdates === 1) {
          await new Promise<void>((resolve) => {
            releaseFirst = resolve;
          });
        } else {
          releaseFirst?.();
        }
        return applyConsume(values);
      }
      if (text.includes("WHERE ref = $1")) {
        const row = rows.get(String(values[0]));
        return { rows: row === undefined ? [] : [{ payload: row.payload }] };
      }
      if (text.includes("payload->>'consumedAt' IS NULL")) {
        return {
          rows: [...rows.values()]
            .filter(
              (row) =>
                row.tenantId === values[0] &&
                row.principalId === values[1] &&
                row.payload.consumedAt === undefined,
            )
            .map((row) => ({ payload: row.payload })),
        };
      }
      throw new Error(`unexpected query: ${text}`);
    },
  };

  const store = createPostgresControlStore(client);
  const controls = createInteractionControlRegistry({ store });
  const ref = await controls.issueApproval(approvalInput());
  const results = await Promise.allSettled([
    controls.consume(ref),
    controls.consume(ref),
  ]);
  const fulfilled = results.filter((result) => result.status === "fulfilled");
  const failed = results.filter((result) => result.status === "rejected");
  assert.equal(consumeUpdates, 2);
  assert.equal(fulfilled.length, 1);
  assert.equal(failed.length, 1);
  assert.equal(
    queries.some(
      (query) =>
        query.includes("jsonb_set") &&
        query.includes("payload->>'consumedAt' IS NULL"),
    ),
    true,
  );

  const other = createInteractionControlRegistry({ store });
  const listed = await other.listLiveApprovals({
    principalId: principalIdString("principal.a"),
    tenantId: tenantIdString("tenant.a"),
  });
  assert.deepEqual(listed, []);
});
