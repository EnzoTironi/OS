import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { create, toJson } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import {
  observeCapabilities,
  type IdentityAccountSnapshot,
  type ObservedCapabilities,
} from "../../archive/packages/onboarding/src/index.js";
import {
  DefinitionReferenceSchema,
  QueryConsistencySchema,
  QuerySelectionSchema,
  SemanticQueryResponseSchema,
  StrongConsistencySchema,
  type SemanticQueryResponse,
} from "../../packages/sdk/src/gen/zoen/world/v1/world_pb.js";
import {
  e2eGeneratedDirectory,
  e2eHttpUrl,
} from "../host-env.js";
import {
  activateDefinition,
  definitionClient,
  oidcToken,
  publishDefinition,
  recordAvailable,
  startServer,
  stopServer,
  worldClient,
  type DefinitionFixture,
  type ServerProcess,
} from "../governed-action/support.js";

export const scenario = "activation-onboarding";
export const repositoryRoot = process.cwd();
export const generatedDirectory = e2eGeneratedDirectory(
  repositoryRoot,
  scenario,
);
export const baseUrl = e2eHttpUrl("ZOEN_E2E_ZOEND_PORT", 58_551);
export const storePath = path.join(
  generatedDirectory,
  "onboarding-sessions.json",
);
export const enterpriseTenant = "tenant.sample.enterprise";
export const sampleItemId = "inventory.item.1";
export const sampleValidAt = new Date("2026-08-19T00:00:00.000Z");

export {
  activateDefinition,
  definitionClient,
  oidcToken,
  publishDefinition,
  recordAvailable,
  startServer,
  stopServer,
  worldClient,
  type DefinitionFixture,
  type ServerProcess,
};

export async function writePolicyManifest(
  outputPath: string,
): Promise<
  DefinitionFixture & {
    readonly definitionId: string;
    readonly revision: number;
  }
> {
  const canonicalJson = (
    await readFile(
      path.join(
        repositoryRoot,
        "e2e",
        "activation-onboarding",
        "definition-direct.canonical.json",
      ),
      "utf8",
    )
  ).trimEnd();
  const digest = createHash("sha256").update(canonicalJson).digest("hex");
  const policySource = await readFile(
    path.join(repositoryRoot, "e2e", "activation-onboarding", "direct.cedar"),
    "utf8",
  );
  const activationSource = await readFile(
    path.join(
      repositoryRoot,
      "e2e",
      "activation-onboarding",
      "activation.cedar",
    ),
    "utf8",
  );
  const policyDigest = createHash("sha256").update(policySource).digest("hex");
  const activationDigest = createHash("sha256")
    .update(activationSource)
    .digest("hex");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(
      {
        policies: [
          {
            actionId: "inventory.requestStock",
            definitionDigest: digest,
            digest: policyDigest,
            policyId: "policy.direct",
            revision: 1,
            source: policySource,
          },
          {
            actionId: "zoen.definition.activate",
            definitionDigest: digest,
            digest: activationDigest,
            policyId: "policy.activation.inventory.governed",
            revision: 1,
            source: activationSource,
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  return {
    canonicalJson,
    definition: create(DefinitionReferenceSchema, {
      definitionId: "inventory.governed",
      digest,
      revision: 1n,
    }),
    definitionId: "inventory.governed",
    digest,
    policyDigest,
    policyId: "policy.direct",
    policyRevision: 1,
    policySource,
    revision: 1,
  };
}

export async function admin(
  method: string,
  route: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${baseUrl}${route}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    method,
  });
  const text = await response.text();
  const parsed =
    text.length === 0
      ? {}
      : (JSON.parse(text) as Record<string, unknown>);
  return { body: parsed, status: response.status };
}

function isIdentitySnapshot(body: Record<string, unknown>): body is IdentityAccountSnapshot &
  Record<string, unknown> {
  return (
    typeof body.account === "object" &&
    body.account !== null &&
    Array.isArray(body.bindings) &&
    Array.isArray(body.memberships)
  );
}

/** Live AD-01 observation. Null snapshot ⇒ provisional empty capabilities. */
export async function liveObserved(
  accountId: string,
  overlay?: {
    readonly readSources?: ObservedCapabilities["readSources"];
    readonly queryReady?: boolean;
  },
): Promise<ObservedCapabilities> {
  const response = await admin(
    "GET",
    `/identity/admin/accounts/${encodeURIComponent(accountId)}`,
  );
  if (response.status === 404 || !isIdentitySnapshot(response.body)) {
    return observeCapabilities({
      snapshot: null,
      readSources: overlay?.readSources,
      queryReady: overlay?.queryReady,
    });
  }
  return observeCapabilities({
    snapshot: response.body,
    readSources: overlay?.readSources,
    queryReady: overlay?.queryReady,
  });
}

export function queryReceiptDigest(response: SemanticQueryResponse): string {
  return createHash("sha256")
    .update(JSON.stringify(toJson(SemanticQueryResponseSchema, response)))
    .digest("hex");
}

export function knowledgeFragmentDigests(
  response: SemanticQueryResponse,
): string[] {
  const digests = new Set<string>();
  for (const value of response.values) {
    for (const dependency of value.dependencies) {
      if (dependency.sourceDigest.length === 64) {
        digests.add(dependency.sourceDigest);
      }
    }
  }
  return [...digests];
}

export async function runEnterpriseSemanticQuery(
  token: string,
  fixture: DefinitionFixture,
): Promise<SemanticQueryResponse> {
  const world = worldClient(token);
  return world.semanticQuery({
    consistency: create(QueryConsistencySchema, {
      value: {
        case: "strong",
        value: create(StrongConsistencySchema),
      },
    }),
    definition: fixture.definition,
    entityId: sampleItemId,
    selection: create(QuerySelectionSchema, {
      value: { case: "relationId", value: "inventory.available" },
    }),
    tenantId: enterpriseTenant,
    validAt: timestampFromDate(sampleValidAt),
  });
}

export async function seedEnterpriseQuerySurface(
  fixture: DefinitionFixture,
): Promise<void> {
  const token = await oidcToken("sample-enterprise");
  const definitions = definitionClient(token);
  const world = worldClient(token);
  await publishDefinition(definitions, enterpriseTenant, fixture);
  try {
    await activateDefinition(definitions, enterpriseTenant, fixture);
  } catch (cause: unknown) {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (!message.includes("active definition revision")) {
      throw cause;
    }
  }
  try {
    await recordAvailable(world, {
      claimId: "claim.onboarding.available.1",
      fixture,
      resource: sampleItemId,
      tenantId: enterpriseTenant,
      value: "42",
    });
  } catch (cause: unknown) {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (!message.includes("already") && !message.includes("duplicate")) {
      // Idempotent seed: claim may already exist from a prior run.
      if (!/claim/i.test(message)) {
        throw cause;
      }
    }
  }
}

