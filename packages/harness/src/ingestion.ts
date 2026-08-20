import * as restate from "@restatedev/restate-sdk";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  CompanyBrain,
  sourceInputSchema,
  type IngestJournal,
  type SourceInput,
} from "./knowledge.js";

const identifier = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/);

export const companyBrainIngestCommandSchema = z
  .object({
    ingestId: identifier,
    source: sourceInputSchema,
  })
  .strict();
export type CompanyBrainIngestCommand = z.infer<
  typeof companyBrainIngestCommandSchema
>;

export const companyBrainIngestSignatureHeader =
  "x-zoen-company-ingest-signature";

export interface CompanyBrainIngestHooks {
  beforeStep?(name: string): Promise<void>;
}

export function signCompanyBrainIngestCommand(
  bindingKey: string,
  command: CompanyBrainIngestCommand,
): string {
  return createHmac("sha256", bindingKey)
    .update(serializedCommand(command))
    .digest("hex");
}

export function createCompanyBrainIngestService(
  brain: CompanyBrain,
  trustedTenantId: string,
  bindingKey: string,
  hooks: CompanyBrainIngestHooks = {},
) {
  if (bindingKey.length === 0) {
    throw new Error("company ingest binding key is required");
  }
  return restate.object({
    name: "ZoenCompanyIngest",
    handlers: {
      run: async (context: restate.ObjectContext, input: unknown) => {
        const parsed = companyBrainIngestCommandSchema.safeParse(input);
        if (!parsed.success) {
          throw new restate.TerminalError("invalid company ingest command");
        }
        const signature = context
          .request()
          .headers.get(companyBrainIngestSignatureHeader);
        if (
          signature === undefined ||
          !validSignature(bindingKey, parsed.data, signature)
        ) {
          throw new restate.TerminalError(
            "company ingest principal binding is invalid",
          );
        }
        if (context.key !== parsed.data.ingestId) {
          throw new restate.TerminalError(
            "ingest key does not match the command",
          );
        }
        const journal: IngestJournal = {
          run: async <T>(
            name: string,
            action: () => Promise<T>,
          ): Promise<T> => {
            await hooks.beforeStep?.(name);
            return context.run(name, action, {
              initialRetryInterval: 2_000,
              maxRetryAttempts: 5,
              maxRetryInterval: 15_000,
            });
          },
        };
        return brain.ingest(trustedTenantId, parsed.data.source, journal);
      },
    },
  });
}

function validSignature(
  bindingKey: string,
  command: CompanyBrainIngestCommand,
  signature: string,
): boolean {
  if (!/^[0-9a-f]{64}$/u.test(signature)) {
    return false;
  }
  const expected = Buffer.from(signCompanyBrainIngestCommand(bindingKey, command));
  const actual = Buffer.from(signature);
  return timingSafeEqual(expected, actual);
}

function serializedCommand(command: {
  readonly ingestId: string;
  readonly source: SourceInput;
}): string {
  return JSON.stringify({
    ingestId: command.ingestId,
    source: command.source,
  });
}
