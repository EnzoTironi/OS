import { z } from "zod";
import {
  type NeutralFiscalOperation,
  type ProviderDispatchResult,
  type ProviderStatusResult,
  type SubmitDocumentOperation,
  type VendorAdapter,
} from "../contracts.js";
import {
  fallbackOperationId,
  observedAtMicros,
  VendorHttpClient,
} from "../http.js";

const plugNotasDispatchSchema = z.object({
  documents: z
    .array(
      z.object({
        id: z.string().min(1),
        idIntegracao: z.string().min(1),
        status: z
          .enum([
            "AGENDADO",
            "CANCELADO",
            "CONCLUIDO",
            "PENDENTE",
            "PROCESSANDO",
            "REJEITADO",
          ])
          .optional(),
      }),
    )
    .min(1),
  protocol: z.string().min(1),
});

const plugNotasEventSchema = z.object({
  id: z.string().min(1),
  status: z.enum([
    "AGENDADO",
    "CANCELADO",
    "CONCLUIDO",
    "PENDENTE",
    "PROCESSANDO",
    "REJEITADO",
  ]),
});

const plugNotasStatusSchema = z
  .array(
    z.object({
      chave: z.string().optional(),
      id: z.string().min(1),
      protocolo: z.string().optional(),
      status: z.enum([
        "AGENDADO",
        "CANCELADO",
        "CONCLUIDO",
        "PENDENTE",
        "PROCESSANDO",
        "REJEITADO",
      ]),
      xml: z.string().url().optional(),
    }),
  )
  .min(1);

type PlugNotasStatus =
  | "AGENDADO"
  | "CANCELADO"
  | "CONCLUIDO"
  | "PENDENTE"
  | "PROCESSANDO"
  | "REJEITADO";

export class PlugNotasAdapter implements VendorAdapter {
  readonly #http: VendorHttpClient;

  constructor(http: VendorHttpClient) {
    this.#http = http;
  }

  async dispatch(input: {
    readonly idempotencyKey: string;
    readonly operation: NeutralFiscalOperation;
  }): Promise<ProviderDispatchResult> {
    switch (input.operation.kind) {
      case "submit_document":
        return this.#submit(input.idempotencyKey, input.operation);
      case "cancel_document":
        return this.#event({
          body: { justificativa: input.operation.reason },
          idempotencyKey: input.idempotencyKey,
          path: `/nfe/${encodeURIComponent(input.operation.providerOperationReference)}/cancelar`,
        });
      case "correct_document":
        return this.#event({
          body: { correcao: input.operation.correction },
          idempotencyKey: input.idempotencyKey,
          path: `/nfe/${encodeURIComponent(input.operation.providerOperationReference)}/cce`,
        });
      case "tax_determination":
        return providerError(422, "PlugNotas cannot determine taxes");
      default: {
        const exhaustive: never = input.operation;
        throw new Error(`unsupported fiscal operation: ${String(exhaustive)}`);
      }
    }
  }

  async status(input: {
    readonly idempotencyKey: string;
    readonly operation: NeutralFiscalOperation;
  }): Promise<ProviderStatusResult> {
    const path = statusPath(input.idempotencyKey, input.operation);
    if (path === undefined) {
      return { kind: "not_found" };
    }
    const response = await this.#http.request({
      credentialHeader: "x-api-key",
      method: "GET",
      path,
    });
    if (response.status === 404) {
      return { kind: "not_found" };
    }
    if (response.status < 200 || response.status >= 300) {
      return providerError(response.status, "PlugNotas status failed");
    }
    const parsed = plugNotasStatusSchema.safeParse(response.body);
    if (!parsed.success) {
      return providerError(502, "PlugNotas status schema changed");
    }
    const document = parsed.data[0];
    if (document === undefined) {
      return providerError(502, "PlugNotas returned an empty status");
    }
    return {
      kind: "found",
      status: {
        evidenceDigest: response.bodyDigest,
        idempotencyKey: input.idempotencyKey,
        observedAtMicros: observedAtMicros(),
        outcome: observedOutcome(document.status),
        providerOperationId: document.id,
        sourceRef: `urn:zoen:fiscal:plugnotas:${document.id}:artifact-sha256:${response.bodyDigest}`,
      },
    };
  }

  async #submit(
    idempotencyKey: string,
    operation: SubmitDocumentOperation,
  ): Promise<ProviderDispatchResult> {
    if (operation.documentModel !== "nfe") {
      return providerError(422, "PlugNotas adapter supports the nfe model");
    }
    const response = await this.#http.request({
      body: plugNotasDocument(idempotencyKey, operation),
      credentialHeader: "x-api-key",
      idempotencyKey,
      method: "POST",
      path: "/nfe",
    });
    if (response.status === 401 || response.status === 403) {
      return providerError(response.status, "provider credential rejected");
    }
    if (response.status < 200 || response.status >= 300) {
      return providerError(response.status, "PlugNotas submission failed");
    }
    const parsed = plugNotasDispatchSchema.safeParse(response.body);
    if (!parsed.success) {
      return invalidResponse(idempotencyKey);
    }
    const document = parsed.data.documents[0];
    if (document === undefined || document.idIntegracao !== idempotencyKey) {
      return invalidResponse(idempotencyKey);
    }
    if (document.status === "REJEITADO") {
      return confirmedNoEffect(document.id);
    }
    if (
      document.status === "CONCLUIDO" ||
      document.status === "CANCELADO"
    ) {
      return confirmed(document.id);
    }
    return acceptedPending(document.id);
  }

  async #event(input: {
    readonly body: unknown;
    readonly idempotencyKey: string;
    readonly path: string;
  }): Promise<ProviderDispatchResult> {
    const response = await this.#http.request({
      body: input.body,
      credentialHeader: "x-api-key",
      idempotencyKey: input.idempotencyKey,
      method: "POST",
      path: input.path,
    });
    if (response.status === 401 || response.status === 403) {
      return providerError(response.status, "provider credential rejected");
    }
    if (response.status < 200 || response.status >= 300) {
      return providerError(response.status, "PlugNotas fiscal event failed");
    }
    const parsed = plugNotasEventSchema.safeParse(response.body);
    if (!parsed.success) {
      return invalidResponse(input.idempotencyKey);
    }
    if (parsed.data.status === "REJEITADO") {
      return confirmedNoEffect(parsed.data.id);
    }
    if (
      parsed.data.status === "CONCLUIDO" ||
      parsed.data.status === "CANCELADO"
    ) {
      return confirmed(parsed.data.id);
    }
    return acceptedPending(parsed.data.id);
  }
}

function plugNotasDocument(
  idempotencyKey: string,
  operation: SubmitDocumentOperation,
) {
  const content = operation.content;
  return [
    {
      destinatario: {
        cpfCnpj: content.recipient.taxRegistration,
        endereco: {
          bairro: content.recipient.address.district,
          cep: content.recipient.address.postalCode,
          codigoCidade: content.recipient.address.cityCode,
          codigoPais: content.recipient.address.countryCode,
          descricaoCidade: content.recipient.address.city,
          estado: content.recipient.address.region,
          logradouro: content.recipient.address.street,
          numero: content.recipient.address.streetNumber,
        },
        razaoSocial: content.recipient.name,
      },
      emitente: {
        cpfCnpj: content.issuer.taxRegistration,
      },
      idIntegracao: idempotencyKey,
      itens: content.lines.map((line) => ({
        cfop: line.operationCode,
        codigo: line.productReference,
        descricao: line.description,
        ncm: line.classificationCode,
        quantidade: {
          comercial: jsonNumber(line.quantity),
          tributavel: jsonNumber(line.quantity),
        },
        tributos: {
          cofins: {
            aliquota: jsonNumber(line.tax.cofinsRate),
            valor: jsonNumber(line.tax.cofinsAmount),
          },
          icms: {
            aliquota: jsonNumber(line.tax.icmsRate),
            valor: jsonNumber(line.tax.icmsAmount),
          },
          pis: {
            aliquota: jsonNumber(line.tax.pisRate),
            valor: jsonNumber(line.tax.pisAmount),
          },
        },
        unidade: {
          comercial: line.unit,
          tributavel: line.unit,
        },
        valor: jsonNumber(line.unitPrice) * jsonNumber(line.quantity),
        valorUnitario: {
          comercial: jsonNumber(line.unitPrice),
          tributavel: jsonNumber(line.unitPrice),
        },
      })),
      natureza: content.nature,
      pagamentos: [
        {
          aVista: content.payment.paidAtSight,
          meio: content.payment.methodCode,
          valor: jsonNumber(content.totals.amount),
        },
      ],
    },
  ];
}

function statusPath(
  idempotencyKey: string,
  operation: NeutralFiscalOperation,
): string | undefined {
  switch (operation.kind) {
    case "submit_document":
      return `/nfe/${encodeURIComponent(operation.issuerRegistration)}/${encodeURIComponent(idempotencyKey)}/resumo`;
    case "cancel_document":
    case "correct_document":
      return `/nfe/${encodeURIComponent(operation.providerOperationReference)}/resumo`;
    case "tax_determination":
      return undefined;
    default: {
      const exhaustive: never = operation;
      throw new Error(`unsupported fiscal operation: ${String(exhaustive)}`);
    }
  }
}

function observedOutcome(
  status: PlugNotasStatus,
): "effect" | "no_effect" | "pending" {
  switch (status) {
    case "CANCELADO":
    case "CONCLUIDO":
      return "effect";
    case "REJEITADO":
      return "no_effect";
    case "AGENDADO":
    case "PENDENTE":
    case "PROCESSANDO":
      return "pending";
    default: {
      const exhaustive: never = status;
      throw new Error(`unsupported PlugNotas status: ${String(exhaustive)}`);
    }
  }
}

function acceptedPending(providerOperationId: string): ProviderDispatchResult {
  return {
    body: { outcome: "accepted_pending", providerOperationId },
    kind: "accepted_pending",
    status: 202,
  };
}

function confirmed(providerOperationId: string): ProviderDispatchResult {
  return {
    body: { outcome: "confirmed", providerOperationId },
    kind: "confirmed",
    status: 200,
  };
}

function confirmedNoEffect(providerOperationId: string): ProviderDispatchResult {
  return {
    body: { outcome: "confirmed_no_effect", providerOperationId },
    kind: "confirmed_no_effect",
    status: 200,
  };
}

function invalidResponse(idempotencyKey: string): ProviderDispatchResult {
  return {
    body: {
      outcome: "response_schema_error",
      providerOperationId: fallbackOperationId("plugnotas", idempotencyKey),
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
