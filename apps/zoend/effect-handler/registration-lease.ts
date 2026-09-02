import { z } from "zod";
import type { EffectHandlerConfig } from "./config.js";

const exactRegistrationSchema = z
  .object({
    artifact: z.string().min(1),
    deploymentId: z.string().min(1),
    ready: z.literal(true),
    reason: z.literal("exact registration verified"),
    updatedAt: z.string().min(1),
  })
  .strict();

export class RegistrationLease {
  readonly #config: EffectHandlerConfig["registration"];

  constructor(config: EffectHandlerConfig) {
    this.#config = config.registration;
  }

  async requireCurrent(expectedArtifact: string): Promise<{
    deploymentId: string;
  }> {
    let response: Response;
    try {
      response = await fetch(this.#config.statusUrl, {
        signal: AbortSignal.timeout(this.#config.leaseMaxAgeMs),
      });
    } catch (error: unknown) {
      throw new Error("exact effect registration is unavailable", {
        cause: error,
      });
    }
    if (!response.ok) {
      await cancelResponse(response);
      throw new Error(
        `exact effect registration returned HTTP ${response.status}`
      );
    }

    let document: unknown;
    try {
      document = await response.json();
    } catch (error: unknown) {
      throw new Error("exact effect registration returned malformed JSON", {
        cause: error,
      });
    }
    const parsed = exactRegistrationSchema.safeParse(document);
    if (!parsed.success) {
      throw new Error("exact effect registration is not ready");
    }
    if (parsed.data.artifact !== expectedArtifact) {
      throw new Error("effect registration artifact does not match this image");
    }

    const updatedAtMillis = Date.parse(parsed.data.updatedAt);
    const ageMillis = Date.now() - updatedAtMillis;
    if (
      !Number.isFinite(updatedAtMillis) ||
      ageMillis < 0 ||
      ageMillis > this.#config.leaseMaxAgeMs
    ) {
      throw new Error("exact effect registration lease is stale");
    }
    return { deploymentId: parsed.data.deploymentId };
  }
}

async function cancelResponse(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // The response is already unusable; cancellation is best-effort cleanup.
  }
}
