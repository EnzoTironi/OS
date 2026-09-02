import { createHash } from "node:crypto";

export const definitionPublishActionId = "zoen.definition.publish";

const defaultSource = `permit (
    principal,
    action == Action::"publish_definition",
    resource
)
when {
    context.actionId == "zoen.definition.publish"
};
`;

export interface DefinitionPublishPolicy {
  actionId: typeof definitionPublishActionId;
  definitionDigest: string;
  digest: string;
  policyId: string;
  revision: number;
  source: string;
}

export function definitionPublishPolicy(input: {
  definitionDigest: string;
  policyId?: string;
  revision: number;
  source?: string;
}): DefinitionPublishPolicy {
  const source = input.source ?? defaultSource;
  return {
    actionId: definitionPublishActionId,
    definitionDigest: input.definitionDigest,
    digest: createHash("sha256").update(source).digest("hex"),
    policyId: input.policyId ?? `policy.definition.publish.r${input.revision}`,
    revision: input.revision,
    source,
  };
}
