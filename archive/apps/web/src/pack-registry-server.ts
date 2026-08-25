import { z } from "zod";
import {
  assertPublicPackPayload,
  packCatalogEntrySchema,
  projectOpenedPack,
  type PackCatalogEntry,
  type PackDirectoryView,
} from "./pack-registry.js";

const searchResponseSchema = z
  .object({
    entries: z.array(packCatalogEntrySchema),
  })
  .strict();

const openResponseSchema = z
  .object({
    kind: z.string().min(1),
    packDigest: z.string().optional(),
    manifestJcs: z.string().optional(),
  })
  .passthrough();

function registryOrigin(): string {
  const value = process.env.ZOEN_WEB_RPC_ORIGIN;
  if (value === undefined || value === "") {
    throw new Error("ZOEN_WEB_RPC_ORIGIN is required");
  }
  return value.replace(/\/$/u, "");
}

function registryBearer(): string {
  const value = process.env.ZOEN_WEB_PACK_REGISTRY_BEARER;
  if (value === undefined || value === "") {
    throw new Error("ZOEN_WEB_PACK_REGISTRY_BEARER is required");
  }
  return value;
}

async function registryFetch(
  method: string,
  route: string,
  body?: unknown,
): Promise<{ readonly status: number; readonly body: unknown }> {
  const response = await fetch(`${registryOrigin()}${route}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      authorization: `Bearer ${registryBearer()}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    method,
  });
  const text = await response.text();
  let parsed: unknown = {};
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      throw new Error(
        `${method} ${route} returned ${response.status} non-JSON`,
      );
    }
  }
  return { body: parsed, status: response.status };
}

export async function searchPublicPacks(): Promise<
  readonly PackCatalogEntry[]
> {
  const result = await registryFetch("GET", "/pack/registry/search");
  if (result.status !== 200) {
    throw new Error("Pack registry search is unavailable");
  }
  assertPublicPackPayload(result.body);
  return searchResponseSchema.parse(result.body).entries;
}

export async function openPackDirectory(
  packDigest: string,
): Promise<PackDirectoryView> {
  if (!/^[0-9a-f]{64}$/u.test(packDigest)) {
    return {
      kind: "unsupported",
      reason: "Pack digest is not a valid PackDigest identity.",
    };
  }
  const result = await registryFetch("POST", "/pack/registry/open", {
    packDigest,
    source: { endpoint: "public", kind: "registry" },
  });
  if (result.status === 404) {
    return {
      kind: "unsupported",
      reason: "Pack is missing from the public registry.",
    };
  }
  if (result.status === 403) {
    return {
      kind: "unsupported",
      reason: "Pack is not available on the public registry.",
    };
  }
  if (result.status !== 200) {
    return {
      kind: "unsupported",
      reason: "Pack registry open failed closed.",
    };
  }
  assertPublicPackPayload(result.body);
  const opened = openResponseSchema.parse(result.body);
  if (opened.kind !== "opened" || opened.manifestJcs === undefined) {
    return {
      kind: "unsupported",
      reason: "Pack registry did not return an opened object.",
    };
  }
  return projectOpenedPack({
    manifestJcs: opened.manifestJcs,
    packDigest: opened.packDigest ?? packDigest,
  });
}
