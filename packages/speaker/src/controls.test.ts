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
  type ControlStore,
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
    principalId: principalIdString("principal.a"),
    proposalRef: proposalRef("proposal.1"),
    sealedAudienceKind: "dm",
    tenantId: tenantIdString("tenant.a"),
    ...overrides,
  };
}

function yieldingReads(inner: ControlStore): ControlStore {
  const pause = async () =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, 20);
    });
  return {
    consumeControl: (ref, consumedAt) => inner.consumeControl(ref, consumedAt),
    findStepUpByControl: (ref) => inner.findStepUpByControl(ref),
    async getControl(ref) {
      const entry = await inner.getControl(ref);
      await pause();
      return entry;
    },
    getStepUp: (id) => inner.getStepUp(id),
    listControls: (input) => inner.listControls(input),
    async putControl(control) {
      await pause();
      await inner.putControl(control);
    },
    putStepUp: (session) => inner.putStepUp(session),
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

test("concurrent consume lets only one winner treat the approval as live", async () => {
  const controls = createInteractionControlRegistry({
    store: yieldingReads(createMemoryControlStore()),
  });
  const ref = await controls.issueApproval(approvalInput());
  const results = await Promise.allSettled([
    controls.consume(ref),
    controls.consume(ref),
  ]);
  const fulfilled = results.filter((result) => result.status === "fulfilled");
  const rejected = results.filter((result) => result.status === "rejected");
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  const failure = rejected[0];
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

test("postgres consumeControl compare-and-set rejects the second winner", async () => {
  const rows = new Map<
    string,
    {
      consumedAt: string | null;
      expiresAt: string;
      payload: Record<string, unknown>;
      principalId: string;
      tenantId: string;
    }
  >();
  const queries: string[] = [];
  const client: PostgresControlStoreClient = {
    async query(text, values = []) {
      queries.push(text);
      if (text.includes("INSERT INTO interaction_controls")) {
        const payload = JSON.parse(String(values[13])) as Record<string, unknown>;
        rows.set(String(values[0]), {
          consumedAt:
            typeof payload.consumedAt === "string" ? payload.consumedAt : null,
          expiresAt: String(values[9]),
          payload,
          principalId: String(values[2]),
          tenantId: String(values[1]),
        });
        return { rows: [] };
      }
      if (text.includes("consumed_at IS NULL")) {
        const ref = String(values[0]);
        const consumedAt = String(values[1]);
        const row = rows.get(ref);
        if (
          row === undefined ||
          row.consumedAt !== null ||
          Date.parse(row.expiresAt) <= Date.parse(consumedAt)
        ) {
          return { rows: [] };
        }
        const payload = JSON.parse(String(values[2])) as Record<string, unknown>;
        row.consumedAt = consumedAt;
        row.payload = payload;
        return { rows: [{ payload }] };
      }
      if (text.includes("WHERE ref = $1")) {
        const row = rows.get(String(values[0]));
        return { rows: row === undefined ? [] : [{ payload: row.payload }] };
      }
      if (text.includes("tenant_id = $1 AND principal_id = $2")) {
        return {
          rows: [...rows.values()]
            .filter(
              (row) =>
                row.tenantId === values[0] && row.principalId === values[1],
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
  await controls.consume(ref);
  await assert.rejects(() => controls.consume(ref), /already consumed/);
  assert.equal(
    queries.some((query) => query.includes("consumed_at IS NULL")),
    true,
  );

  const other = createInteractionControlRegistry({ store });
  const listed = await other.listLiveApprovals({
    principalId: principalIdString("principal.a"),
    tenantId: tenantIdString("tenant.a"),
  });
  assert.deepEqual(listed, []);
  assert.equal(
    queries.some((query) => query.includes("tenant_id = $1 AND principal_id = $2")),
    true,
  );
});
