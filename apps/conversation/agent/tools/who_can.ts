import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description:
    "Ask who on a ConversationStage can Read an entity. Kernel Action zoen.world.whoCan. Cap 32, fail closed. No world mutation.",
  inputSchema: z.object({
    stageId: z.string().min(1),
    entityId: z.string().min(1),
  }),
  async execute(input) {
    const zoend = process.env.ZOEN_ZOEND?.trim();
    const bearer = process.env.ZOEN_BEARER?.trim();
    const tenant = process.env.ZOEN_TENANT?.trim();
    const definitionId = process.env.ZOEN_DEFINITION_ID?.trim();
    const digest = process.env.ZOEN_DEFINITION_DIGEST?.trim();
    if (!zoend || !bearer || !tenant || !definitionId || !digest) {
      throw new Error("zoend session env is required");
    }
    const validAtMicros = Number(process.env.ZOEN_VALID_AT_MICROS ?? "1768435200000000");
    const response = await fetch(`${zoend}/conversation/who-can`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${bearer}`,
        "content-type": "application/json",
        "x-zoen-tenant": tenant,
      },
      body: JSON.stringify({
        tenantId: tenant,
        stageId: input.stageId,
        definitionId,
        digest,
        revision: 1,
        entityId: input.entityId,
        validAtMicros,
      }),
    });
    const json = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(String(json.error ?? `whoCan ${String(response.status)}`));
    }
    return json;
  },
});
