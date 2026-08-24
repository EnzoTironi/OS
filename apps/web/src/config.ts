import { z } from "zod";

export const runtimeConfigSchema = z
  .object({
    actionIds: z.array(z.string().min(1).max(200)).max(32).optional(),
    adaptiveSurfaceEnabled: z.boolean(),
    definitionId: z.string().min(1),
    oidcClientId: z.string().min(1),
    oidcIssuer: z.string().url(),
    resourceId: z.string().min(1).optional(),
    rpcBaseUrl: z.string().min(1),
    typeLimit: z.number().int().positive().max(10_000).optional(),
    typeId: z.string().min(1).optional(),
    validAt: z.string().datetime(),
  })
  .strict()
  .refine(
    (config) => config.resourceId !== undefined || config.typeId !== undefined,
    "ZOEN_WEB_RESOURCE_ID or ZOEN_WEB_TYPE_ID is required",
  );

export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  const response = await fetch("/api/config");
  const body: unknown = await response.json();
  if (!response.ok) {
    throw new Error("Web runtime configuration is unavailable");
  }
  return runtimeConfigSchema.parse(body);
}
