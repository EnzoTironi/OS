import { createHash } from "node:crypto";
import {
  definitionPublishActionId,
  definitionPublishPolicy,
} from "./definition-publish-policy.js";
import type { CompiledDefinition } from "./canonical-definition.js";

export const worldReadActionId = "zoen.world.read";

export function definitionPublishAndWorldReadActionIds(
  additionalActionIds: readonly string[],
): string[] {
  return [
    definitionPublishActionId,
    worldReadActionId,
    ...additionalActionIds,
  ];
}

const source =
  'permit (\n    principal,\n    action == Action::"read",\n    resource\n);\n';

export function worldReadPolicy(input: {
  definitionDigest: string;
  policyId: string;
  revision: number;
}) {
  return {
    actionId: worldReadActionId,
    definitionDigest: input.definitionDigest,
    digest: createHash("sha256").update(source).digest("hex"),
    policyId: input.policyId,
    revision: input.revision,
    source,
  };
}

export function definitionPublishAndWorldReadPolicies(
  definition: CompiledDefinition,
) {
  const revision = definition.definition.revision;
  return [
    definitionPublishPolicy({ definitionDigest: definition.digest, revision }),
    worldReadPolicy({
      definitionDigest: definition.digest,
      policyId: `policy.world.read.r${revision}`,
      revision,
    }),
  ] as const;
}
