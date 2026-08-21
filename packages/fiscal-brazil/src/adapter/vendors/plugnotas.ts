import { z } from "zod";
import {
  type DocumentAuthorizationWriteback,
  type NeutralFiscalOperation,
  type ProviderDispatchResult,
  type ProviderStatusResult,
  type SubmitDocumentOperation,
  type VendorAdapter,
} from "../contracts.js";
import {
  decimalJsonNumber,
  multiplyExactDecimals,
} from "../decimal.js";
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
      evento: z.enum(["CANCELAMENTO", "CARTA_CORRECAO"]).optional(),
      id: z.string().min(1),
      protocolo: z.string().optional(),
      revisao: z.number().int().positive().optional(),
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
          kind: input.operation.kind,
          idempotencyKey: input.idempotencyKey,
          path: `/nfe/${encodeURIComponent(rawPlugNotasId(input.operation.providerOperationReference))}/cancelar`,
        });
      case "correct_document":
        return this.#event({
          body: { correcao: input.operation.correction },
          kind: input.operation.kind,
          idempotencyKey: input.idempotencyKey,
          path: `/nfe/${encodeURIComponent(rawPlugNotasId(input.operation.providerOperationReference))}/cce`,
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
    const outcome = observedOutcome(input.operation.kind, document);
    const providerOperationId = plugNotasProviderId(document.id);
    const result: Extract<ProviderStatusResult, { kind: "found" }> = {
      kind: "found",
      status: {
        evidenceDigest: response.bodyDigest,
        idempotencyKey: input.idempotencyKey,
        observedAtMicros: observedAtMicros(),
        outcome,
        providerOperationId,
        sourceRef: `urn:zoen:fiscal:plugnotas:${document.id}:response-sha256:${response.bodyDigest}`,
      },
    };
    if (
      outcome !== "confirmed" ||
      input.operation.kind !== "submit_document"
    ) {
      return result;
    }
    const writeback = await this.#authorizationWriteback(document);
    if (writeback === undefined) {
      return providerError(502, "PlugNotas authorization evidence is incomplete");
    }
    return { ...result, writeback };
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
      return confirmedNoEffect(plugNotasProviderId(document.id));
    }
    return acceptedPending(plugNotasProviderId(document.id));
  }

  async #event(input: {
    readonly body: unknown;
    readonly kind: "cancel_document" | "correct_document";
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
      return confirmedNoEffect(plugNotasProviderId(parsed.data.id));
    }
    const providerOperationId = plugNotasProviderId(parsed.data.id);
    if (eventDispatchConfirmed(input.kind, parsed.data.status)) {
      return confirmed(providerOperationId);
    }
    return acceptedPending(providerOperationId);
  }

  async #authorizationWriteback(
    document: z.infer<typeof plugNotasStatusSchema>[number],
  ): Promise<DocumentAuthorizationWriteback | undefined> {
    if (
      document.chave === undefined ||
      document.protocolo === undefined ||
      document.revisao === undefined ||
      document.xml === undefined
    ) {
      return undefined;
    }
    const artifact = await this.#http.requestBytes({
      credentialHeader: "x-api-key",
      method: "GET",
      url: new URL(document.xml),
    });
    if (artifact.status < 200 || artifact.status >= 300) {
      return undefined;
    }
    return {
      accessKey: document.chave,
      artifactDigest: artifact.bodyDigest,
      authorityStatus: "authorized",
      kind: "document_authorization",
      protocol: document.protocolo,
      provider: "plugnotas",
      providerOperationId: plugNotasProviderId(document.id),
      remoteRevision: document.revisao.toString(),
    };
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
          comercial: decimalJsonNumber(line.quantity),
          tributavel: decimalJsonNumber(line.quantity),
        },
        tributos: {
          cofins: {
            aliquota: decimalJsonNumber(line.tax.cofinsRate),
            valor: decimalJsonNumber(line.tax.cofinsAmount),
          },
          icms: {
            aliquota: decimalJsonNumber(line.tax.icmsRate),
            valor: decimalJsonNumber(line.tax.icmsAmount),
          },
          pis: {
            aliquota: decimalJsonNumber(line.tax.pisRate),
            valor: decimalJsonNumber(line.tax.pisAmount),
          },
        },
        unidade: {
          comercial: line.unit,
          tributavel: line.unit,
        },
        valor: decimalJsonNumber(
          multiplyExactDecimals(line.unitPrice, line.quantity),
        ),
        valorUnitario: {
          comercial: decimalJsonNumber(line.unitPrice),
          tributavel: decimalJsonNumber(line.unitPrice),
        },
      })),
      natureza: content.nature,
      pagamentos: [
        {
          aVista: content.payment.paidAtSight,
          meio: content.payment.methodCode,
          valor: decimalJsonNumber(content.totals.amount),
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
      return `/nfe/${encodeURIComponent(rawPlugNotasId(operation.providerOperationReference))}/resumo`;
    case "tax_determination":
      return undefined;
    default: {
      const exhaustive: never = operation;
      throw new Error(`unsupported fiscal operation: ${String(exhaustive)}`);
    }
  }
}

function observedOutcome(
  operation: NeutralFiscalOperation["kind"],
  document: z.infer<typeof plugNotasStatusSchema>[number],
): "confirmed" | "no_effect" | "pending" {
  switch (operation) {
    case "submit_document":
      return submitOutcome(document.status);
    case "cancel_document":
      if (
        document.status === "CANCELADO" ||
        (document.status === "CONCLUIDO" &&
          document.evento === "CANCELAMENTO")
      ) {
        return "confirmed";
      }
      return document.status === "REJEITADO" ? "no_effect" : "pending";
    case "correct_document":
      if (
        document.status === "CONCLUIDO" &&
        document.evento === "CARTA_CORRECAO"
      ) {
        return "confirmed";
      }
      return document.status === "REJEITADO" ? "no_effect" : "pending";
    case "tax_determination":
      return "pending";
    default: {
      const exhaustive: never = operation;
      throw new Error(`unsupported fiscal operation: ${String(exhaustive)}`);
    }
  }
}

function submitOutcome(
  status: PlugNotasStatus,
): "confirmed" | "no_effect" | "pending" {
  switch (status) {
    case "CONCLUIDO":
      return "confirmed";
    case "CANCELADO":
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

function eventDispatchConfirmed(
  kind: "cancel_document" | "correct_document",
  status: PlugNotasStatus,
): boolean {
  switch (kind) {
    case "cancel_document":
      return status === "CANCELADO" || status === "CONCLUIDO";
    case "correct_document":
      return status === "CONCLUIDO";
    default: {
      const exhaustive: never = kind;
      throw new Error(`unsupported fiscal event: ${String(exhaustive)}`);
    }
  }
}

function plugNotasProviderId(raw: string): string {
  return `plugnotas.${rawPlugNotasId(raw)}`;
}

function rawPlugNotasId(providerOperationId: string): string {
  const raw = providerOperationId.startsWith("plugnotas.")
    ? providerOperationId.slice("plugnotas.".length)
    : providerOperationId;
  if (raw === "") {
    throw new Error("PlugNotas provider operation identity is empty");
  }
  return raw;
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
