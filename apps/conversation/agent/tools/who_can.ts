import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description:
    "Ask who on a ConversationStage can Read an entity. Kernel Action zoen.world.whoCan. Cap 32, fail closed. No world mutation.",
  async execute(input) {
    const zoend = process.env.ZOEN_ZOEND?.trim();
    const bearer = process.env.ZOEN_BEARER?.trim();
    const tenant = process.env.ZOEN_TENANT?.trim();
    const definitionId = process.env.ZOEN_DEFINITION_ID?.trim();
    const digest = process.env.ZOEN_DEFINITION_DIGEST?.trim();
    if (!(zoend && bearer && tenant && definitionId && digest)) {
      throw new Error("zoend session env is required");
    }
    const validAtMicros = Number(
      process.env.ZOEN_VALID_AT_MICROS ?? "1768435200000000"
    );
    const response = await fetch(`${zoend}/conversation/who-can`, {
      body: JSON.stringify({
        definitionId,
        digest,
        entityId: input.entityId,
        revision: 1,
        stageId: input.stageId,
        tenantId: tenant,
        validAtMicros,
      }),
      headers: {
        authorization: `Bearer ${bearer}`,
        "content-type": "application/json",
        "x-zoen-tenant": tenant,
      },
      method: "POST",
    });
    const json = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(
        String(json.error ?? `whoCan ${String(response.status)}`)
      );
    }
    return json;
  },
  inputSchema: z.object({
    entityId: z.string().min(1),
    stageId: z.string().min(1),
  }),
});
