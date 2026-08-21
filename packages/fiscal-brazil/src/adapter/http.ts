import { createHash } from "node:crypto";

export type VendorHttpResponse = {
  readonly body: unknown;
  readonly bodyDigest: string;
  readonly status: number;
};

export type VendorBytesResponse = {
  readonly body: Uint8Array;
  readonly bodyDigest: string;
  readonly status: number;
};

export class VendorHttpClient {
  readonly #baseUrl: URL;
  readonly #credential: string;
  readonly #timeoutMs: number;

  constructor(input: {
    readonly baseUrl: URL;
    readonly credential: string;
    readonly timeoutMs: number;
  }) {
    this.#baseUrl = input.baseUrl;
    this.#credential = input.credential;
    this.#timeoutMs = input.timeoutMs;
  }

  request(input: {
    readonly body?: unknown;
    readonly credentialHeader: "authorization" | "x-api-key";
    readonly idempotencyKey?: string;
    readonly method: "GET" | "POST";
    readonly path: string;
  }): Promise<VendorHttpResponse> {
    const url = new URL(input.path, this.#baseUrl);
    const headers = this.#headers({
      accepts: "application/json",
      credentialHeader: input.credentialHeader,
      idempotencyKey: input.idempotencyKey,
      url,
    });
    if (input.body !== undefined) {
      headers.set("content-type", "application/json");
    }
    return requestJson({
      body: input.body,
      headers,
      method: input.method,
      timeoutMs: this.#timeoutMs,
      url,
    });
  }

  requestBytes(input: {
    readonly credentialHeader: "authorization" | "x-api-key";
    readonly method: "GET";
    readonly url: URL;
  }): Promise<VendorBytesResponse> {
    return requestBytes({
      headers: this.#headers({
        accepts: "application/xml",
        credentialHeader: input.credentialHeader,
        url: input.url,
      }),
      method: input.method,
      timeoutMs: this.#timeoutMs,
      url: input.url,
    });
  }

  #headers(input: {
    readonly accepts: string;
    readonly credentialHeader: "authorization" | "x-api-key";
    readonly idempotencyKey?: string;
    readonly url: URL;
  }): Headers {
    if (
      input.credentialHeader === "x-api-key" &&
      input.url.origin !== this.#baseUrl.origin
    ) {
      throw new Error("refusing to send an API key across origins");
    }
    const headers = new Headers({ accept: input.accepts });
    if (input.idempotencyKey !== undefined) {
      headers.set("idempotency-key", input.idempotencyKey);
    }
    if (input.credentialHeader === "authorization") {
      headers.set("authorization", `Bearer ${this.#credential}`);
    } else {
      headers.set("x-api-key", this.#credential);
    }
    return headers;
  }
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function fallbackOperationId(
  provider: string,
  idempotencyKey: string,
): string {
  return `${provider}.${sha256(idempotencyKey).slice(0, 24)}`;
}

export function observedAtMicros(): string {
  return (BigInt(Date.now()) * 1_000n).toString();
}

async function requestJson(input: {
  readonly body?: unknown;
  readonly headers: Headers;
  readonly method: "GET" | "POST";
  readonly timeoutMs: number;
  readonly url: URL;
}): Promise<VendorHttpResponse> {
  const response = await fetch(input.url, {
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    headers: input.headers,
    method: input.method,
    redirect: "error",
    signal: AbortSignal.timeout(input.timeoutMs),
  });
  const text = await response.text();
  let body: unknown = null;
  if (text !== "") {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return {
    body,
    bodyDigest: sha256(text),
    status: response.status,
  };
}

async function requestBytes(input: {
  readonly headers: Headers;
  readonly method: "GET";
  readonly timeoutMs: number;
  readonly url: URL;
}): Promise<VendorBytesResponse> {
  const response = await fetch(input.url, {
    headers: input.headers,
    method: input.method,
    redirect: "error",
    signal: AbortSignal.timeout(input.timeoutMs),
  });
  const body = new Uint8Array(await response.arrayBuffer());
  return {
    body,
    bodyDigest: sha256(body),
    status: response.status,
  };
}
