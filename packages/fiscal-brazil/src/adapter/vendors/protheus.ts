import { z } from "zod";
import {
  type DocumentAuthorizationWriteback,
  type NeutralFiscalOperation,
  type ProviderDispatchResult,
  type ProviderStatusResult,
  type VendorAdapter,
} from "../contracts.js";
import { decimalJsonNumber } from "../decimal.js";
import {
  fallbackOperationId,
  observedAtMicros,
  sha256,
  VendorHttpClient,
} from "../http.js";

const protheusResponseSchema = z.object({
  cAccessKey: z.string().min(1).optional(),
  cAuthorityProtocol: z.string().min(1).optional(),
  cOperationId: z.string().min(1),
  cStatus: z.enum([
    "AUTHORIZED",
    "CANCELLED",
    "CORRECTED",
    "PENDING",
    "REJECTED",
  ]),
  cXml: z.string().min(1).optional(),
  nRevision: z.number().int().positive().optional(),
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
    return dispatchOutcome(
      input.idempotencyKey,
      input.operation,
      parsed.data,
    );
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
    const outcome = observedOutcome(input.operation.kind, parsed.data.cStatus);
    const result: Extract<ProviderStatusResult, { kind: "found" }> = {
      kind: "found",
      status: {
        evidenceDigest: response.bodyDigest,
        idempotencyKey: input.idempotencyKey,
        observedAtMicros: observedAtMicros(),
        outcome,
        providerOperationId: parsed.data.cOperationId,
        sourceRef: `urn:zoen:fiscal:protheus:${parsed.data.cOperationId}:response-sha256:${response.bodyDigest}`,
      },
    };
    if (outcome !== "confirmed" || input.operation.kind !== "submit_document") {
      return result;
    }
    const writeback = authorizationWriteback(parsed.data);
    return writeback === undefined
      ? providerError(502, "Protheus authorization evidence is incomplete")
      : { ...result, writeback };
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
            nCofinsAmount: decimalJsonNumber(line.tax.cofinsAmount),
            nIcmsAmount: decimalJsonNumber(line.tax.icmsAmount),
            nPisAmount: decimalJsonNumber(line.tax.pisAmount),
            nQuantity: decimalJsonNumber(line.quantity),
            nUnitPrice: decimalJsonNumber(line.unitPrice),
          })),
          cAccountingClaim: operation.accountingClaimReference,
          cAuthorityEnvironment: operation.authorityEnvironment,
          cCommercialOperation: operation.commercialOperationReference,
          cDocumentModel: operation.documentModel,
          cExternalId: idempotencyKey,
          cIssuerTaxId: operation.issuerRegistration,
          cRecipientTaxId: operation.recipientRegistration,
          cTaxDetermination: operation.taxDeterminationReference,
          nTotalAmount: decimalJsonNumber(operation.totalAmount),
        },
        path: "/rest/zoen/fiscal/v1/documents",
      };
    case "cancel_document":
      return {
        body: {
          cAuthorityProtocol: operation.authorityProtocol,
          cExternalEventId: idempotencyKey,
          cReason: operation.reason,
          nExpectedRevision: decimalJsonNumber(operation.remoteRevision),
        },
        path: `/rest/zoen/fiscal/v1/documents/${encodeURIComponent(operation.providerOperationReference)}/cancel`,
      };
    case "correct_document":
      return {
        body: {
          cAuthorityProtocol: operation.authorityProtocol,
          cCorrection: operation.correction,
          cExternalEventId: idempotencyKey,
          nExpectedRevision: decimalJsonNumber(operation.remoteRevision),
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
  idempotencyKey: string,
  operation: NeutralFiscalOperation,
  response: z.infer<typeof protheusResponseSchema>,
): ProviderDispatchResult {
  const outcome = observedOutcome(operation.kind, response.cStatus);
  switch (outcome) {
    case "confirmed": {
      const writeback =
        operation.kind === "submit_document"
          ? authorizationWriteback(response)
          : undefined;
      if (operation.kind === "submit_document" && writeback === undefined) {
        return invalidResponse(idempotencyKey);
      }
      return {
        body: {
          outcome: "confirmed",
          providerOperationId: response.cOperationId,
        },
        kind: "confirmed",
        status: 200,
        writeback,
      };
    }
    case "pending":
      return {
        body: {
          outcome: "accepted_pending",
          providerOperationId: response.cOperationId,
        },
        kind: "accepted_pending",
        status: 202,
      };
    case "no_effect":
      return {
        body: {
          outcome: "confirmed_no_effect",
          providerOperationId: response.cOperationId,
        },
        kind: "confirmed_no_effect",
        status: 200,
      };
    default: {
      const exhaustive: never = outcome;
      throw new Error(`unsupported Protheus outcome: ${String(exhaustive)}`);
    }
  }
}

function observedOutcome(
  operation: NeutralFiscalOperation["kind"],
  status: ProtheusStatus,
): "confirmed" | "no_effect" | "pending" {
  if (status === "REJECTED") {
    return "no_effect";
  }
  if (status === "PENDING") {
    return "pending";
  }
  switch (operation) {
    case "submit_document":
      return status === "AUTHORIZED" ? "confirmed" : "no_effect";
    case "cancel_document":
      return status === "CANCELLED" ? "confirmed" : "pending";
    case "correct_document":
      return status === "CORRECTED" ? "confirmed" : "pending";
    case "tax_determination":
      return "pending";
    default: {
      const exhaustive: never = operation;
      throw new Error(`unsupported fiscal operation: ${String(exhaustive)}`);
    }
  }
}

function authorizationWriteback(
  response: z.infer<typeof protheusResponseSchema>,
): DocumentAuthorizationWriteback | undefined {
  if (
    response.cAccessKey === undefined ||
    response.cAuthorityProtocol === undefined ||
    response.cXml === undefined ||
    response.nRevision === undefined
  ) {
    return undefined;
  }
  return {
    accessKey: response.cAccessKey,
    artifactDigest: sha256(response.cXml),
    authorityStatus: "authorized",
    kind: "document_authorization",
    protocol: response.cAuthorityProtocol,
    provider: "protheus",
    providerOperationId: response.cOperationId,
    remoteRevision: response.nRevision.toString(),
  };
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
