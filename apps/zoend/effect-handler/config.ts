import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readFileSync,
} from "node:fs";
import path from "node:path";
import { z } from "zod";

export const EFFECT_HANDLER_HOST = "127.0.0.1";
export const EFFECT_HANDLER_DEFAULT_PORT = 9081;
export const EFFECT_WORKER_WORKLOAD_ID = "workload.effect-worker";

const semanticIdSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9._-]*$/);
export const tenantIdSchema = semanticIdSchema.brand<"TenantId">();
export const effectRequestIdSchema =
  semanticIdSchema.brand<"EffectRequestId">();
const principalIdSchema = semanticIdSchema.brand<"PrincipalId">();
const actorIdSchema = semanticIdSchema.brand<"ActorId">();
const credentialRefSchema = semanticIdSchema.brand<"CredentialRef">();
const apiKeySchema = z
  .string()
  .regex(/^zoen_wl_[A-Za-z0-9._-]+$/)
  .brand<"WorkloadApiKey">();

const environmentSchema = z.object({
  ZOEN_CONNECTOR_CALLER_TOKEN: z
    .string()
    .min(1)
    .refine((value) => value === value.trim()),
  ZOEN_CONNECTOR_CREDENTIAL_REFS: z.string().min(1),
  ZOEN_EFFECT_CONNECTOR_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .max(60_000)
    .default(10_000),
  ZOEN_EFFECT_CONNECTOR_URL: z.url(),
  ZOEN_EFFECT_HANDLER_PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65_535)
    .default(EFFECT_HANDLER_DEFAULT_PORT),
  ZOEN_EFFECT_REGISTRATION_LEASE_MAX_AGE_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(60_000)
    .default(5000),
  ZOEN_EFFECT_REGISTRATION_STATUS_URL: z
    .url()
    .default("http://127.0.0.1:9082/status"),
  ZOEN_EFFECT_SERVICE_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .max(60_000)
    .default(5000),
  ZOEN_EFFECT_WORKER_ACTOR_ID: actorIdSchema,
  ZOEN_EFFECT_WORKER_API_KEY_FILE: z.string().min(1).refine(path.isAbsolute),
  ZOEN_EFFECT_WORKER_PRINCIPAL_ID: principalIdSchema,
  ZOEN_EFFECT_WORKER_WORKLOAD_ID: z
    .literal(EFFECT_WORKER_WORKLOAD_ID)
    .default(EFFECT_WORKER_WORKLOAD_ID),
  ZOEN_TENANT_ID: tenantIdSchema,
  ZOEN_ZOEND: z.url(),
});

export type TenantId = z.infer<typeof tenantIdSchema>;
export type EffectRequestId = z.infer<typeof effectRequestIdSchema>;
export type WorkloadApiKey = z.infer<typeof apiKeySchema>;

export type EffectHandlerConfig = Readonly<{
  connector: Readonly<{
    callerToken: string;
    credentialRef: z.infer<typeof credentialRefSchema>;
    requestTimeoutMs: number;
    url: URL;
  }>;
  effectService: Readonly<{
    requestTimeoutMs: number;
    zoendUrl: URL;
  }>;
  identity: Readonly<{
    actorId: z.infer<typeof actorIdSchema>;
    apiKeyFile: string;
    principalId: z.infer<typeof principalIdSchema>;
    tenantId: TenantId;
    workloadId: typeof EFFECT_WORKER_WORKLOAD_ID;
  }>;
  listen: Readonly<{
    host: typeof EFFECT_HANDLER_HOST;
    port: number;
  }>;
  registration: Readonly<{
    leaseMaxAgeMs: number;
    statusUrl: URL;
  }>;
}>;

export class EffectHandlerConfigurationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "EffectHandlerConfigurationError";
  }
}

export function loadEffectHandlerConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env
): EffectHandlerConfig {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new EffectHandlerConfigurationError(
      `invalid effect handler configuration: ${problems}`
    );
  }
  const values = parsed.data;
  const zoendUrl = localUrl(values.ZOEN_ZOEND, "ZOEN_ZOEND", "/");
  const connectorUrl = localUrl(
    values.ZOEN_EFFECT_CONNECTOR_URL,
    "ZOEN_EFFECT_CONNECTOR_URL",
    "/v1/effects"
  );
  const registrationStatusUrl = localUrl(
    values.ZOEN_EFFECT_REGISTRATION_STATUS_URL,
    "ZOEN_EFFECT_REGISTRATION_STATUS_URL",
    "/status"
  );
  const connectorCredentialRefs = parseCredentialRefs(
    values.ZOEN_CONNECTOR_CREDENTIAL_REFS
  );
  const entries = Object.entries(connectorCredentialRefs);
  if (entries.length !== 1 || entries[0]?.[0] !== values.ZOEN_TENANT_ID) {
    throw new EffectHandlerConfigurationError(
      "ZOEN_CONNECTOR_CREDENTIAL_REFS must contain only the configured tenant"
    );
  }
  const credentialRef = connectorCredentialRefs[values.ZOEN_TENANT_ID];
  if (credentialRef === undefined) {
    throw new EffectHandlerConfigurationError(
      "ZOEN_CONNECTOR_CREDENTIAL_REFS omits the configured tenant"
    );
  }

  readWorkloadApiKey(values.ZOEN_EFFECT_WORKER_API_KEY_FILE);

  return {
    connector: {
      callerToken: values.ZOEN_CONNECTOR_CALLER_TOKEN,
      credentialRef,
      requestTimeoutMs: values.ZOEN_EFFECT_CONNECTOR_TIMEOUT_MS,
      url: connectorUrl,
    },
    effectService: {
      requestTimeoutMs: values.ZOEN_EFFECT_SERVICE_TIMEOUT_MS,
      zoendUrl,
    },
    identity: {
      actorId: values.ZOEN_EFFECT_WORKER_ACTOR_ID,
      apiKeyFile: values.ZOEN_EFFECT_WORKER_API_KEY_FILE,
      principalId: values.ZOEN_EFFECT_WORKER_PRINCIPAL_ID,
      tenantId: values.ZOEN_TENANT_ID,
      workloadId: values.ZOEN_EFFECT_WORKER_WORKLOAD_ID,
    },
    listen: {
      host: EFFECT_HANDLER_HOST,
      port: values.ZOEN_EFFECT_HANDLER_PORT,
    },
    registration: {
      leaseMaxAgeMs: values.ZOEN_EFFECT_REGISTRATION_LEASE_MAX_AGE_MS,
      statusUrl: registrationStatusUrl,
    },
  };
}

export function readWorkloadApiKey(file: string): WorkloadApiKey {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(file, constants.O_NOFOLLOW);
    const status = fstatSync(descriptor);
    if (!status.isFile()) {
      throw new EffectHandlerConfigurationError(
        "effect worker API key is not a regular file"
      );
    }
    if (status.mode % 0o1000 !== 0o600) {
      throw new EffectHandlerConfigurationError(
        "effect worker API key file mode must be 0600"
      );
    }
    const document = readFileSync(descriptor, "utf8");
    const candidate = document.endsWith("\n")
      ? document.slice(0, -1)
      : document;
    if (candidate.length === 0 || candidate !== candidate.trim()) {
      throw new EffectHandlerConfigurationError(
        "effect worker API key file is malformed"
      );
    }
    const parsed = apiKeySchema.safeParse(candidate);
    if (!parsed.success) {
      throw new EffectHandlerConfigurationError(
        "effect worker API key file is malformed"
      );
    }
    return parsed.data;
  } catch (error: unknown) {
    if (error instanceof EffectHandlerConfigurationError) {
      throw error;
    }
    throw new EffectHandlerConfigurationError(
      "effect worker API key file cannot be read",
      { cause: error }
    );
  } finally {
    if (descriptor !== undefined) {
      closeSync(descriptor);
    }
  }
}

function localUrl(value: string, name: string, expectedPath: string): URL {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "[::1]", "localhost"].includes(url.hostname) ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.search.length > 0 ||
    url.hash.length > 0 ||
    url.pathname !== expectedPath
  ) {
    throw new EffectHandlerConfigurationError(
      `${name} must be a loopback HTTP URL with path ${expectedPath}`
    );
  }
  return url;
}

function parseCredentialRefs(
  value: string
): Readonly<Record<string, z.infer<typeof credentialRefSchema>>> {
  let document: unknown;
  try {
    document = JSON.parse(value);
  } catch (error: unknown) {
    throw new EffectHandlerConfigurationError(
      "ZOEN_CONNECTOR_CREDENTIAL_REFS must be JSON",
      { cause: error }
    );
  }
  const schema = z.record(tenantIdSchema, credentialRefSchema);
  const parsed = schema.safeParse(document);
  if (!parsed.success) {
    throw new EffectHandlerConfigurationError(
      "ZOEN_CONNECTOR_CREDENTIAL_REFS is malformed"
    );
  }
  return parsed.data;
}
