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

const systaxStatusSchema = z.object({
  idCalculo: z.string().min(1),
  situacao: z.enum(["CONCLUIDO", "ERRO", "INVALIDO", "PENDENTE"]),
});
const systaxDispatchSchema = systaxStatusSchema.extend({
  tributos: z.object({
    estadual: z.string().min(1),
    federal: z.string().min(1),
    municipal: z.string().min(1),
  }),
  versaoRegra: z.string().min(1),
});

export class SystaxAdapter implements VendorAdapter {
  readonly #http: VendorHttpClient;

  constructor(http: VendorHttpClient) {
    this.#http = http;
  }

  async dispatch(input: {
    readonly idempotencyKey: string;
    readonly operation: NeutralFiscalOperation;
  }): Promise<ProviderDispatchResult> {
    if (input.operation.kind !== "tax_determination") {
      return unsupportedOperation("Systax");
    }
    const operation = input.operation;
    const response = await this.#http.request({
      body: {
        codigoOperacao: operation.operationCode,
        dataOperacao: operation.effectiveAt,
        destinatario: {
          cpfCnpj: operation.recipientRegistration,
          uf: operation.destinationRegion,
        },
        emitente: {
          cpfCnpj: operation.issuerRegistration,
        },
        idTransacao: input.idempotencyKey,
        itens: [
          {
            codigoNcm: operation.productClassificationCode,
            codigoProduto: operation.productReference,
            quantidade: operation.quantity.amount,
            unidade: operation.quantity.unit,
            valorUnitario: operation.unitPrice,
          },
        ],
      },
      credentialHeader: "authorization",
      idempotencyKey: input.idempotencyKey,
      method: "POST",
      path: "/v1/tax-determinations",
    });
    if (response.status === 401 || response.status === 403) {
      return providerError(response.status, "provider credential rejected");
    }
    if (response.status < 200 || response.status >= 300) {
      return providerError(response.status, "tax determination provider failed");
    }
    const parsed = systaxDispatchSchema.safeParse(response.body);
    if (!parsed.success) {
      return invalidResponse(input.idempotencyKey);
    }
    switch (parsed.data.situacao) {
      case "CONCLUIDO":
        return {
          body: {
            outcome: "confirmed",
            providerOperationId: parsed.data.idCalculo,
          },
          kind: "confirmed",
          status: 200,
        };
      case "ERRO":
      case "INVALIDO":
        return {
          body: {
            outcome: "confirmed_no_effect",
            providerOperationId: parsed.data.idCalculo,
          },
          kind: "confirmed_no_effect",
          status: 200,
        };
      case "PENDENTE":
        return {
          body: {
            outcome: "accepted_pending",
            providerOperationId: parsed.data.idCalculo,
          },
          kind: "accepted_pending",
          status: 202,
        };
      default: {
        const exhaustive: never = parsed.data.situacao;
        throw new Error(`unsupported Systax status: ${String(exhaustive)}`);
      }
    }
  }

  async status(input: {
    readonly idempotencyKey: string;
    readonly operation: NeutralFiscalOperation;
  }): Promise<ProviderStatusResult> {
    if (input.operation.kind !== "tax_determination") {
      return { kind: "not_found" };
    }
    const response = await this.#http.request({
      credentialHeader: "authorization",
      method: "GET",
      path: `/v1/tax-determinations/by-external-id/${encodeURIComponent(input.idempotencyKey)}`,
    });
    if (response.status === 404) {
      return { kind: "not_found" };
    }
    if (response.status < 200 || response.status >= 300) {
      return providerError(response.status, "tax determination status failed");
    }
    const parsed = systaxStatusSchema.safeParse(response.body);
    if (!parsed.success) {
      return providerError(502, "tax determination status schema changed");
    }
    let outcome: "confirmed" | "no_effect" | "pending";
    switch (parsed.data.situacao) {
      case "CONCLUIDO":
        outcome = "confirmed";
        break;
      case "ERRO":
      case "INVALIDO":
        outcome = "no_effect";
        break;
      case "PENDENTE":
        outcome = "pending";
        break;
      default: {
        const exhaustive: never = parsed.data.situacao;
        throw new Error(`unsupported Systax status: ${String(exhaustive)}`);
      }
    }
    return {
      kind: "found",
      status: {
        evidenceDigest: response.bodyDigest,
        idempotencyKey: input.idempotencyKey,
        observedAtMicros: observedAtMicros(),
        outcome,
        providerOperationId: parsed.data.idCalculo,
        sourceRef: `urn:zoen:fiscal:systax:${parsed.data.idCalculo}:response-sha256:${response.bodyDigest}`,
      },
    };
  }
}

function invalidResponse(idempotencyKey: string): ProviderDispatchResult {
  return {
    body: {
      outcome: "response_schema_error",
      providerOperationId: fallbackOperationId("systax", idempotencyKey),
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

function unsupportedOperation(provider: string): ProviderDispatchResult {
  return providerError(422, `${provider} cannot execute this fiscal operation`);
}
