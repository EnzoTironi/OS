import { createHash } from "node:crypto";

export const worldReadActionId = "zoen.world.read";

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
