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

const originatingCommercialOperationReference = defineRelation({
  cardinality: "one",
  id: "fiscal.originatingCommercialOperationReference",
  sourceType: "fiscal.TaxDetermination",
  target: { kind: "value", valueType: { kind: "text" } },
});

const taxIntentReference = defineRelation({
  cardinality: "one",
  id: "fiscal.taxIntentReference",
  sourceType: "fiscal.TaxDetermination",
  target: { kind: "value", valueType: { kind: "text" } },
});

const taxIssuerRegistration = defineRelation({
  cardinality: "one",
  id: "fiscal.taxIssuerRegistration",
  sourceType: "fiscal.TaxDetermination",
  target: { kind: "value", valueType: { kind: "text" } },
});

const taxRecipientRegistration = defineRelation({
  cardinality: "one",
  id: "fiscal.taxRecipientRegistration",
  sourceType: "fiscal.TaxDetermination",
  target: { kind: "value", valueType: { kind: "text" } },
});

const taxProductReference = defineRelation({
  cardinality: "one",
  id: "fiscal.taxProductReference",
  sourceType: "fiscal.TaxDetermination",
  target: { kind: "value", valueType: { kind: "text" } },
});

const operationCode = defineRelation({
  cardinality: "one",
  id: "fiscal.operationCode",
  sourceType: "fiscal.TaxDetermination",
  target: { kind: "value", valueType: { kind: "text" } },
});

const productClassificationCode = defineRelation({
  cardinality: "one",
  id: "fiscal.productClassificationCode",
  sourceType: "fiscal.TaxDetermination",
  target: { kind: "value", valueType: { kind: "text" } },
});

const destinationRegion = defineRelation({
  cardinality: "one",
  id: "fiscal.destinationRegion",
  sourceType: "fiscal.TaxDetermination",
  target: { kind: "value", valueType: { kind: "text" } },
});

const taxEffectiveAt = defineRelation({
  cardinality: "one",
  id: "fiscal.taxEffectiveAt",
  sourceType: "fiscal.TaxDetermination",
  target: { kind: "value", valueType: { kind: "text" } },
});

const taxQuantity = defineRelation({
  cardinality: "one",
  id: "fiscal.taxQuantity",
  sourceType: "fiscal.TaxDetermination",
  target: {
    kind: "value",
    valueType: { kind: "quantity", unit: "each" },
  },
});

const taxUnitPrice = defineRelation({
  cardinality: "one",
  id: "fiscal.taxUnitPrice",
  sourceType: "fiscal.TaxDetermination",
  target: { kind: "value", valueType: { kind: "decimal" } },
});

const taxDeterminationRequestReference = defineRelation({
  cardinality: "many",
  id: "fiscal.taxDeterminationRequestReference",
  sourceType: "fiscal.TaxDetermination",
  target: { kind: "value", valueType: { kind: "text" } },
});

const determinationProviderReference = defineRelation({
  cardinality: "many",
  id: "fiscal.determinationProviderReference",
  sourceType: "fiscal.TaxDetermination",
  target: { kind: "value", valueType: { kind: "text" } },
});

const determinationProviderOperationReference = defineRelation({
  cardinality: "many",
  id: "fiscal.determinationProviderOperationReference",
  sourceType: "fiscal.TaxDetermination",
  target: { kind: "value", valueType: { kind: "text" } },
});

const determinationRuleVersion = defineRelation({
  cardinality: "many",
  id: "fiscal.determinationRuleVersion",
  sourceType: "fiscal.TaxDetermination",
  target: { kind: "value", valueType: { kind: "text" } },
});

const determinationResponseDigest = defineRelation({
  cardinality: "many",
  id: "fiscal.determinationResponseDigest",
  sourceType: "fiscal.TaxDetermination",
  target: { kind: "value", valueType: { kind: "text" } },
});

const federalTaxAmount = defineRelation({
  cardinality: "one",
  id: "fiscal.federalTaxAmount",
  sourceType: "fiscal.TaxDetermination",
  target: { kind: "value", valueType: { kind: "decimal" } },
});

const stateTaxAmount = defineRelation({
  cardinality: "one",
  id: "fiscal.stateTaxAmount",
  sourceType: "fiscal.TaxDetermination",
  target: { kind: "value", valueType: { kind: "decimal" } },
});

const municipalTaxAmount = defineRelation({
  cardinality: "one",
  id: "fiscal.municipalTaxAmount",
  sourceType: "fiscal.TaxDetermination",
  target: { kind: "value", valueType: { kind: "decimal" } },
});

const intentCommercialOperationReference = defineRelation({
  cardinality: "one",
  id: "fiscal.intentCommercialOperationReference",
  sourceType: "fiscal.FiscalIntent",
  target: { kind: "value", valueType: { kind: "text" } },
});

const accountingClaimReference = defineRelation({
  cardinality: "one",
  id: "fiscal.accountingClaimReference",
  sourceType: "fiscal.FiscalIntent",
  target: { kind: "value", valueType: { kind: "text" } },
});

const taxDeterminationReference = defineRelation({
  cardinality: "one",
  id: "fiscal.taxDeterminationReference",
  sourceType: "fiscal.FiscalIntent",
  target: { kind: "value", valueType: { kind: "text" } },
});

const intentDocumentReference = defineRelation({
  cardinality: "one",
  id: "fiscal.intentDocumentReference",
  sourceType: "fiscal.FiscalIntent",
  target: { kind: "value", valueType: { kind: "text" } },
});

const intentDeterminedTaxTotal = defineRelation({
  cardinality: "one",
  id: "fiscal.intentDeterminedTaxTotal",
  sourceType: "fiscal.FiscalIntent",
  target: { kind: "value", valueType: { kind: "decimal" } },
});

const documentModel = defineRelation({
  cardinality: "one",
  id: "fiscal.documentModel",
  sourceType: "fiscal.FiscalIntent",
  target: { kind: "value", valueType: { kind: "text" } },
});

const authorityEnvironment = defineRelation({
  cardinality: "one",
  id: "fiscal.authorityEnvironment",
  sourceType: "fiscal.FiscalIntent",
  target: { kind: "value", valueType: { kind: "text" } },
});

const documentContent = defineRelation({
  cardinality: "one",
  id: "fiscal.documentContent",
  sourceType: "fiscal.FiscalIntent",
  target: { kind: "value", valueType: { kind: "text" } },
});

const intentIssuerRegistration = defineRelation({
  cardinality: "one",
  id: "fiscal.intentIssuerRegistration",
  sourceType: "fiscal.FiscalIntent",
  target: { kind: "value", valueType: { kind: "text" } },
});

const intentRecipientRegistration = defineRelation({
  cardinality: "one",
  id: "fiscal.intentRecipientRegistration",
  sourceType: "fiscal.FiscalIntent",
  target: { kind: "value", valueType: { kind: "text" } },
});

const documentTotalAmount = defineRelation({
  cardinality: "one",
  id: "fiscal.documentTotalAmount",
  sourceType: "fiscal.FiscalIntent",
  target: { kind: "value", valueType: { kind: "decimal" } },
});

const documentSubmissionRequestReference = defineRelation({
  cardinality: "many",
  id: "fiscal.documentSubmissionRequestReference",
  sourceType: "fiscal.FiscalIntent",
  target: { kind: "value", valueType: { kind: "text" } },
});

const fiscalIntentReference = defineRelation({
  cardinality: "one",
  id: "fiscal.fiscalIntentReference",
  sourceType: "fiscal.FiscalDocument",
  target: { kind: "value", valueType: { kind: "text" } },
});

const documentIssuerRegistration = defineRelation({
  cardinality: "one",
  id: "fiscal.documentIssuerRegistration",
  sourceType: "fiscal.FiscalDocument",
  target: { kind: "value", valueType: { kind: "text" } },
});

const documentProviderReference = defineRelation({
  cardinality: "many",
  id: "fiscal.documentProviderReference",
  sourceType: "fiscal.FiscalDocument",
  target: { kind: "value", valueType: { kind: "text" } },
});

const documentProviderOperationReference = defineRelation({
  cardinality: "many",
  id: "fiscal.documentProviderOperationReference",
  sourceType: "fiscal.FiscalDocument",
  target: { kind: "value", valueType: { kind: "text" } },
});

const remoteSubmissionStatus = defineRelation({
  cardinality: "many",
  id: "fiscal.remoteSubmissionStatus",
  sourceType: "fiscal.FiscalDocument",
  target: { kind: "value", valueType: { kind: "text" } },
});

const authorityStatus = defineRelation({
  cardinality: "many",
  id: "fiscal.authorityStatus",
  sourceType: "fiscal.FiscalDocument",
  target: { kind: "value", valueType: { kind: "text" } },
});

const authorityProtocol = defineRelation({
  cardinality: "many",
  id: "fiscal.authorityProtocol",
  sourceType: "fiscal.FiscalDocument",
  target: { kind: "value", valueType: { kind: "text" } },
});

const authorityAccessKey = defineRelation({
  cardinality: "many",
  id: "fiscal.authorityAccessKey",
  sourceType: "fiscal.FiscalDocument",
  target: { kind: "value", valueType: { kind: "text" } },
});

const authorizationEvidenceDigest = defineRelation({
  cardinality: "many",
  id: "fiscal.authorizationEvidenceDigest",
  sourceType: "fiscal.FiscalDocument",
  target: { kind: "value", valueType: { kind: "text" } },
});

const authorizedArtifactReference = defineRelation({
  cardinality: "many",
  id: "fiscal.authorizedArtifactReference",
  sourceType: "fiscal.FiscalDocument",
  target: { kind: "value", valueType: { kind: "text" } },
});

const remoteDocumentRevision = defineRelation({
  cardinality: "one",
  id: "fiscal.remoteDocumentRevision",
  sourceType: "fiscal.FiscalDocument",
  target: { kind: "value", valueType: { kind: "integer" } },
});

const cancellationReason = defineRelation({
  cardinality: "many",
  id: "fiscal.cancellationReason",
  sourceType: "fiscal.FiscalDocument",
  target: { kind: "value", valueType: { kind: "text" } },
});

const correctionText = defineRelation({
  cardinality: "many",
  id: "fiscal.correctionText",
  sourceType: "fiscal.FiscalDocument",
  target: { kind: "value", valueType: { kind: "text" } },
});

const cancellationRequestReference = defineRelation({
  cardinality: "many",
  id: "fiscal.cancellationRequestReference",
  sourceType: "fiscal.FiscalDocument",
  target: { kind: "value", valueType: { kind: "text" } },
});

const correctionRequestReference = defineRelation({
  cardinality: "many",
  id: "fiscal.correctionRequestReference",
  sourceType: "fiscal.FiscalDocument",
  target: { kind: "value", valueType: { kind: "text" } },
});

const eventDocumentReference = defineRelation({
  cardinality: "one",
  id: "fiscal.eventDocumentReference",
  sourceType: "fiscal.FiscalEvent",
  target: { kind: "value", valueType: { kind: "text" } },
});

const eventKind = defineRelation({
  cardinality: "one",
  id: "fiscal.eventKind",
  sourceType: "fiscal.FiscalEvent",
  target: { kind: "value", valueType: { kind: "text" } },
});

const eventProviderOperationReference = defineRelation({
  cardinality: "one",
  id: "fiscal.eventProviderOperationReference",
  sourceType: "fiscal.FiscalEvent",
  target: { kind: "value", valueType: { kind: "text" } },
});

const eventAuthorityStatus = defineRelation({
  cardinality: "one",
  id: "fiscal.eventAuthorityStatus",
  sourceType: "fiscal.FiscalEvent",
  target: { kind: "value", valueType: { kind: "text" } },
});

const eventAuthorityProtocol = defineRelation({
  cardinality: "one",
  id: "fiscal.eventAuthorityProtocol",
  sourceType: "fiscal.FiscalEvent",
  target: { kind: "value", valueType: { kind: "text" } },
});

const eventEvidenceDigest = defineRelation({
  cardinality: "one",
  id: "fiscal.eventEvidenceDigest",
  sourceType: "fiscal.FiscalEvent",
  target: { kind: "value", valueType: { kind: "text" } },
});

const artifactDocumentReference = defineRelation({
  cardinality: "one",
  id: "fiscal.artifactDocumentReference",
  sourceType: "fiscal.FiscalArtifact",
  target: { kind: "value", valueType: { kind: "text" } },
});

const artifactDigest = defineRelation({
  cardinality: "one",
  id: "fiscal.artifactDigest",
  sourceType: "fiscal.FiscalArtifact",
  target: { kind: "value", valueType: { kind: "text" } },
});

const artifactMediaType = defineRelation({
  cardinality: "one",
  id: "fiscal.artifactMediaType",
  sourceType: "fiscal.FiscalArtifact",
  target: { kind: "value", valueType: { kind: "text" } },
});

const artifactSourceReference = defineRelation({
  cardinality: "one",
  id: "fiscal.artifactSourceReference",
  sourceType: "fiscal.FiscalArtifact",
  target: { kind: "value", valueType: { kind: "text" } },
});

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

const admitTaxDetermination = defineAction({
  effects: [
    {
      relationId: "fiscal.determinationProviderReference",
      value: { inputId: "providerReference", kind: "input" },
    },
    {
      relationId: "fiscal.determinationProviderOperationReference",
      value: { inputId: "providerOperationReference", kind: "input" },
    },
    {
      relationId: "fiscal.determinationRuleVersion",
      value: { inputId: "ruleVersion", kind: "input" },
    },
    {
      relationId: "fiscal.determinationResponseDigest",
      value: { inputId: "responseDigest", kind: "input" },
    },
    {
      relationId: "fiscal.federalTaxAmount",
      value: { inputId: "federalTaxAmount", kind: "input" },
    },
    {
      relationId: "fiscal.stateTaxAmount",
      value: { inputId: "stateTaxAmount", kind: "input" },
    },
    {
      relationId: "fiscal.municipalTaxAmount",
      value: { inputId: "municipalTaxAmount", kind: "input" },
    },
  ],
  id: "fiscal.admitTaxDetermination",
  inputs: [
    { id: "providerReference", valueType: { kind: "text" } },
    { id: "providerOperationReference", valueType: { kind: "text" } },
    { id: "ruleVersion", valueType: { kind: "text" } },
    { id: "responseDigest", valueType: { kind: "text" } },
    { id: "federalTaxAmount", valueType: { kind: "decimal" } },
    { id: "stateTaxAmount", valueType: { kind: "decimal" } },
    { id: "municipalTaxAmount", valueType: { kind: "decimal" } },
  ],
  precondition: {
    kind: "literal",
    value: { kind: "bool", value: true },
  },
});

const admitIntentTaxDetermination = defineAction({
  effects: [
    {
      relationId: "fiscal.taxDeterminationReference",
      value: { inputId: "taxDeterminationReference", kind: "input" },
    },
    {
      relationId: "fiscal.intentDeterminedTaxTotal",
      value: { inputId: "determinedTaxTotal", kind: "input" },
    },
  ],
  id: "fiscal.admitIntentTaxDetermination",
  inputs: [
    { id: "taxDeterminationReference", valueType: { kind: "text" } },
    { id: "determinedTaxTotal", valueType: { kind: "decimal" } },
  ],
  precondition: {
    kind: "binary",
    left: { inputId: "determinedTaxTotal", kind: "input" },
    operator: "greater_than",
    right: {
      kind: "literal",
      value: { kind: "decimal", value: "0" },
    },
  },
});

const admitDocumentAuthorization = defineAction({
  effects: [
    {
      relationId: "fiscal.fiscalIntentReference",
      value: { inputId: "fiscalIntentReference", kind: "input" },
    },
    {
      relationId: "fiscal.documentIssuerRegistration",
      value: { inputId: "issuerRegistration", kind: "input" },
    },
    {
      relationId: "fiscal.documentProviderReference",
      value: { inputId: "providerReference", kind: "input" },
    },
    {
      relationId: "fiscal.documentProviderOperationReference",
      value: { inputId: "providerOperationReference", kind: "input" },
    },
    {
      relationId: "fiscal.remoteSubmissionStatus",
      value: {
        kind: "literal",
        value: { kind: "text", value: "submitted" },
      },
    },
    {
      relationId: "fiscal.authorityStatus",
      value: { inputId: "authorityStatus", kind: "input" },
    },
    {
      relationId: "fiscal.authorityProtocol",
      value: { inputId: "authorityProtocol", kind: "input" },
    },
    {
      relationId: "fiscal.authorityAccessKey",
      value: { inputId: "authorityAccessKey", kind: "input" },
    },
    {
      relationId: "fiscal.authorizationEvidenceDigest",
      value: { inputId: "artifactDigest", kind: "input" },
    },
    {
      relationId: "fiscal.authorizedArtifactReference",
      value: { inputId: "artifactReference", kind: "input" },
    },
    {
      relationId: "fiscal.remoteDocumentRevision",
      value: { inputId: "remoteDocumentRevision", kind: "input" },
    },
  ],
  id: "fiscal.admitDocumentAuthorization",
  inputs: [
    { id: "fiscalIntentReference", valueType: { kind: "text" } },
    { id: "issuerRegistration", valueType: { kind: "text" } },
    { id: "providerReference", valueType: { kind: "text" } },
    { id: "providerOperationReference", valueType: { kind: "text" } },
    { id: "authorityStatus", valueType: { kind: "text" } },
    { id: "authorityProtocol", valueType: { kind: "text" } },
    { id: "authorityAccessKey", valueType: { kind: "text" } },
    { id: "artifactDigest", valueType: { kind: "text" } },
    { id: "artifactReference", valueType: { kind: "text" } },
    { id: "remoteDocumentRevision", valueType: { kind: "integer" } },
  ],
  precondition: {
    kind: "binary",
    left: { inputId: "remoteDocumentRevision", kind: "input" },
    operator: "greater_than",
    right: {
      kind: "literal",
      value: { kind: "integer", value: "0" },
    },
  },
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
      relationId: "fiscal.intentDeterminedTaxTotal",
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
  inputs: [{ id: "requestReference", valueType: { kind: "text" } }],
  precondition: {
    kind: "binary",
    left: {
      kind: "relation",
      relationId: "fiscal.remoteDocumentRevision",
    },
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
  inputs: [{ id: "requestReference", valueType: { kind: "text" } }],
  precondition: {
    kind: "binary",
    left: {
      kind: "relation",
      relationId: "fiscal.remoteDocumentRevision",
    },
    operator: "greater_than",
    right: {
      kind: "literal",
      value: { kind: "integer", value: "0" },
    },
  },
});

export default defineBundle({
  actions: [
    admitDocumentAuthorization,
    admitIntentTaxDetermination,
    admitTaxDetermination,
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
    documentIssuerRegistration,
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
    intentDeterminedTaxTotal,
    intentDocumentReference,
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
    taxIntentReference,
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
