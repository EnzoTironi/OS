import assert from "node:assert/strict";
import { create } from "@bufbuild/protobuf";
import {
  DefinitionElementKind,
  MigrationDependencySchema,
  MigrationPostconditionSchema,
  type MigrationPlan,
} from "../../packages/sdk/src/gen/zoen/definition/v1/definition_pb.js";
import {
  ExactValueSchema,
  QuantityValueSchema,
} from "../../packages/sdk/src/gen/zoen/world/v1/world_pb.js";
import {
  adminClient,
  definitionId,
  resourceId,
  tenantA,
  type CompiledDefinition,
  type DefinitionClient,
} from "./support.js";

export interface DurableClaim {
  readonly claim_id: string;
  readonly commit_sequence: string;
  readonly definition_revision: string;
  readonly relation_id: string;
}

export function targetRuleId(
  plan: MigrationPlan,
  relationId: string,
): string {
  const rule = plan.rules.find((item) =>
    item.targets.some(
      (target) =>
        target.element === DefinitionElementKind.RELATION &&
        target.id === relationId,
    ),
  );
  assert.ok(rule);
  return rule.ruleId;
}

export function migrationDependency(claim: DurableClaim) {
  return create(MigrationDependencySchema, {
    claimId: claim.claim_id,
    commitSequence: BigInt(claim.commit_sequence),
    entityId: resourceId,
    relationId: claim.relation_id,
  });
}

export function postcondition(relationId: string) {
  return create(MigrationPostconditionSchema, {
    minimumRecordCount: 1n,
    relationId,
  });
}

export async function latestClaim(
  admin: ReturnType<typeof adminClient>,
  digest: string,
  relationId: string,
): Promise<DurableClaim> {
  const result = await admin.query<DurableClaim>(
    `SELECT claim_id, commit_sequence::text, definition_revision::text,
            relation_id
     FROM semantic_claims
     WHERE tenant_id = $1
       AND definition_digest = $2
       AND entity_id = $3
       AND relation_id = $4
     ORDER BY commit_sequence DESC, claim_id DESC
     LIMIT 1`,
    [tenantA, digest, resourceId, relationId],
  );
  assert.equal(result.rows.length, 1);
  const claim = result.rows[0];
  assert.ok(claim);
  return claim;
}

export function activateInitial(
  client: DefinitionClient,
  tenantId: string,
  definition: CompiledDefinition,
) {
  return client.activateRevision({
    activeRevisionPrecondition: {
      case: "expectNoActiveRevision",
      value: true,
    },
    definitionId,
    digest: definition.digest,
    tenantId,
  });
}

export function activate(
  client: DefinitionClient,
  tenantId: string,
  fromDigest: string,
  toDigest: string,
) {
  return client.activateRevision({
    activeRevisionPrecondition: {
      case: "expectedActiveDigest",
      value: fromDigest,
    },
    definitionId,
    digest: toDigest,
    tenantId,
  });
}

export function quantity(amount: string) {
  return create(ExactValueSchema, {
    value: {
      case: "quantityValue",
      value: create(QuantityValueSchema, { amount, unit: "kg" }),
    },
  });
}

export function integer(value: string) {
  return create(ExactValueSchema, {
    value: { case: "integerValue", value },
  });
}

export function entity(value: string) {
  return create(ExactValueSchema, {
    value: { case: "entityRefValue", value },
  });
}
