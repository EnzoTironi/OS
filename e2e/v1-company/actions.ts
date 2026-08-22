import { proposalRequest, type CompanyFixture, type SemanticValue } from "./support.js";

export const lifecycleAt = new Date("2026-08-21T12:00:00.000Z");
export const afterCorrectionAt = new Date("2026-08-21T12:00:01.000Z");
export const manufacturingAt = new Date("2026-08-21T14:00:01.000Z");
export const organizationId = "party.organization.northstar";
export const personId = "party.person.ana";
export const productId = "product.item.widget-pro";
export const componentProductId = "product.item.component";
export const finishedProductId = "product.item.finished-widget";
export const orderLineId = "commercial.order-line.1001";
export const stockPositionId = "inventory.position.widget-pro.wh-1";
export const purchaseLineId = "procurement.purchase-line.2001";
export const supplierPartyId = "party.organization.supplier";
export const bomId = "manufacturing.bom.widget";
export const workId = "manufacturing.work.3001";
export const bookId = "accounting.book.commercial";
export const ledgerId = "accounting.ledger.sales";
export const receivableAccountId = "accounting.account.receivable";
export const revenueAccountId = "accounting.account.revenue";
export const claimId = "accounting.claim.receivable.3001";
export const fiscalTaxId = "fiscal.tax.3001";
export const fiscalIntentId = "fiscal.intent.3001";
export const fiscalDocumentId = "fiscal.document.3001";

export function partyAdmit(
  fixture: CompanyFixture,
  resourceId: string,
  suffix: string,
  externalIdentifier: string,
  identityKind: string,
) {
  return proposalRequest({
    actionId: "party.admitIdentity",
    fixture,
    inputs: [
      {
        id: "externalIdentifier",
        value: { kind: "text", value: externalIdentifier },
      },
      {
        id: "identityKind",
        value: { kind: "text", value: identityKind },
      },
    ],
    resourceId,
    suffix: `admit-${suffix}`,
    validAt: lifecycleAt,
  });
}

export function productAdmit(fixture: CompanyFixture, resourceId: string) {
  return proposalRequest({
    actionId: "product.admitItem",
    fixture,
    inputs: [
      {
        id: "externalIdentifier",
        value: { kind: "text", value: `sku:${resourceId}` },
      },
      { id: "lifecycleState", value: { kind: "text", value: "active" } },
      {
        id: "packQuantity",
        value: { amount: "1", kind: "quantity", unit: "each" },
      },
    ],
    resourceId,
    suffix: `admit-${resourceId}`,
    validAt: lifecycleAt,
  });
}

export function createCommitment(
  fixture: CompanyFixture,
  suffix: string,
  quantity = "10",
) {
  return proposalRequest({
    actionId: "commercial.createCommitment",
    fixture,
    inputs: [
      {
        id: "commitmentReference",
        value: { kind: "text", value: "commitment.order-1001" },
      },
      {
        id: "quantity",
        value: { amount: quantity, kind: "quantity", unit: "each" },
      },
      { id: "revision", value: { kind: "integer", value: "1" } },
      { id: "terms", value: { kind: "text", value: "net-30" } },
      { id: "unitPrice", value: { kind: "decimal", value: "19.99" } },
    ],
    resourceId: orderLineId,
    suffix,
    validAt: lifecycleAt,
  });
}

export function recordFulfillment(fixture: CompanyFixture, suffix: string) {
  return proposalRequest({
    actionId: "commercial.recordFulfillment",
    fixture,
    inputs: [
      {
        id: "quantity",
        value: { amount: "3", kind: "quantity", unit: "each" },
      },
    ],
    resourceId: orderLineId,
    suffix,
    validAt: lifecycleAt,
  });
}

export function correctCommitment(fixture: CompanyFixture, suffix: string) {
  return proposalRequest({
    actionId: "commercial.correctCommitment",
    fixture,
    inputs: [
      {
        id: "correctionOf",
        value: { kind: "text", value: "commitment.order-1001" },
      },
      {
        id: "quantity",
        value: { amount: "5", kind: "quantity", unit: "each" },
      },
      {
        id: "reason",
        value: {
          kind: "text",
          value: "reverse remaining quantity after partial fulfillment",
        },
      },
    ],
    resourceId: orderLineId,
    suffix,
    validAt: lifecycleAt,
  });
}

export function acceptPhysical(
  fixture: CompanyFixture,
  suffix: string,
  sourceReference: string,
  quantity: string,
) {
  return proposalRequest({
    actionId: "inventory.acceptPhysicalQuantity",
    fixture,
    inputs: [
      {
        id: "quantity",
        value: { amount: quantity, kind: "quantity", unit: "each" },
      },
      {
        id: "sourceReference",
        value: { kind: "text", value: sourceReference },
      },
    ],
    resourceId: stockPositionId,
    suffix: `accept-${suffix}`,
    validAt: afterCorrectionAt,
  });
}

export function inventoryCommitment(
  fixture: CompanyFixture,
  suffix: string,
  quantity: SemanticValue,
) {
  return proposalRequest({
    actionId: "inventory.recordCommercialCommitment",
    fixture,
    inputs: [
      {
        id: "commitmentReference",
        value: { kind: "text", value: "commitment.order-1001" },
      },
      { id: "quantity", value: quantity },
    ],
    resourceId: stockPositionId,
    suffix: `commercial-feed-${suffix}`,
    validAt: afterCorrectionAt,
  });
}

export function reserveInventory(
  fixture: CompanyFixture,
  suffix: string,
  quantity: string,
) {
  return proposalRequest({
    actionId: "inventory.reserveInventory",
    fixture,
    inputs: [
      {
        id: "allocationReference",
        value: { kind: "text", value: "allocation.order-1001" },
      },
      {
        id: "commitmentReference",
        value: { kind: "text", value: "commitment.order-1001" },
      },
      {
        id: "quantity",
        value: { amount: quantity, kind: "quantity", unit: "each" },
      },
      {
        id: "reservationReference",
        value: { kind: "text", value: "reservation.order-1001" },
      },
    ],
    resourceId: stockPositionId,
    suffix,
    validAt: afterCorrectionAt,
  });
}

export function recordRequirement(
  fixture: CompanyFixture,
  suffix: string,
  quantity: SemanticValue,
) {
  return proposalRequest({
    actionId: "procurement.recordRequirement",
    fixture,
    inputs: [
      { id: "quantity", value: quantity },
      {
        id: "requirementReference",
        value: { kind: "text", value: "requirement.inventory.2001" },
      },
    ],
    resourceId: purchaseLineId,
    suffix: `requirement-${suffix}`,
    validAt: afterCorrectionAt,
  });
}

export function requestSupplier(fixture: CompanyFixture, quantity: SemanticValue) {
  return proposalRequest({
    actionId: "procurement.requestSupplier",
    fixture,
    inputs: [
      { id: "quantity", value: quantity },
      {
        id: "supplierRequestReference",
        value: { kind: "text", value: "supplier-request.2001" },
      },
    ],
    resourceId: purchaseLineId,
    suffix: "supplier-request",
    validAt: afterCorrectionAt,
  });
}

export function governPurchase(fixture: CompanyFixture, suffix: string) {
  return proposalRequest({
    actionId: "procurement.governPurchase",
    fixture,
    inputs: [
      {
        id: "expectedDate",
        value: { kind: "text", value: "2026-09-01" },
      },
      {
        id: "productReference",
        value: { kind: "text", value: productId },
      },
      {
        id: "purchaseCommitmentReference",
        value: { kind: "text", value: "purchase.2001" },
      },
      {
        id: "quantity",
        value: { amount: "1.5", kind: "quantity", unit: "each" },
      },
      {
        id: "requirementReference",
        value: { kind: "text", value: "requirement.inventory.2001" },
      },
      {
        id: "supplierPartyReference",
        value: { kind: "text", value: supplierPartyId },
      },
      {
        id: "supplierTermsReference",
        value: { kind: "text", value: "terms.net-30" },
      },
      {
        id: "unitPrice",
        value: { kind: "decimal", value: "18.5" },
      },
    ],
    resourceId: purchaseLineId,
    suffix,
    validAt: afterCorrectionAt,
  });
}

export function recordBom(fixture: CompanyFixture, suffix: string) {
  return proposalRequest({
    actionId: "manufacturing.recordBillOfMaterial",
    fixture,
    inputs: [
      { id: "effectiveFrom", value: { kind: "text", value: "2026-01-01" } },
      { id: "effectiveTo", value: { kind: "text", value: "2027-01-01" } },
      {
        id: "inputProductReference",
        value: { kind: "text", value: componentProductId },
      },
      {
        id: "inputQuantity",
        value: { amount: "6", kind: "quantity", unit: "each" },
      },
      {
        id: "operationReference",
        value: { kind: "text", value: "operation.press-and-assemble.r1" },
      },
      {
        id: "outputProductReference",
        value: { kind: "text", value: finishedProductId },
      },
      {
        id: "outputQuantity",
        value: { amount: "10", kind: "quantity", unit: "each" },
      },
      { id: "version", value: { kind: "integer", value: "1" } },
    ],
    resourceId: bomId,
    suffix: `bom-${suffix}`,
    validAt: manufacturingAt,
  });
}

export function manufacturingRequirement(fixture: CompanyFixture) {
  return proposalRequest({
    actionId: "manufacturing.recordRequirement",
    fixture,
    inputs: [
      { id: "bomReference", value: { kind: "text", value: bomId } },
      { id: "bomRevision", value: { kind: "integer", value: "1" } },
      {
        id: "inputProductReference",
        value: { kind: "text", value: componentProductId },
      },
      {
        id: "inputQuantity",
        value: { amount: "6", kind: "quantity", unit: "each" },
      },
      {
        id: "outputProductReference",
        value: { kind: "text", value: finishedProductId },
      },
      {
        id: "outputQuantity",
        value: { amount: "11", kind: "quantity", unit: "each" },
      },
      {
        id: "requirementReference",
        value: {
          kind: "text",
          value: "manufacturing.requirement.customer-3001",
        },
      },
    ],
    resourceId: workId,
    suffix: "requirement-initial",
    validAt: manufacturingAt,
  });
}

export function planWork(fixture: CompanyFixture) {
  return proposalRequest({
    actionId: "manufacturing.planWork",
    fixture,
    inputs: [
      {
        id: "inputQuantity",
        value: { amount: "6", kind: "quantity", unit: "each" },
      },
      {
        id: "outputQuantity",
        value: { amount: "10", kind: "quantity", unit: "each" },
      },
      {
        id: "planReference",
        value: { kind: "text", value: "manufacturing.plan.3001" },
      },
    ],
    resourceId: workId,
    suffix: "plan-initial",
    validAt: manufacturingAt,
  });
}

export function materialAvailability(fixture: CompanyFixture, quantity: string) {
  return proposalRequest({
    actionId: "manufacturing.recordMaterialAvailability",
    fixture,
    inputs: [
      {
        id: "quantity",
        value: { amount: quantity, kind: "quantity", unit: "each" },
      },
    ],
    resourceId: workId,
    suffix: `material-${quantity}`,
    validAt: manufacturingAt,
  });
}

export function startWork(fixture: CompanyFixture, suffix: string, inputQuantity: string) {
  return proposalRequest({
    actionId: "manufacturing.startWork",
    fixture,
    inputs: [
      { id: "bomRevision", value: { kind: "integer", value: "1" } },
      {
        id: "capabilityReference",
        value: { kind: "text", value: "manufacturing.capability.press-01" },
      },
      {
        id: "inputQuantity",
        value: { amount: inputQuantity, kind: "quantity", unit: "each" },
      },
      {
        id: "occurrenceReference",
        value: { kind: "text", value: `manufacturing.start.${suffix}` },
      },
      {
        id: "startedAt",
        value: { kind: "text", value: "2026-08-21T14:00:01Z" },
      },
    ],
    resourceId: workId,
    suffix: `start-${suffix}`,
    validAt: manufacturingAt,
  });
}

export function completeWork(fixture: CompanyFixture, suffix: string) {
  return proposalRequest({
    actionId: "manufacturing.recordCompletion",
    fixture,
    inputs: [
      { id: "bomRevision", value: { kind: "integer", value: "1" } },
      {
        id: "consumedQuantity",
        value: { amount: "6", kind: "quantity", unit: "each" },
      },
      {
        id: "inputLotReference",
        value: { kind: "text", value: "lot.input.3001" },
      },
      {
        id: "inputSerialReference",
        value: { kind: "text", value: "serial.input.3001" },
      },
      {
        id: "occurrenceReference",
        value: { kind: "text", value: `manufacturing.occurrence.${suffix}` },
      },
      {
        id: "outputLotReference",
        value: { kind: "text", value: "lot.output.3001" },
      },
      {
        id: "outputSerialReference",
        value: { kind: "text", value: "serial.output.3001" },
      },
      {
        id: "producedQuantity",
        value: { amount: "10", kind: "quantity", unit: "each" },
      },
    ],
    resourceId: workId,
    suffix: `completion-${suffix}`,
    validAt: manufacturingAt,
  });
}

export function recordBook(fixture: CompanyFixture) {
  return proposalRequest({
    actionId: "accounting.recordBookIdentity",
    fixture,
    inputs: [
      { id: "code", value: { kind: "text", value: "COMMERCIAL" } },
      { id: "currency", value: { kind: "text", value: "BRL" } },
      {
        id: "meaning",
        value: { kind: "text", value: "Brazil commercial book 2026" },
      },
      { id: "revision", value: { kind: "integer", value: "1" } },
    ],
    resourceId: bookId,
    suffix: "book-commercial",
    validAt: manufacturingAt,
  });
}

export function recordLedger(fixture: CompanyFixture) {
  return proposalRequest({
    actionId: "accounting.recordLedgerIdentity",
    fixture,
    inputs: [
      { id: "bookReference", value: { kind: "text", value: bookId } },
      { id: "code", value: { kind: "text", value: "SALES" } },
      { id: "revision", value: { kind: "integer", value: "1" } },
    ],
    resourceId: ledgerId,
    suffix: "ledger-sales",
    validAt: manufacturingAt,
  });
}

export function recordAccount(
  fixture: CompanyFixture,
  resourceId: string,
  classification: string,
  code: string,
  name: string,
) {
  return proposalRequest({
    actionId: "accounting.recordAccountIdentity",
    fixture,
    inputs: [
      { id: "classification", value: { kind: "text", value: classification } },
      { id: "code", value: { kind: "text", value: code } },
      { id: "name", value: { kind: "text", value: name } },
      { id: "revision", value: { kind: "integer", value: "1" } },
    ],
    resourceId,
    suffix: `account-${code}`,
    validAt: manufacturingAt,
  });
}

export function postReceivable(
  fixture: CompanyFixture,
  suffix: string,
  fulfillmentOperationId: string,
  manufacturingOperationId: string,
) {
  return proposalRequest({
    actionId: "accounting.postReceivable",
    fixture,
    inputs: [
      { id: "bookReference", value: { kind: "text", value: bookId } },
      {
        id: "claimReference",
        value: { kind: "text", value: "receivable.customer-3001" },
      },
      {
        id: "counterpartyReference",
        value: { kind: "text", value: organizationId },
      },
      {
        id: "creditAccountReference",
        value: { kind: "text", value: revenueAccountId },
      },
      { id: "creditAmount", value: { kind: "decimal", value: "59.97" } },
      { id: "currency", value: { kind: "text", value: "BRL" } },
      {
        id: "debitAccountReference",
        value: { kind: "text", value: receivableAccountId },
      },
      { id: "debitAmount", value: { kind: "decimal", value: "59.97" } },
      { id: "eventDate", value: { kind: "text", value: "2026-08-21" } },
      {
        id: "fulfillmentOperationReference",
        value: { kind: "text", value: fulfillmentOperationId },
      },
      { id: "ledgerReference", value: { kind: "text", value: ledgerId } },
      {
        id: "manufacturingOccurrenceReference",
        value: { kind: "text", value: "manufacturing.occurrence.complete" },
      },
      {
        id: "originatingOperationReference",
        value: { kind: "text", value: manufacturingOperationId },
      },
      { id: "postingDate", value: { kind: "text", value: "2026-08-21" } },
      {
        id: "postingReference",
        value: { kind: "text", value: "accounting.posting.receivable.3001" },
      },
    ],
    resourceId: claimId,
    suffix,
    validAt: manufacturingAt,
  });
}

export function requestTaxDetermination(fixture: CompanyFixture, suffix: string) {
  return proposalRequest({
    actionId: "fiscal.requestTaxDetermination",
    fixture,
    inputs: [
      {
        id: "requestReference",
        value: { kind: "text", value: `tax-request-${suffix}` },
      },
    ],
    resourceId: fiscalTaxId,
    suffix: `tax-${suffix}`,
    validAt: manufacturingAt,
  });
}

export function submitFiscalDocument(fixture: CompanyFixture, suffix: string) {
  return proposalRequest({
    actionId: "fiscal.submitDocument",
    fixture,
    inputs: [
      {
        id: "requestReference",
        value: { kind: "text", value: `document-request-fault-${suffix}` },
      },
    ],
    resourceId: fiscalIntentId,
    suffix: `document-${suffix}`,
    validAt: manufacturingAt,
  });
}

export function admitDocumentAuthorization(fixture: CompanyFixture, suffix: string) {
  return proposalRequest({
    actionId: "fiscal.admitDocumentAuthorization",
    fixture,
    inputs: [
      {
        id: "artifactDigest",
        value: { kind: "text", value: "http-200-is-not-authorization" },
      },
      {
        id: "artifactReference",
        value: { kind: "text", value: "artifact.http-200" },
      },
      {
        id: "authorityAccessKey",
        value: { kind: "text", value: "key.http-200" },
      },
      {
        id: "authorityProtocol",
        value: { kind: "text", value: "protocol.http-200" },
      },
      {
        id: "authorityStatus",
        value: { kind: "text", value: "authorized" },
      },
      {
        id: "fiscalIntentReference",
        value: { kind: "text", value: fiscalIntentId },
      },
      {
        id: "issuerRegistration",
        value: { kind: "text", value: "11222333000181" },
      },
      {
        id: "providerOperationReference",
        value: { kind: "text", value: "http.200" },
      },
      {
        id: "providerReference",
        value: { kind: "text", value: "http" },
      },
      {
        id: "remoteDocumentRevision",
        value: { kind: "integer", value: "0" },
      },
    ],
    resourceId: fiscalDocumentId,
    suffix: `admit-${suffix}`,
    validAt: manufacturingAt,
  });
}

export function applySettlement(fixture: CompanyFixture, suffix: string) {
  return proposalRequest({
    actionId: "accounting.applySettlement",
    fixture,
    inputs: [
      { id: "amount", value: { kind: "decimal", value: "20.00" } },
      { id: "currency", value: { kind: "text", value: "BRL" } },
      {
        id: "operationReference",
        value: {
          kind: "text",
          value: `operation.accounting-foundation.${suffix}`,
        },
      },
      { id: "paymentDate", value: { kind: "text", value: "2026-08-22" } },
      {
        id: "settlementReference",
        value: { kind: "text", value: "settlement.3001" },
      },
    ],
    resourceId: claimId,
    suffix,
    validAt: manufacturingAt,
  });
}

export function replenish(
  fixture: CompanyFixture,
  suffix: string,
  resourceId: string,
  quantity = "1",
) {
  return proposalRequest({
    actionId: "inventory.replenish",
    fixture,
    inputs: [
      {
        id: "quantity",
        value: { amount: quantity, kind: "quantity", unit: "kg" },
      },
    ],
    resourceId,
    suffix,
    validAt: lifecycleAt,
  });
}
