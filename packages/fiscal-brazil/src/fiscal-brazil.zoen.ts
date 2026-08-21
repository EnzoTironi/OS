import {
  defineAction,
  defineBundle,
  defineComputation,
  defineRelation,
  defineType,
} from "@zoen/ontology";

const TaxDetermination = defineType({
  attributes: [{ id: "determinationId", valueType: { kind: "text" } }],
  id: "fiscal.TaxDetermination",
});

const FiscalIntent = defineType({
  attributes: [{ id: "intentId", valueType: { kind: "text" } }],
  id: "fiscal.FiscalIntent",
});

const FiscalDocument = defineType({
  attributes: [{ id: "documentId", valueType: { kind: "text" } }],
  id: "fiscal.FiscalDocument",
});

const FiscalEvent = defineType({
  attributes: [{ id: "eventId", valueType: { kind: "text" } }],
  id: "fiscal.FiscalEvent",
});

const FiscalArtifact = defineType({
  attributes: [{ id: "artifactId", valueType: { kind: "text" } }],
  id: "fiscal.FiscalArtifact",
});

function textRelation(
  id: string,
  sourceType: string,
  cardinality: "many" | "one" = "one",
) {
  return defineRelation({
    cardinality,
    id,
    sourceType,
    target: { kind: "value", valueType: { kind: "text" } },
  });
}

function decimalRelation(id: string, sourceType: string) {
  return defineRelation({
    cardinality: "one",
    id,
    sourceType,
    target: { kind: "value", valueType: { kind: "decimal" } },
  });
}

const originatingCommercialOperationReference = textRelation(
  "fiscal.originatingCommercialOperationReference",
  "fiscal.TaxDetermination",
);
const taxIssuerRegistration = textRelation(
  "fiscal.taxIssuerRegistration",
  "fiscal.TaxDetermination",
);
const taxRecipientRegistration = textRelation(
  "fiscal.taxRecipientRegistration",
  "fiscal.TaxDetermination",
);
const taxProductReference = textRelation(
  "fiscal.taxProductReference",
  "fiscal.TaxDetermination",
);
const operationCode = textRelation(
  "fiscal.operationCode",
  "fiscal.TaxDetermination",
);
const productClassificationCode = textRelation(
  "fiscal.productClassificationCode",
  "fiscal.TaxDetermination",
);
const destinationRegion = textRelation(
  "fiscal.destinationRegion",
  "fiscal.TaxDetermination",
);
const taxEffectiveAt = textRelation(
  "fiscal.taxEffectiveAt",
  "fiscal.TaxDetermination",
);
const taxQuantity = defineRelation({
  cardinality: "one",
  id: "fiscal.taxQuantity",
  sourceType: "fiscal.TaxDetermination",
  target: {
    kind: "value",
    valueType: { kind: "quantity", unit: "each" },
  },
});
const taxUnitPrice = decimalRelation(
  "fiscal.taxUnitPrice",
  "fiscal.TaxDetermination",
);
const taxDeterminationRequestReference = textRelation(
  "fiscal.taxDeterminationRequestReference",
  "fiscal.TaxDetermination",
  "many",
);
const determinationProviderReference = textRelation(
  "fiscal.determinationProviderReference",
  "fiscal.TaxDetermination",
  "many",
);
const determinationProviderOperationReference = textRelation(
  "fiscal.determinationProviderOperationReference",
  "fiscal.TaxDetermination",
  "many",
);
const determinationRuleVersion = textRelation(
  "fiscal.determinationRuleVersion",
  "fiscal.TaxDetermination",
  "many",
);
const determinationResponseDigest = textRelation(
  "fiscal.determinationResponseDigest",
  "fiscal.TaxDetermination",
  "many",
);
const federalTaxAmount = decimalRelation(
  "fiscal.federalTaxAmount",
  "fiscal.TaxDetermination",
);
const stateTaxAmount = decimalRelation(
  "fiscal.stateTaxAmount",
  "fiscal.TaxDetermination",
);
const municipalTaxAmount = decimalRelation(
  "fiscal.municipalTaxAmount",
  "fiscal.TaxDetermination",
);

const intentCommercialOperationReference = textRelation(
  "fiscal.intentCommercialOperationReference",
  "fiscal.FiscalIntent",
);
const accountingClaimReference = textRelation(
  "fiscal.accountingClaimReference",
  "fiscal.FiscalIntent",
);
const taxDeterminationReference = textRelation(
  "fiscal.taxDeterminationReference",
  "fiscal.FiscalIntent",
);
const documentModel = textRelation(
  "fiscal.documentModel",
  "fiscal.FiscalIntent",
);
const authorityEnvironment = textRelation(
  "fiscal.authorityEnvironment",
  "fiscal.FiscalIntent",
);
const documentContent = textRelation(
  "fiscal.documentContent",
  "fiscal.FiscalIntent",
);
const intentIssuerRegistration = textRelation(
  "fiscal.intentIssuerRegistration",
  "fiscal.FiscalIntent",
);
const intentRecipientRegistration = textRelation(
  "fiscal.intentRecipientRegistration",
  "fiscal.FiscalIntent",
);
const documentTotalAmount = decimalRelation(
  "fiscal.documentTotalAmount",
  "fiscal.FiscalIntent",
);
const documentSubmissionRequestReference = textRelation(
  "fiscal.documentSubmissionRequestReference",
  "fiscal.FiscalIntent",
  "many",
);

const fiscalIntentReference = textRelation(
  "fiscal.fiscalIntentReference",
  "fiscal.FiscalDocument",
);
const documentProviderReference = textRelation(
  "fiscal.documentProviderReference",
  "fiscal.FiscalDocument",
  "many",
);
const documentProviderOperationReference = textRelation(
  "fiscal.documentProviderOperationReference",
  "fiscal.FiscalDocument",
  "many",
);
const remoteSubmissionStatus = textRelation(
  "fiscal.remoteSubmissionStatus",
  "fiscal.FiscalDocument",
  "many",
);
const authorityStatus = textRelation(
  "fiscal.authorityStatus",
  "fiscal.FiscalDocument",
  "many",
);
const authorityProtocol = textRelation(
  "fiscal.authorityProtocol",
  "fiscal.FiscalDocument",
  "many",
);
const authorityAccessKey = textRelation(
  "fiscal.authorityAccessKey",
  "fiscal.FiscalDocument",
  "many",
);
const authorizationEvidenceDigest = textRelation(
  "fiscal.authorizationEvidenceDigest",
  "fiscal.FiscalDocument",
  "many",
);
const authorizedArtifactReference = textRelation(
  "fiscal.authorizedArtifactReference",
  "fiscal.FiscalDocument",
  "many",
);
const remoteDocumentRevision = defineRelation({
  cardinality: "one",
  id: "fiscal.remoteDocumentRevision",
  sourceType: "fiscal.FiscalDocument",
  target: { kind: "value", valueType: { kind: "integer" } },
});
const cancellationReason = textRelation(
  "fiscal.cancellationReason",
  "fiscal.FiscalDocument",
  "many",
);
const correctionText = textRelation(
  "fiscal.correctionText",
  "fiscal.FiscalDocument",
  "many",
);
const cancellationRequestReference = textRelation(
  "fiscal.cancellationRequestReference",
  "fiscal.FiscalDocument",
  "many",
);
const correctionRequestReference = textRelation(
  "fiscal.correctionRequestReference",
  "fiscal.FiscalDocument",
  "many",
);

const eventDocumentReference = textRelation(
  "fiscal.eventDocumentReference",
  "fiscal.FiscalEvent",
);
const eventKind = textRelation(
  "fiscal.eventKind",
  "fiscal.FiscalEvent",
);
const eventProviderOperationReference = textRelation(
  "fiscal.eventProviderOperationReference",
  "fiscal.FiscalEvent",
);
const eventAuthorityStatus = textRelation(
  "fiscal.eventAuthorityStatus",
  "fiscal.FiscalEvent",
);
const eventAuthorityProtocol = textRelation(
  "fiscal.eventAuthorityProtocol",
  "fiscal.FiscalEvent",
);
const eventEvidenceDigest = textRelation(
  "fiscal.eventEvidenceDigest",
  "fiscal.FiscalEvent",
);

const artifactDocumentReference = textRelation(
  "fiscal.artifactDocumentReference",
  "fiscal.FiscalArtifact",
);
const artifactDigest = textRelation(
  "fiscal.artifactDigest",
  "fiscal.FiscalArtifact",
);
const artifactMediaType = textRelation(
  "fiscal.artifactMediaType",
  "fiscal.FiscalArtifact",
);
const artifactSourceReference = textRelation(
  "fiscal.artifactSourceReference",
  "fiscal.FiscalArtifact",
);

const determinedTotalTaxAmount = defineComputation({
  expression: {
    kind: "binary",
    left: {
      kind: "binary",
      left: {
        kind: "relation",
        relationId: "fiscal.federalTaxAmount",
      },
      operator: "add",
      right: {
        kind: "relation",
        relationId: "fiscal.stateTaxAmount",
      },
    },
    operator: "add",
    right: {
      kind: "relation",
      relationId: "fiscal.municipalTaxAmount",
    },
  },
  id: "fiscal.determinedTotalTaxAmount",
  inputs: [],
  returns: { kind: "decimal" },
});

const requestTaxDetermination = defineAction({
  effects: [
    {
      relationId: "fiscal.taxDeterminationRequestReference",
      value: { inputId: "requestReference", kind: "input" },
    },
  ],
  id: "fiscal.requestTaxDetermination",
  inputs: [{ id: "requestReference", valueType: { kind: "text" } }],
  precondition: {
    kind: "binary",
    left: {
      kind: "relation",
      relationId: "fiscal.taxQuantity",
    },
    operator: "greater_than",
    right: {
      kind: "literal",
      value: { amount: "0", kind: "quantity", unit: "each" },
    },
  },
});

const submitDocument = defineAction({
  effects: [
    {
      relationId: "fiscal.documentSubmissionRequestReference",
      value: { inputId: "requestReference", kind: "input" },
    },
  ],
  id: "fiscal.submitDocument",
  inputs: [{ id: "requestReference", valueType: { kind: "text" } }],
  precondition: {
    kind: "binary",
    left: {
      kind: "relation",
      relationId: "fiscal.documentTotalAmount",
    },
    operator: "greater_than",
    right: {
      kind: "literal",
      value: { kind: "decimal", value: "0" },
    },
  },
});

const cancelDocument = defineAction({
  effects: [
    {
      relationId: "fiscal.cancellationRequestReference",
      value: { inputId: "requestReference", kind: "input" },
    },
  ],
  id: "fiscal.cancelDocument",
  inputs: [
    { id: "requestReference", valueType: { kind: "text" } },
    { id: "revision", valueType: { kind: "integer" } },
  ],
  precondition: {
    kind: "binary",
    left: { inputId: "revision", kind: "input" },
    operator: "greater_than",
    right: {
      kind: "literal",
      value: { kind: "integer", value: "0" },
    },
  },
});

const correctDocument = defineAction({
  effects: [
    {
      relationId: "fiscal.correctionRequestReference",
      value: { inputId: "requestReference", kind: "input" },
    },
  ],
  id: "fiscal.correctDocument",
  inputs: [
    { id: "requestReference", valueType: { kind: "text" } },
    { id: "revision", valueType: { kind: "integer" } },
  ],
  precondition: {
    kind: "binary",
    left: { inputId: "revision", kind: "input" },
    operator: "greater_than",
    right: {
      kind: "literal",
      value: { kind: "integer", value: "0" },
    },
  },
});

export default defineBundle({
  actions: [
    cancelDocument,
    correctDocument,
    requestTaxDetermination,
    submitDocument,
  ],
  computations: [determinedTotalTaxAmount],
  id: "fiscal.brazil",
  relations: [
    accountingClaimReference,
    artifactDigest,
    artifactDocumentReference,
    artifactMediaType,
    artifactSourceReference,
    authorityAccessKey,
    authorityEnvironment,
    authorityProtocol,
    authorityStatus,
    authorizationEvidenceDigest,
    authorizedArtifactReference,
    cancellationReason,
    cancellationRequestReference,
    correctionRequestReference,
    correctionText,
    destinationRegion,
    determinationProviderOperationReference,
    determinationProviderReference,
    determinationResponseDigest,
    determinationRuleVersion,
    documentContent,
    documentModel,
    documentProviderOperationReference,
    documentProviderReference,
    documentSubmissionRequestReference,
    documentTotalAmount,
    eventAuthorityProtocol,
    eventAuthorityStatus,
    eventDocumentReference,
    eventEvidenceDigest,
    eventKind,
    eventProviderOperationReference,
    federalTaxAmount,
    fiscalIntentReference,
    intentCommercialOperationReference,
    intentIssuerRegistration,
    intentRecipientRegistration,
    municipalTaxAmount,
    operationCode,
    originatingCommercialOperationReference,
    productClassificationCode,
    remoteDocumentRevision,
    remoteSubmissionStatus,
    stateTaxAmount,
    taxDeterminationReference,
    taxDeterminationRequestReference,
    taxEffectiveAt,
    taxIssuerRegistration,
    taxProductReference,
    taxQuantity,
    taxRecipientRegistration,
    taxUnitPrice,
  ],
  revision: 1,
  types: [
    FiscalArtifact,
    FiscalDocument,
    FiscalEvent,
    FiscalIntent,
    TaxDetermination,
  ],
});
