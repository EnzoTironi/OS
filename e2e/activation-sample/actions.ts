import {
  proposalRequest,
  type DomainFixture,
  type SemanticValue,
} from "../domain-inventory-procurement/support.js";

export const lifecycleAt = new Date("2026-08-21T12:00:00.000Z");
export const afterCorrectionAt = new Date("2026-08-21T12:00:01.000Z");
export const organizationId = "party.organization.northstar";
export const productId = "product.item.widget-pro";
export const orderLineId = "commercial.order-line.1001";
export const stockPositionId = "inventory.position.widget-pro.wh-1";
export const purchaseLineId = "procurement.purchase-line.2001";
export const supplierPartyId = "party.organization.supplier";

export function createCommitment(
  fixture: DomainFixture,
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

export function recordRequirement(
  fixture: DomainFixture,
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

export function requestSupplier(fixture: DomainFixture, quantity: SemanticValue) {
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

export function governPurchase(fixture: DomainFixture, suffix: string) {
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
