import { timingSafeEqual } from "node:crypto";
import { create } from "@bufbuild/protobuf";
import {
  createClient,
  type Interceptor,
} from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import { z } from "zod";
import { EffectService } from "../../../sdk/src/gen/zoen/effect/v1/effect_pb.js";
import {
  ExplanationTargetSchema,
  HistoryService,
} from "../../../sdk/src/gen/zoen/history/v1/history_pb.js";
import {
  QueryConsistencySchema,
  QuerySelectionSchema,
  type DefinitionReference,
  type SemanticValueResult,
  StrongConsistencySchema,
  WorldService,
} from "../../../sdk/src/gen/zoen/world/v1/world_pb.js";
import {
  claimRecordedSchema,
  type ConnectorDispatch,
  fiscalActionSchema,
  fiscalDocumentContentSchema,
  type NeutralFiscalOperation,
} from "./contracts.js";
import { sha256 } from "./http.js";

const oidcClientsSchema = z.record(
  z.string().min(1),
  z.object({
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
  }),
);
const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive().default(60),
});

type OidcClients = z.infer<typeof oidcClientsSchema>;

type CachedToken = {
  readonly expiresAt: number;
  readonly value: string;
};

export class FiscalContextReader {
  readonly #clients: OidcClients;
  readonly #tokenCache = new Map<string, CachedToken>();
  readonly #tokenUrl: URL;
  readonly #zoenUrl: URL;

  constructor(input: {
    readonly clients: unknown;
    readonly tokenUrl: URL;
    readonly zoenUrl: URL;
  }) {
    this.#clients = oidcClientsSchema.parse(input.clients);
    this.#tokenUrl = input.tokenUrl;
    this.#zoenUrl = input.zoenUrl;
  }

  async read(request: ConnectorDispatch): Promise<NeutralFiscalOperation> {
    return this.#read(
      {
        effectRequestId: request.effectRequestId,
        idempotencyKey: request.idempotencyKey,
        tenantId: request.tenantId,
      },
      request,
    );
  }

  async readStatus(input: {
    readonly idempotencyKey: string;
    readonly tenantId: string;
  }): Promise<NeutralFiscalOperation> {
    const prefix = `idempotency.${input.tenantId}.`;
    if (!input.idempotencyKey.startsWith(prefix)) {
      throw new Error("idempotency key is not bound to the caller tenant");
    }
    const effectRequestId = input.idempotencyKey.slice(prefix.length);
    if (effectRequestId === "") {
      throw new Error("idempotency key has no effect request identity");
    }
    return this.#read({
      effectRequestId,
      idempotencyKey: input.idempotencyKey,
      tenantId: input.tenantId,
    });
  }

  async #read(
    identity: {
      readonly effectRequestId: string;
      readonly idempotencyKey: string;
      readonly tenantId: string;
    },
    dispatch?: ConnectorDispatch,
  ): Promise<NeutralFiscalOperation> {
    const token = await this.#token(identity.tenantId);
    const clients = serviceClients(this.#zoenUrl, token);
    const effectResponse = await clients.effect.getEffect({
      effectRequestId: identity.effectRequestId,
    });
    const effect = effectResponse.snapshot?.request;
    if (effect === undefined) {
      throw new Error("effect request is unavailable");
    }
    if (
      effect.effectRequestId !== identity.effectRequestId ||
      effect.idempotencyKey !== identity.idempotencyKey
    ) {
      throw new Error("effect identity does not match the adapter request");
    }
    if (dispatch !== undefined) {
      verifyEffectPointer(dispatch, effect);
    }

    const pointerJson: unknown = JSON.parse(
      Buffer.from(effect.payload).toString("utf8"),
    );
    const pointer = claimRecordedSchema.parse(pointerJson);
    const history = await clients.history.explain({
      target: create(ExplanationTargetSchema, {
        target: {
          case: "operationId",
          value: effect.operationId,
        },
      }),
    });
    const explanation = history.explanation;
    if (explanation?.subject.case !== "action") {
      throw new Error("effect operation does not explain a committed Action");
    }
    const action = explanation.subject.value;
    const proposal = action.proposal?.structure;
    const definition = action.definition?.reference;
    const commit = action.commit;
    if (
      proposal === undefined ||
      definition === undefined ||
      commit === undefined ||
      proposal.validAt === undefined
    ) {
      throw new Error("Action explanation is incomplete");
    }
    const actionId = fiscalActionSchema.parse(proposal.actionId);
    if (
      definition.definitionId !== pointer.definitionId ||
      definition.digest !== pointer.digest ||
      definition.revision !== BigInt(pointer.revision)
    ) {
      throw new Error("effect pointer does not match the Action definition");
    }
    const record = commit.records.find(
      (candidate) => candidate.structure?.claimId === pointer.claimId,
    );
    if (
      record?.structure === undefined ||
      record.structure.entityId !== proposal.resourceId
    ) {
      throw new Error("effect pointer does not identify an Action commit record");
    }
    const expectedRelation = effectRelation(actionId);
    if (record.structure.relationId !== expectedRelation) {
      throw new Error("effect pointer identifies the wrong Action relation");
    }

    const validAt = new Date(
      Number(proposal.validAt.seconds) * 1_000 +
        proposal.validAt.nanos / 1_000_000,
    );
    const query = new SemanticReader({
      client: clients.world,
      definition,
      entityId: proposal.resourceId,
      tenantId: identity.tenantId,
      validAt,
    });
    const requestReference = await query.textFromClaim(
      expectedRelation,
      pointer.claimId,
    );

    switch (actionId) {
      case "fiscal.requestTaxDetermination": {
        const [
          commercialOperationReference,
          destinationRegion,
          effectiveAt,
          issuerRegistration,
          operationCode,
          productClassificationCode,
          productReference,
          quantity,
          recipientRegistration,
          unitPrice,
        ] = await Promise.all([
          query.text("fiscal.originatingCommercialOperationReference"),
          query.text("fiscal.destinationRegion"),
          query.text("fiscal.taxEffectiveAt"),
          query.text("fiscal.taxIssuerRegistration"),
          query.text("fiscal.operationCode"),
          query.text("fiscal.productClassificationCode"),
          query.text("fiscal.taxProductReference"),
          query.quantity("fiscal.taxQuantity"),
          query.text("fiscal.taxRecipientRegistration"),
          query.decimal("fiscal.taxUnitPrice"),
        ]);
        return {
          commercialOperationReference,
          destinationRegion,
          effectiveAt,
          issuerRegistration,
          kind: "tax_determination",
          operationCode,
          productClassificationCode,
          productReference,
          quantity,
          recipientRegistration,
          requestReference,
          unitPrice,
        };
      }
      case "fiscal.submitDocument": {
        const [
          accountingClaimReference,
          authorityEnvironment,
          commercialOperationReference,
          contentText,
          documentModel,
          issuerRegistration,
          recipientRegistration,
          taxDeterminationReference,
          totalAmount,
        ] = await Promise.all([
          query.text("fiscal.accountingClaimReference"),
          query.text("fiscal.authorityEnvironment"),
          query.text("fiscal.intentCommercialOperationReference"),
          query.text("fiscal.documentContent"),
          query.text("fiscal.documentModel"),
          query.text("fiscal.intentIssuerRegistration"),
          query.text("fiscal.intentRecipientRegistration"),
          query.text("fiscal.taxDeterminationReference"),
          query.decimal("fiscal.documentTotalAmount"),
        ]);
        const contentJson: unknown = JSON.parse(contentText);
        const content = fiscalDocumentContentSchema.parse(contentJson);
        return {
          accountingClaimReference,
          authorityEnvironment,
          commercialOperationReference,
          content,
          documentModel,
          issuerRegistration,
          kind: "submit_document",
          recipientRegistration,
          requestReference,
          taxDeterminationReference,
          totalAmount,
        };
      }
      case "fiscal.cancelDocument": {
        const [
          authorityProtocol,
          providerOperationReference,
          reason,
          remoteRevision,
        ] = await Promise.all([
          query.text("fiscal.authorityProtocol"),
          query.text("fiscal.documentProviderOperationReference"),
          query.text("fiscal.cancellationReason"),
          query.integer("fiscal.remoteDocumentRevision"),
        ]);
        return {
          authorityProtocol,
          kind: "cancel_document",
          providerOperationReference,
          reason,
          remoteRevision,
          requestReference,
        };
      }
      case "fiscal.correctDocument": {
        const [
          authorityProtocol,
          correction,
          providerOperationReference,
          remoteRevision,
        ] = await Promise.all([
          query.text("fiscal.authorityProtocol"),
          query.text("fiscal.correctionText"),
          query.text("fiscal.documentProviderOperationReference"),
          query.integer("fiscal.remoteDocumentRevision"),
        ]);
        return {
          authorityProtocol,
          correction,
          kind: "correct_document",
          providerOperationReference,
          remoteRevision,
          requestReference,
        };
      }
      default: {
        const exhaustive: never = actionId;
        throw new Error(`unsupported fiscal action: ${String(exhaustive)}`);
      }
    }
  }

  async #token(tenantId: string): Promise<string> {
    const cached = this.#tokenCache.get(tenantId);
    if (cached !== undefined && cached.expiresAt > Date.now() + 5_000) {
      return cached.value;
    }
    const credentials = this.#clients[tenantId];
    if (credentials === undefined) {
      throw new Error("tenant has no fiscal adapter identity");
    }
    const form = new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      grant_type: "client_credentials",
    });
    const response = await fetch(this.#tokenUrl, {
      body: form,
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(`fiscal adapter identity failed with HTTP ${response.status}`);
    }
    const payload: unknown = await response.json();
    const token = tokenResponseSchema.parse(payload);
    this.#tokenCache.set(tenantId, {
      expiresAt: Date.now() + token.expires_in * 1_000,
      value: token.access_token,
    });
    return token.access_token;
  }
}

class SemanticReader {
  readonly #client: ReturnType<typeof serviceClients>["world"];
  readonly #definition: DefinitionReference;
  readonly #entityId: string;
  readonly #tenantId: string;
  readonly #validAt: Date;

  constructor(input: {
    readonly client: ReturnType<typeof serviceClients>["world"];
    readonly definition: DefinitionReference;
    readonly entityId: string;
    readonly tenantId: string;
    readonly validAt: Date;
  }) {
    this.#client = input.client;
    this.#definition = input.definition;
    this.#entityId = input.entityId;
    this.#tenantId = input.tenantId;
    this.#validAt = input.validAt;
  }

  async decimal(relationId: string): Promise<string> {
    return exactString(await this.#one(relationId), "decimalValue");
  }

  async integer(relationId: string): Promise<string> {
    return exactString(await this.#one(relationId), "integerValue");
  }

  async quantity(
    relationId: string,
  ): Promise<{ readonly amount: string; readonly unit: string }> {
    const result = await this.#one(relationId);
    const value = result.value?.value;
    if (value?.case !== "quantityValue") {
      throw new Error("semantic value is not quantityValue");
    }
    return { amount: value.amount, unit: value.unit };
  }

  async text(relationId: string): Promise<string> {
    return exactString(await this.#one(relationId), "textValue");
  }

  async textFromClaim(relationId: string, claimId: string): Promise<string> {
    const values = await this.#values(relationId);
    const result = values.find((value) =>
      value.dependencies.some((dependency) => dependency.claimId === claimId),
    );
    if (result === undefined) {
      throw new Error(`${relationId} has no value supported by ${claimId}`);
    }
    return exactString(result, "textValue");
  }

  async #one(relationId: string): Promise<SemanticValueResult> {
    const values = await this.#values(relationId);
    const result = values.at(-1);
    if (result === undefined) {
      throw new Error(`${relationId} has no committed value`);
    }
    return result;
  }

  async #values(relationId: string): Promise<SemanticValueResult[]> {
    const response = await this.#client.semanticQuery({
      consistency: create(QueryConsistencySchema, {
        value: {
          case: "strong",
          value: create(StrongConsistencySchema),
        },
      }),
      definition: this.#definition,
      entityId: this.#entityId,
      selection: create(QuerySelectionSchema, {
        value: {
          case: "relationId",
          value: relationId,
        },
      }),
      tenantId: this.#tenantId,
      validAt: this.#validAt,
    });
    return response.values;
  }
}

function serviceClients(baseUrl: URL, token: string) {
  const authorization: Interceptor = (next) => async (request) => {
    request.header.set("authorization", `Bearer ${token}`);
    return next(request);
  };
  const transport = createConnectTransport({
    baseUrl: baseUrl.toString().replace(/\/$/u, ""),
    httpVersion: "1.1",
    interceptors: [authorization],
  });
  return {
    effect: createClient(EffectService, transport),
    history: createClient(HistoryService, transport),
    world: createClient(WorldService, transport),
  };
}

function verifyEffectPointer(
  request: ConnectorDispatch,
  effect: {
    readonly effectRequestId: string;
    readonly idempotencyKey: string;
    readonly payload: Uint8Array;
    readonly requestDigest: string;
  },
): void {
  const dispatchedPayload = Buffer.from(request.payloadBase64, "base64");
  if (
    effect.effectRequestId !== request.effectRequestId ||
    effect.idempotencyKey !== request.idempotencyKey ||
    effect.requestDigest !== request.requestDigest ||
    sha256(effect.payload) !== request.requestDigest ||
    dispatchedPayload.length !== effect.payload.length ||
    !timingSafeEqual(dispatchedPayload, effect.payload)
  ) {
    throw new Error("connector dispatch does not match the committed effect");
  }
}

function effectRelation(
  actionId: z.infer<typeof fiscalActionSchema>,
): string {
  switch (actionId) {
    case "fiscal.cancelDocument":
      return "fiscal.cancellationRequestReference";
    case "fiscal.correctDocument":
      return "fiscal.correctionRequestReference";
    case "fiscal.requestTaxDetermination":
      return "fiscal.taxDeterminationRequestReference";
    case "fiscal.submitDocument":
      return "fiscal.documentSubmissionRequestReference";
    default: {
      const exhaustive: never = actionId;
      throw new Error(`unsupported fiscal action: ${String(exhaustive)}`);
    }
  }
}

function exactString(
  result: SemanticValueResult,
  expected: "decimalValue" | "integerValue" | "textValue",
): string {
  const value = result.value?.value;
  if (value?.case !== expected) {
    throw new Error(`semantic value is not ${expected}`);
  }
  return value.value;
}
