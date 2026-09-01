import { createHash } from "node:crypto";
import {
  definitionPublishActionId,
  definitionPublishPolicy,
} from "./definition-publish-policy.js";

export const worldReadActionId = "zoen.world.read";
export const definitionPublishAndWorldReadActionIds = [
  definitionPublishActionId,
  worldReadActionId,
] as const;

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

export function definitionPublishAndWorldReadPolicies(input: {
  definitionDigest: string;
  revision: number;
}) {
  return [
    definitionPublishPolicy(input),
    worldReadPolicy({
      ...input,
      policyId: `policy.world.read.r${input.revision}`,
    }),
  ] as const;
}
