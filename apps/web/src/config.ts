import { z } from "zod";

export const runtimeConfigSchema = z
  .object({
    definitionId: z.string().min(1),
    oidcClientId: z.string().min(1),
    oidcIssuer: z.string().url(),
    resourceId: z.string().min(1),
    rpcBaseUrl: z.string().min(1),
    validAt: z.string().datetime(),
  })
  .strict();

export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  const response = await fetch("/api/config");
  const body: unknown = await response.json();
  if (!response.ok) {
    throw new Error("Web runtime configuration is unavailable");
  }
  return runtimeConfigSchema.parse(body);
}
