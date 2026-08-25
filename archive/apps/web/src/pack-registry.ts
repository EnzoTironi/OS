import { z } from "zod";

/** Catalog row from GET /pack/registry/search. Digest is the only version identity. */
export const packCatalogEntrySchema = z
  .object({
    packDigest: z.string().min(1),
    packId: z.string().min(1),
    version: z.string().min(1),
    publisherId: z.string().min(1),
    outcomeLabel: z.string().min(1),
    categories: z.array(z.string()),
    visibility: z.string().min(1),
  })
  .strict();

export type PackCatalogEntry = z.infer<typeof packCatalogEntrySchema>;

const integrationSchema = z
  .object({
    kind: z.string().min(1),
    necessity: z.string().min(1),
    requirementId: z.string().min(1),
    scope: z.string().min(1),
    sensitivity: z.string().min(1),
  })
  .passthrough();

const firstSuccessSchema = z
  .object({
    contractId: z.string().min(1),
    outcome: z.record(z.string(), z.unknown()),
  })
  .passthrough();

const manifestSchema = z
  .object({
    description: z
      .object({
        title: z.string().min(1),
        summary: z.string().min(1),
      })
      .passthrough(),
    publisher: z
      .object({
        displayName: z.string().min(1),
        publisherId: z.string().min(1),
      })
      .passthrough(),
    integrationRequirements: z.array(integrationSchema),
    firstSuccessContract: firstSuccessSchema,
    packId: z.string().min(1),
    version: z.string().min(1),
  })
  .passthrough();

export type PackDirectoryDetail = {
  readonly kind: "ok";
  readonly packDigest: string;
  readonly packId: string;
  readonly version: string;
  readonly outcome: string;
  readonly summary: string;
  readonly publisher: {
    readonly displayName: string;
    readonly publisherId: string;
  };
  readonly requiredIntegrations: readonly {
    readonly requirementId: string;
    readonly kind: string;
    readonly scope: string;
    readonly necessity: string;
  }[];
  readonly permissions: readonly {
    readonly requirementId: string;
    readonly sensitivity: string;
    readonly scope: string;
  }[];
  readonly firstSuccess: {
    readonly contractId: string;
    readonly outcome: Readonly<Record<string, unknown>>;
  };
};

export type PackDirectoryFailure = {
  readonly kind: "unsupported";
  readonly reason: string;
};

export type PackDirectoryView = PackDirectoryDetail | PackDirectoryFailure;

const forbiddenSecretKey =
  /(secret|password|token|apikey|api_key|private[_-]?key|credential)/i;

export function assertPublicPackPayload(value: unknown): void {
  const hits = collectForbiddenKeys(value, "");
  if (hits.length > 0) {
    throw new Error(`forbidden secret-shaped fields: ${hits.join(",")}`);
  }
}

function collectForbiddenKeys(value: unknown, prefix: string): string[] {
  if (value === null || typeof value !== "object") {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((child, index) =>
      collectForbiddenKeys(child, `${prefix}${index}.`),
    );
  }
  const found: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenSecretKey.test(key)) {
      found.push(`${prefix}${key}`);
    }
    found.push(...collectForbiddenKeys(child, `${prefix}${key}.`));
  }
  return found;
}

export function projectOpenedPack(input: {
  readonly packDigest: string;
  readonly manifestJcs: string;
}): PackDirectoryView {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.manifestJcs);
  } catch {
    return {
      kind: "unsupported",
      reason: "Pack manifest is not valid JSON.",
    };
  }
  const manifest = manifestSchema.safeParse(parsed);
  if (!manifest.success) {
    return {
      kind: "unsupported",
      reason: "Pack manifest is missing required directory fields.",
    };
  }
  assertPublicPackPayload(parsed);
  const required = manifest.data.integrationRequirements.filter(
    (row) => row.necessity === "required",
  );
  return {
    kind: "ok",
    packDigest: input.packDigest,
    packId: manifest.data.packId,
    version: manifest.data.version,
    outcome: manifest.data.description.title,
    summary: manifest.data.description.summary,
    publisher: {
      displayName: manifest.data.publisher.displayName,
      publisherId: manifest.data.publisher.publisherId,
    },
    requiredIntegrations: required.map((row) => ({
      requirementId: row.requirementId,
      kind: row.kind,
      scope: row.scope,
      necessity: row.necessity,
    })),
    permissions: manifest.data.integrationRequirements.map((row) => ({
      requirementId: row.requirementId,
      sensitivity: row.sensitivity,
      scope: row.scope,
    })),
    firstSuccess: {
      contractId: manifest.data.firstSuccessContract.contractId,
      outcome: manifest.data.firstSuccessContract.outcome,
    },
  };
}

export function conversationEntryHref(input: {
  readonly pack?: string;
  readonly referral?: string;
  readonly intent?: string;
}): string {
  const url = new URL("/onboarding/", "http://zoen.local");
  if (input.pack !== undefined && input.pack.length > 0) {
    url.searchParams.set("pack", input.pack);
  }
  if (input.referral !== undefined && input.referral.length > 0) {
    url.searchParams.set("referral", input.referral);
  }
  if (input.intent !== undefined && input.intent.length > 0) {
    url.searchParams.set("intent", input.intent);
  }
  return `${url.pathname}${url.search}`;
}

export function entryDomainHints(input: {
  readonly pack?: string;
  readonly referral?: string;
  readonly intent?: string;
}): string[] | undefined {
  const hints: string[] = [];
  if (input.pack !== undefined && input.pack.length > 0) {
    hints.push(`pack:${input.pack}`);
  }
  if (input.referral !== undefined && input.referral.length > 0) {
    hints.push(`referral:${input.referral}`);
  }
  if (input.intent !== undefined && input.intent.length > 0) {
    hints.push(`intent:${input.intent}`);
  }
  return hints.length === 0 ? undefined : hints;
}
