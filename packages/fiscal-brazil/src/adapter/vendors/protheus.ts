import { z } from "zod";
import {
  type NeutralFiscalOperation,
  type ProviderDispatchResult,
  type ProviderStatusResult,
  type VendorAdapter,
} from "../contracts.js";
import {
  fallbackOperationId,
  observedAtMicros,
  VendorHttpClient,
} from "../http.js";

const protheusResponseSchema = z.object({
  cOperationId: z.string().min(1),
  cStatus: z.enum([
    "AUTHORIZED",
    "CANCELLED",
    "CORRECTED",
    "PENDING",
    "REJECTED",
  ]),
});

type ProtheusStatus =
  | "AUTHORIZED"
  | "CANCELLED"
  | "CORRECTED"
  | "PENDING"
  | "REJECTED";

export class ProtheusAdapter implements VendorAdapter {
  readonly #http: VendorHttpClient;

  constructor(http: VendorHttpClient) {
    this.#http = http;
  }

  async dispatch(input: {
    readonly idempotencyKey: string;
    readonly operation: NeutralFiscalOperation;
  }): Promise<ProviderDispatchResult> {
    const mapped = protheusRequest(input.idempotencyKey, input.operation);
    if (mapped === undefined) {
      return providerError(422, "Protheus cannot determine taxes");
    }
    const response = await this.#http.request({
      body: mapped.body,
      credentialHeader: "authorization",
      idempotencyKey: input.idempotencyKey,
      method: "POST",
      path: mapped.path,
    });
    if (response.status === 401 || response.status === 403) {
      return providerError(response.status, "provider credential rejected");
    }
    if (response.status < 200 || response.status >= 300) {
      return providerError(response.status, "Protheus fiscal execution failed");
    }
    const parsed = protheusResponseSchema.safeParse(response.body);
    if (!parsed.success) {
      return invalidResponse(input.idempotencyKey);
    }
    return dispatchOutcome(parsed.data.cOperationId, parsed.data.cStatus);
  }

  async status(input: {
    readonly idempotencyKey: string;
    readonly operation: NeutralFiscalOperation;
  }): Promise<ProviderStatusResult> {
    if (input.operation.kind === "tax_determination") {
      return { kind: "not_found" };
    }
    const response = await this.#http.request({
      credentialHeader: "authorization",
      method: "GET",
      path: `/rest/zoen/fiscal/v1/documents/by-external-id/${encodeURIComponent(input.idempotencyKey)}`,
    });
    if (response.status === 404) {
      return { kind: "not_found" };
    }
    if (response.status < 200 || response.status >= 300) {
      return providerError(response.status, "Protheus fiscal status failed");
    }
    const parsed = protheusResponseSchema.safeParse(response.body);
    if (!parsed.success) {
      return providerError(502, "Protheus fiscal status schema changed");
    }
    return {
      kind: "found",
      status: {
        evidenceDigest: response.bodyDigest,
        idempotencyKey: input.idempotencyKey,
        observedAtMicros: observedAtMicros(),
        outcome: observedOutcome(parsed.data.cStatus),
        providerOperationId: parsed.data.cOperationId,
        sourceRef: `urn:zoen:fiscal:protheus:${parsed.data.cOperationId}:artifact-sha256:${response.bodyDigest}`,
      },
    };
  }
}

function protheusRequest(
  idempotencyKey: string,
  operation: NeutralFiscalOperation,
): { readonly body: unknown; readonly path: string } | undefined {
  switch (operation.kind) {
    case "submit_document":
      return {
        body: {
          aItems: operation.content.lines.map((line) => ({
            cClassification: line.classificationCode,
            cDescription: line.description,
            cFiscalOperation: line.operationCode,
            cProductCode: line.productReference,
            cUnit: line.unit,
            nCofinsAmount: jsonNumber(line.tax.cofinsAmount),
            nIcmsAmount: jsonNumber(line.tax.icmsAmount),
            nPisAmount: jsonNumber(line.tax.pisAmount),
            nQuantity: jsonNumber(line.quantity),
            nUnitPrice: jsonNumber(line.unitPrice),
          })),
          cAccountingClaim: operation.accountingClaimReference,
          cAuthorityEnvironment: operation.authorityEnvironment,
          cCommercialOperation: operation.commercialOperationReference,
          cDocumentModel: operation.documentModel,
          cExternalId: idempotencyKey,
          cIssuerTaxId: operation.issuerRegistration,
          cRecipientTaxId: operation.recipientRegistration,
          cTaxDetermination: operation.taxDeterminationReference,
          nTotalAmount: jsonNumber(operation.totalAmount),
        },
        path: "/rest/zoen/fiscal/v1/documents",
      };
    case "cancel_document":
      return {
        body: {
          cAuthorityProtocol: operation.authorityProtocol,
          cExternalEventId: idempotencyKey,
          cReason: operation.reason,
          nExpectedRevision: jsonNumber(operation.remoteRevision),
        },
        path: `/rest/zoen/fiscal/v1/documents/${encodeURIComponent(operation.providerOperationReference)}/cancel`,
      };
    case "correct_document":
      return {
        body: {
          cAuthorityProtocol: operation.authorityProtocol,
          cCorrection: operation.correction,
          cExternalEventId: idempotencyKey,
          nExpectedRevision: jsonNumber(operation.remoteRevision),
        },
        path: `/rest/zoen/fiscal/v1/documents/${encodeURIComponent(operation.providerOperationReference)}/correct`,
      };
    case "tax_determination":
      return undefined;
    default: {
      const exhaustive: never = operation;
      throw new Error(`unsupported fiscal operation: ${String(exhaustive)}`);
    }
  }
}

function dispatchOutcome(
  providerOperationId: string,
  status: ProtheusStatus,
): ProviderDispatchResult {
  switch (status) {
    case "AUTHORIZED":
    case "CANCELLED":
    case "CORRECTED":
      return {
        body: { outcome: "confirmed", providerOperationId },
        kind: "confirmed",
        status: 200,
      };
    case "PENDING":
      return {
        body: { outcome: "accepted_pending", providerOperationId },
        kind: "accepted_pending",
        status: 202,
      };
    case "REJECTED":
      return {
        body: { outcome: "confirmed_no_effect", providerOperationId },
        kind: "confirmed_no_effect",
        status: 200,
      };
    default: {
      const exhaustive: never = status;
      throw new Error(`unsupported Protheus status: ${String(exhaustive)}`);
    }
  }
}

function observedOutcome(
  status: ProtheusStatus,
): "confirmed" | "no_effect" | "pending" {
  switch (status) {
    case "AUTHORIZED":
    case "CANCELLED":
    case "CORRECTED":
      return "confirmed";
    case "PENDING":
      return "pending";
    case "REJECTED":
      return "no_effect";
    default: {
      const exhaustive: never = status;
      throw new Error(`unsupported Protheus status: ${String(exhaustive)}`);
    }
  }
}

function invalidResponse(idempotencyKey: string): ProviderDispatchResult {
  return {
    body: {
      outcome: "response_schema_error",
      providerOperationId: fallbackOperationId("protheus", idempotencyKey),
    },
    kind: "invalid_response",
    status: 200,
  };
}

function providerError(
  status: number,
  error: string,
): Extract<ProviderDispatchResult, { kind: "provider_error" }> &
  Extract<ProviderStatusResult, { kind: "provider_error" }> {
  return {
    body: { error },
    kind: "provider_error",
    status,
  };
}

function jsonNumber(value: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error("fiscal decimal is outside the JSON number range");
  }
  return number;
}
