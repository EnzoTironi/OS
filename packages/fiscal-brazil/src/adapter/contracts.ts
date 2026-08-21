import { z } from "zod";

export const fiscalProviderSchema = z.enum([
  "plugnotas",
  "protheus",
  "systax",
]);
export type FiscalProvider = z.infer<typeof fiscalProviderSchema>;

export const fiscalActionSchema = z.enum([
  "fiscal.cancelDocument",
  "fiscal.correctDocument",
  "fiscal.requestTaxDetermination",
  "fiscal.submitDocument",
]);
export type FiscalAction = z.infer<typeof fiscalActionSchema>;

const identifierSchema = z.string().min(1).max(256);
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const decimalSchema = z.string().regex(/^-?[0-9]+(?:\.[0-9]+)?$/u);

export const connectorDispatchSchema = z.object({
  effectRequestId: identifierSchema,
  idempotencyKey: identifierSchema,
  payloadBase64: z.string().min(1),
  requestDigest: digestSchema,
  tenantId: identifierSchema,
});
export type ConnectorDispatch = z.infer<typeof connectorDispatchSchema>;

export const claimRecordedSchema = z.object({
  claimId: identifierSchema,
  definitionId: z.literal("fiscal.brazil"),
  digest: digestSchema,
  revision: z.number().int().positive(),
});

export const fiscalDocumentContentSchema = z.object({
  issuer: z.object({
    taxRegistration: z.string().min(11).max(20),
  }),
  recipient: z.object({
    address: z.object({
      city: z.string().min(1),
      cityCode: z.string().min(1),
      countryCode: z.string().min(1),
      district: z.string().min(1),
      postalCode: z.string().min(1),
      region: z.string().min(2).max(3),
      street: z.string().min(1),
      streetNumber: z.string().min(1),
    }),
    name: z.string().min(1),
    taxRegistration: z.string().min(11).max(20),
  }),
  lines: z
    .array(
      z.object({
        classificationCode: z.string().min(1),
        description: z.string().min(1),
        operationCode: z.string().min(1),
        productReference: z.string().min(1),
        quantity: decimalSchema,
        tax: z.object({
          cofinsAmount: decimalSchema,
          cofinsRate: decimalSchema,
          icmsAmount: decimalSchema,
          icmsRate: decimalSchema,
          pisAmount: decimalSchema,
          pisRate: decimalSchema,
        }),
        unit: z.string().min(1),
        unitPrice: decimalSchema,
      }),
    )
    .min(1),
  nature: z.string().min(1),
  payment: z.object({
    methodCode: z.string().min(1),
    paidAtSight: z.boolean(),
  }),
  totals: z.object({
    amount: decimalSchema,
  }),
});
export type FiscalDocumentContent = z.infer<
  typeof fiscalDocumentContentSchema
>;

export type TaxDeterminationOperation = {
  readonly commercialOperationReference: string;
  readonly destinationRegion: string;
  readonly effectiveAt: string;
  readonly issuerRegistration: string;
  readonly kind: "tax_determination";
  readonly operationCode: string;
  readonly productClassificationCode: string;
  readonly productReference: string;
  readonly quantity: {
    readonly amount: string;
    readonly unit: string;
  };
  readonly recipientRegistration: string;
  readonly requestReference: string;
  readonly unitPrice: string;
};

export type SubmitDocumentOperation = {
  readonly accountingClaimReference: string;
  readonly authorityEnvironment: string;
  readonly commercialOperationReference: string;
  readonly content: FiscalDocumentContent;
  readonly documentModel: string;
  readonly issuerRegistration: string;
  readonly kind: "submit_document";
  readonly recipientRegistration: string;
  readonly requestReference: string;
  readonly taxDeterminationReference: string;
  readonly totalAmount: string;
};

export type CancelDocumentOperation = {
  readonly authorityProtocol: string;
  readonly kind: "cancel_document";
  readonly providerOperationReference: string;
  readonly reason: string;
  readonly remoteRevision: string;
  readonly requestReference: string;
};

export type CorrectDocumentOperation = {
  readonly authorityProtocol: string;
  readonly correction: string;
  readonly kind: "correct_document";
  readonly providerOperationReference: string;
  readonly remoteRevision: string;
  readonly requestReference: string;
};

export type NeutralFiscalOperation =
  | CancelDocumentOperation
  | CorrectDocumentOperation
  | SubmitDocumentOperation
  | TaxDeterminationOperation;

export type ProviderDispatchResult =
  | {
      readonly body: {
        readonly outcome: "accepted_pending";
        readonly providerOperationId: string;
      };
      readonly kind: "accepted_pending";
      readonly status: 202;
    }
  | {
      readonly body: {
        readonly outcome: "confirmed";
        readonly providerOperationId: string;
      };
      readonly kind: "confirmed";
      readonly status: 200;
    }
  | {
      readonly body: {
        readonly outcome: "confirmed_no_effect";
        readonly providerOperationId: string;
      };
      readonly kind: "confirmed_no_effect";
      readonly status: 200;
    }
  | {
      readonly body: unknown;
      readonly kind: "invalid_response";
      readonly status: 200;
    }
  | {
      readonly body: {
        readonly error: string;
      };
      readonly kind: "provider_error";
      readonly status: number;
    };

export type ProviderStatusResult =
  | {
      readonly kind: "found";
      readonly status: {
        readonly evidenceDigest: string;
        readonly idempotencyKey: string;
        readonly observedAtMicros: string;
        readonly outcome: "effect" | "no_effect" | "pending";
        readonly providerOperationId: string;
        readonly sourceRef: string;
      };
    }
  | { readonly kind: "not_found" }
  | {
      readonly body: {
        readonly error: string;
      };
      readonly kind: "provider_error";
      readonly status: number;
    };

export interface VendorAdapter {
  dispatch(input: {
    readonly idempotencyKey: string;
    readonly operation: NeutralFiscalOperation;
  }): Promise<ProviderDispatchResult>;

  status(input: {
    readonly idempotencyKey: string;
    readonly operation: NeutralFiscalOperation;
  }): Promise<ProviderStatusResult>;
}
