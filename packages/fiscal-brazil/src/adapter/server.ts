import { timingSafeEqual } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { z } from "zod";
import {
  connectorDispatchSchema,
  type FiscalProvider,
  type NeutralFiscalOperation,
  fiscalProviderSchema,
  type VendorAdapter,
} from "./contracts.js";
import { VendorHttpClient } from "./http.js";
import { FiscalContextReader } from "./semantic.js";
import { PlugNotasAdapter } from "./vendors/plugnotas.js";
import { ProtheusAdapter } from "./vendors/protheus.js";
import { SystaxAdapter } from "./vendors/systax.js";

const callerBindingsSchema = z.record(
  z.string().min(16),
  z.string().min(1),
);
const providerRouteSchema = z.object({
  baseUrl: z.string().url(),
  credential: z.string().min(1),
  provider: fiscalProviderSchema,
  timeoutMs: z.number().int().positive(),
});
const providerRoutesSchema = z.object({
  documents: z
    .record(z.string().min(1), providerRouteSchema)
    .default({}),
  tax: providerRouteSchema.optional(),
});

type ProviderRoute = z.infer<typeof providerRouteSchema>;

export type FiscalAdapterConfig = {
  readonly callerBindings: unknown;
  readonly listenAddress: string;
  readonly oidcClients: unknown;
  readonly oidcTokenUrl: URL;
  readonly providerRoutes: unknown;
  readonly zoenUrl: URL;
};

export async function startFiscalAdapter(
  config: FiscalAdapterConfig,
): Promise<void> {
  const callerBindings = callerBindingsSchema.parse(config.callerBindings);
  const reader = new FiscalContextReader({
    clients: config.oidcClients,
    tokenUrl: config.oidcTokenUrl,
    zoenUrl: config.zoenUrl,
  });
  const vendor = routedVendorAdapter(config.providerRoutes);
  const server = createServer(async (request, response) => {
    try {
      await handleRequest({
        callerBindings,
        reader,
        request,
        response,
        vendor,
      });
    } catch (error: unknown) {
      process.stderr.write(
        `${JSON.stringify({
          errorType: error instanceof Error ? error.name : "UnknownError",
          event: "fiscal_adapter_request_failed",
          method: request.method,
          path: request.url,
        })}\n`,
      );
      writeJson(response, 502, { error: "fiscal adapter request failed" });
    }
  });
  const [host, portText] = splitListenAddress(config.listenAddress);
  const port = Number(portText);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  process.stdout.write(
    `${JSON.stringify({
      event: "fiscal_adapter_listening",
      providers: vendor.providers,
    })}\n`,
  );
  await new Promise<void>((resolve) => {
    const close = () => server.close(() => resolve());
    process.once("SIGINT", close);
    process.once("SIGTERM", close);
  });
}

async function handleRequest(input: {
  readonly callerBindings: Record<string, string>;
  readonly reader: FiscalContextReader;
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly vendor: RoutedVendorAdapter;
}): Promise<void> {
  const url = new URL(input.request.url ?? "/", "http://fiscal-adapter.invalid");
  if (input.request.method === "GET" && url.pathname === "/health") {
    input.response.writeHead(204).end();
    return;
  }
  const tenantId = authenticate(input.request, input.callerBindings);
  if (tenantId === undefined) {
    writeJson(input.response, 401, { error: "invalid adapter credentials" });
    return;
  }
  if (
    input.request.method === "POST" &&
    url.pathname === "/v1/operations"
  ) {
    const body = connectorDispatchSchema.parse(
      await readJsonBody(input.request),
    );
    if (body.tenantId !== tenantId) {
      writeJson(input.response, 403, {
        error: "adapter credential is not bound to the requested tenant",
      });
      return;
    }
    const context = await input.reader.read(body);
    const result = await input.vendor.dispatch({
      idempotencyKey: body.idempotencyKey,
      operation: context.operation,
    });
    if (result.writeback !== undefined) {
      await input.reader.commitProviderWriteback(context, result.writeback);
    }
    writeJson(input.response, result.status, result.body);
    return;
  }
  const statusPrefix = "/v1/operations/by-idempotency/";
  if (
    input.request.method === "GET" &&
    url.pathname.startsWith(statusPrefix)
  ) {
    const idempotencyKey = decodeURIComponent(
      url.pathname.slice(statusPrefix.length),
    );
    const context = await input.reader.readStatus({
      idempotencyKey,
      tenantId,
    });
    const result = await input.vendor.status({
      idempotencyKey,
      operation: context.operation,
    });
    switch (result.kind) {
      case "found":
        if (result.writeback !== undefined) {
          await input.reader.commitProviderWriteback(context, result.writeback);
        }
        writeJson(input.response, 200, result.status);
        return;
      case "not_found":
        writeJson(input.response, 404, { error: "operation not found" });
        return;
      case "provider_error":
        writeJson(input.response, result.status, result.body);
        return;
      default: {
        const exhaustive: never = result;
        throw new Error(`unsupported provider result: ${String(exhaustive)}`);
      }
    }
  }
  writeJson(input.response, 404, { error: "route not found" });
}

class RoutedVendorAdapter implements VendorAdapter {
  readonly #documents: ReadonlyMap<string, VendorAdapter>;
  readonly #tax: VendorAdapter | undefined;
  readonly providers: readonly FiscalProvider[];

  constructor(input: {
    readonly documents: ReadonlyMap<string, VendorAdapter>;
    readonly providers: readonly FiscalProvider[];
    readonly tax: VendorAdapter | undefined;
  }) {
    this.#documents = input.documents;
    this.#tax = input.tax;
    this.providers = input.providers;
  }

  dispatch(input: {
    readonly idempotencyKey: string;
    readonly operation: NeutralFiscalOperation;
  }) {
    return this.#vendor(input.operation).dispatch(input);
  }

  status(input: {
    readonly idempotencyKey: string;
    readonly operation: NeutralFiscalOperation;
  }) {
    return this.#vendor(input.operation).status(input);
  }

  #vendor(operation: NeutralFiscalOperation): VendorAdapter {
    switch (operation.kind) {
      case "tax_determination": {
        if (this.#tax === undefined) {
          throw new Error("no tax determination provider is configured");
        }
        return this.#tax;
      }
      case "cancel_document":
      case "correct_document":
      case "submit_document": {
        const vendor =
          this.#documents.get(operation.issuerRegistration) ??
          this.#documents.get("*");
        if (vendor === undefined) {
          throw new Error(
            `no fiscal document provider is configured for issuer ${operation.issuerRegistration}`,
          );
        }
        return vendor;
      }
      default: {
        const exhaustive: never = operation;
        throw new Error(`unsupported fiscal operation: ${String(exhaustive)}`);
      }
    }
  }
}

function routedVendorAdapter(routes: unknown): RoutedVendorAdapter {
  const parsed = providerRoutesSchema.parse(routes);
  if (parsed.tax?.provider !== undefined && parsed.tax.provider !== "systax") {
    throw new Error("the tax determination route must use Systax");
  }
  const documents = new Map<string, VendorAdapter>();
  const providers = new Set<FiscalProvider>();
  for (const [issuerRegistration, route] of Object.entries(parsed.documents)) {
    if (route.provider === "systax") {
      throw new Error("a fiscal document route cannot use Systax");
    }
    documents.set(issuerRegistration, vendorAdapter(route));
    providers.add(route.provider);
  }
  const tax =
    parsed.tax === undefined ? undefined : vendorAdapter(parsed.tax);
  if (parsed.tax !== undefined) {
    providers.add(parsed.tax.provider);
  }
  return new RoutedVendorAdapter({
    documents,
    providers: [...providers].sort(),
    tax,
  });
}

function vendorAdapter(
  route: ProviderRoute,
): VendorAdapter {
  const http = new VendorHttpClient({
    baseUrl: new URL(route.baseUrl),
    credential: route.credential,
    timeoutMs: route.timeoutMs,
  });
  switch (route.provider) {
    case "plugnotas":
      return new PlugNotasAdapter(http);
    case "protheus":
      return new ProtheusAdapter(http);
    case "systax":
      return new SystaxAdapter(http);
    default: {
      const exhaustive: never = route.provider;
      throw new Error(`unsupported fiscal provider: ${String(exhaustive)}`);
    }
  }
}

function authenticate(
  request: IncomingMessage,
  bindings: Record<string, string>,
): string | undefined {
  const authorization = request.headers.authorization;
  if (authorization === undefined || !authorization.startsWith("Bearer ")) {
    return undefined;
  }
  const provided = Buffer.from(authorization.slice("Bearer ".length));
  for (const [secret, tenantId] of Object.entries(bindings)) {
    const expected = Buffer.from(secret);
    if (
      expected.length === provided.length &&
      timingSafeEqual(expected, provided)
    ) {
      return tenantId;
    }
  }
  return undefined;
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of request) {
    const bytes =
      typeof chunk === "string" ? Buffer.from(chunk) : new Uint8Array(chunk);
    length += bytes.byteLength;
    if (length > 1_048_576) {
      throw new Error("request body exceeds one mebibyte");
    }
    chunks.push(bytes);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(text);
}

function writeJson(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  if (response.headersSent || response.destroyed) {
    return;
  }
  const encoded = JSON.stringify(body);
  response.writeHead(status, {
    "content-length": Buffer.byteLength(encoded),
    "content-type": "application/json",
  });
  response.end(encoded);
}

function splitListenAddress(value: string): [string, string] {
  const match = /^(?<host>[^:]+):(?<port>[0-9]+)$/u.exec(value);
  if (match?.groups?.host === undefined || match.groups.port === undefined) {
    throw new Error("fiscal adapter listen address must be host:port");
  }
  const port = Number(match.groups.port);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("fiscal adapter listen port is invalid");
  }
  return [match.groups.host, match.groups.port];
}

export function configFromEnvironment(
  environment: NodeJS.ProcessEnv,
): FiscalAdapterConfig {
  const providerTimeoutMs = positiveIntegerEnvironment(
    environment.ZOEN_FISCAL_ADAPTER_PROVIDER_TIMEOUT_MS ?? "5000",
    "ZOEN_FISCAL_ADAPTER_PROVIDER_TIMEOUT_MS",
  );
  return {
    callerBindings: parseJsonEnvironment(
      environment.ZOEN_FISCAL_ADAPTER_CALLER_BINDINGS,
      "ZOEN_FISCAL_ADAPTER_CALLER_BINDINGS",
    ),
    listenAddress: requiredEnvironment(
      environment.ZOEN_FISCAL_ADAPTER_LISTEN_ADDR,
      "ZOEN_FISCAL_ADAPTER_LISTEN_ADDR",
    ),
    oidcClients: parseJsonEnvironment(
      environment.ZOEN_FISCAL_ADAPTER_OIDC_CLIENTS,
      "ZOEN_FISCAL_ADAPTER_OIDC_CLIENTS",
    ),
    oidcTokenUrl: new URL(
      requiredEnvironment(
        environment.ZOEN_FISCAL_ADAPTER_OIDC_TOKEN_URL,
        "ZOEN_FISCAL_ADAPTER_OIDC_TOKEN_URL",
      ),
    ),
    providerRoutes:
      environment.ZOEN_FISCAL_ADAPTER_ROUTES === undefined
        ? legacyProviderRoutes(environment, providerTimeoutMs)
        : parseJsonEnvironment(
            environment.ZOEN_FISCAL_ADAPTER_ROUTES,
            "ZOEN_FISCAL_ADAPTER_ROUTES",
          ),
    zoenUrl: new URL(
      requiredEnvironment(
        environment.ZOEN_FISCAL_ADAPTER_ZOEN_URL,
        "ZOEN_FISCAL_ADAPTER_ZOEN_URL",
      ),
    ),
  };
}

function legacyProviderRoutes(
  environment: NodeJS.ProcessEnv,
  timeoutMs: number,
): unknown {
  const provider = fiscalProviderSchema.parse(
    environment.ZOEN_FISCAL_ADAPTER_PROVIDER,
  );
  const route = {
    baseUrl: requiredEnvironment(
      environment.ZOEN_FISCAL_ADAPTER_PROVIDER_BASE_URL,
      "ZOEN_FISCAL_ADAPTER_PROVIDER_BASE_URL",
    ),
    credential: requiredEnvironment(
      environment.ZOEN_FISCAL_ADAPTER_PROVIDER_CREDENTIAL,
      "ZOEN_FISCAL_ADAPTER_PROVIDER_CREDENTIAL",
    ),
    provider,
    timeoutMs,
  };
  return provider === "systax"
    ? { documents: {}, tax: route }
    : { documents: { "*": route } };
}

function requiredEnvironment(
  value: string | undefined,
  name: string,
): string {
  if (value === undefined || value === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}

function positiveIntegerEnvironment(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function parseJsonEnvironment(
  value: string | undefined,
  name: string,
): unknown {
  const raw = requiredEnvironment(value, name);
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${name} must be valid JSON`);
  }
}
