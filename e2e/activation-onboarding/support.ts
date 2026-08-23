import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  e2eGeneratedDirectory,
  e2eHttpUrl,
} from "../host-env.js";
import {
  oidcToken,
  startServer,
  stopServer,
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

export { oidcToken, startServer, stopServer, type ServerProcess };

export async function writePolicyManifest(outputPath: string): Promise<{
  canonicalJson: string;
  digest: string;
  definitionId: string;
  revision: number;
}> {
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
    definitionId: "inventory.governed",
    digest,
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
