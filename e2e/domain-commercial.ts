import assert from "node:assert/strict";
import path from "node:path";
import { Code } from "@connectrpc/connect";
import {
  CommitStatus,
  PolicyDecision,
  ProposalStatus,
} from "../packages/sdk/src/gen/zoen/action/v1/action_pb.js";
import {
  e2eGeneratedDirectory,
  writeScenarioArtifact,
} from "./host-env.js";
import {
  activeDigest,
  actionClient,
  activateDefinition,
  adminClient,
  command,
  compilePackage,
  compileSurface,
  definitionClient,
  expectConnectCode,
  explainOperation,
  explanationShape,
  historyClient,
  loadPolicy,
  oidcToken,
  packageSource,
  proposalRequest,
  publishDefinition,
  rebuildProjection,
  recordEvidence,
  repositoryRoot,
  runLeakageGate,
  runLeakageMutant,
  semanticQuery,
  semanticShape,
  startServer,
  stopServer,
  tenantA,
  tenantB,
  valueShapes,
  worldClient,
  writePolicyManifest,
  type ActionClient,
  type DomainFixture,
  type EvidenceTime,
  type SemanticValue,
  type ServerProcess,
} from "./domain-commercial/support.js";

const scenario = "domain-commercial";
const assertions: Record<string, boolean> = {};
const failureInjections: string[] = [];
const organizationId = "party.organization.northstar";
const duplicateOrganizationId = "party.organization.duplicate-candidate";
const personId = "party.person.ana";
const productId = "product.item.widget-pro";
const orderLineId = "commercial.order-line.1001";
const cancellableOrderLineId = "commercial.order-line.1002";
const partnerOrderLineId = "commercial.order-line.partner-1";
const lifecycleAt = new Date("2026-08-21T12:00:00.000Z");
const yearStart = new Date("2026-01-01T00:00:00.000Z");
const supplierStart = new Date("2026-06-01T00:00:00.000Z");
const roleConflictEnd = new Date("2026-09-01T00:00:00.000Z");
const yearEnd = new Date("2027-01-01T00:00:00.000Z");
const roleQueryAt = new Date("2026-07-01T00:00:00.000Z");

function observe(name: string, condition: boolean): void {
  assert.ok(condition, name);
  assertions[name] = condition;
}

function inject(name: string): void {
  failureInjections.push(name);
}

function instant(at: Date): EvidenceTime {
  return { at, kind: "instant" };
}

function interval(start: Date, end: Date): EvidenceTime {
  return { end, kind: "interval", start };
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const [party, product, commercial, partyAgain, productAgain, commercialAgain] =
    await Promise.all([
      compilePackage("party"),
      compilePackage("product"),
      compilePackage("commercial"),
      compilePackage("party"),
      compilePackage("product"),
      compilePackage("commercial"),
    ]);
  observe(
    "threeVersionedPackagesCompileDeterministically",
    party.digest === partyAgain.digest &&
      party.canonicalJson === partyAgain.canonicalJson &&
      product.digest === productAgain.digest &&
      product.canonicalJson === productAgain.canonicalJson &&
      commercial.digest === commercialAgain.digest &&
      commercial.canonicalJson === commercialAgain.canonicalJson &&
      new Set([party.digest, product.digest, commercial.digest]).size === 3,
  );
  observe(
    "packagesRetainTypeRelationComputationAction",
    [party, product, commercial].every(
      (fixture) =>
        fixture.metadata.types.length > 0 &&
        fixture.metadata.relations.length > 0 &&
        fixture.metadata.computations.length > 0 &&
        fixture.metadata.actions.length > 0,
    ),
  );
  const productDefinitionSource = await packageSource("product");
  observe(
    "productIdentityExcludesStockQuantity",
    !/(?:stock|inventory|onHand|on_hand)/u.test(productDefinitionSource),
  );

  const activationPolicy = await loadPolicy("activation.cedar");
  const commercialPolicy = await loadPolicy("commercial.cedar");
  const identityPolicy = await loadPolicy("identity.cedar");
  const policyManifestPath = path.join(
    e2eGeneratedDirectory(repositoryRoot, scenario),
    "policies.json",
  );
  await writePolicyManifest(
    policyManifestPath,
    [party, product, commercial],
    activationPolicy,
    commercialPolicy,
    identityPolicy,
  );

  const [adminAToken, commercialAToken, adminBToken, commercialBToken] =
    await Promise.all([
      oidcToken("domain-admin-a"),
      oidcToken("commercial-agent-a"),
      oidcToken("domain-admin-b"),
      oidcToken("commercial-agent-b"),
    ]);
  const definitionA = definitionClient(adminAToken);
  const definitionB = definitionClient(adminBToken);
  const actionA = actionClient(commercialAToken);
  const actionB = actionClient(commercialBToken);
  const worldA = worldClient(adminAToken);
  const commercialWorldA = worldClient(commercialAToken);
  const commercialWorldB = worldClient(commercialBToken);
  const historyA = historyClient(commercialAToken);
  const admin = adminClient();
  let server: ServerProcess | undefined;
  await admin.connect();

  try {
    server = await startServer(policyManifestPath);
    const inactiveBeforePublish = await Promise.all(
      [party, product, commercial].flatMap((fixture) => [
        activeDigest(definitionA, tenantA, fixture),
        activeDigest(definitionB, tenantB, fixture),
      ]),
    );
    assert.ok(inactiveBeforePublish.every((digest) => digest === undefined));

    const publicationCommits = await Promise.all(
      [party, product, commercial].flatMap((fixture) => [
        publishDefinition(definitionA, tenantA, fixture),
        publishDefinition(definitionB, tenantB, fixture),
      ]),
    );
    const inactiveAfterPublish = await Promise.all(
      [party, product, commercial].flatMap((fixture) => [
        activeDigest(definitionA, tenantA, fixture),
        activeDigest(definitionB, tenantB, fixture),
      ]),
    );
    observe(
      "publishDoesNotAutoActivateAnyDomainPackage",
      publicationCommits.every((commit) => commit > 0n) &&
        inactiveAfterPublish.every((digest) => digest === undefined),
    );

    const activationCommits = await Promise.all(
      [party, product, commercial].flatMap((fixture) => [
        activateDefinition(definitionA, tenantA, fixture),
        activateDefinition(definitionB, tenantB, fixture),
      ]),
    );
    const activeAfterActivation = await Promise.all(
      [party, product, commercial].flatMap((fixture) => [
        activeDigest(definitionA, tenantA, fixture),
        activeDigest(definitionB, tenantB, fixture),
      ]),
    );
    observe(
      "allDomainPackagesActivateExplicitlyForBothTenants",
      activationCommits.every((commit) => commit > 0n) &&
        JSON.stringify(activeAfterActivation) ===
          JSON.stringify([
            party.digest,
            party.digest,
            product.digest,
            product.digest,
            commercial.digest,
            commercial.digest,
          ]),
    );

    const admittedOrganization = await commitReadyAction(
      actionA,
      partyAdmissionRequest(
        party,
        organizationId,
        "organization",
        "tax:BR:11222333000181",
        "organization",
      ),
    );
    const admittedPerson = await commitReadyAction(
      actionA,
      partyAdmissionRequest(
        party,
        personId,
        "person",
        "contact:ANA-001",
        "person",
      ),
    );
    await recordPartyRelationships(worldA, party);
    const organizationKind = await relationQuery(
      worldA,
      party,
      organizationId,
      "party.identityKind",
      roleQueryAt,
      tenantA,
    );
    const personKind = await relationQuery(
      worldA,
      party,
      personId,
      "party.identityKind",
      roleQueryAt,
      tenantA,
    );
    const legalEntities = await relationQuery(
      worldA,
      party,
      organizationId,
      "party.legalEntity",
      roleQueryAt,
      tenantA,
    );
    const organizationLocations = await relationQuery(
      worldA,
      party,
      organizationId,
      "party.location",
      roleQueryAt,
      tenantA,
    );
    const organizationContacts = await relationQuery(
      worldA,
      party,
      organizationId,
      "party.contactPoint",
      roleQueryAt,
      tenantA,
    );
    const personContacts = await relationQuery(
      worldA,
      party,
      personId,
      "party.contactPoint",
      roleQueryAt,
      tenantA,
    );
    observe(
      "personAndOrganizationIdentitiesUseGovernedActionService",
      admittedOrganization.receipt.policy?.determiningPolicyIds.includes(
        "identity-tenant-a-commit",
      ) === true &&
        admittedPerson.receipt.policy?.determiningPolicyIds.includes(
          "identity-tenant-a-commit",
        ) === true &&
        sameStrings(textValues(organizationKind), ["organization"]) &&
        sameStrings(textValues(personKind), ["person"]),
    );
    observe(
      "partyLegalEntityLocationAndContactRelationsRoundTrip",
      sameStrings(entityRefValues(legalEntities), [
        "party.legal-entity.northstar-br",
      ]) &&
        sameStrings(entityRefValues(organizationLocations), [
          "party.location.sao-paulo",
        ]) &&
        sameStrings(entityRefValues(organizationContacts), [
          "party.contact.sales",
        ]) &&
        sameStrings(entityRefValues(personContacts), [
          "party.contact.ana-email",
        ]),
    );
    const customerCommit = await recordEvidence(worldA, {
      claimId: "claim.party.northstar.customer",
      entityId: organizationId,
      fixture: party,
      relationId: "party.role",
      sourceId: "source.party-governance",
      tenantId: tenantA,
      time: interval(yearStart, yearEnd),
      value: { kind: "text", value: "customer" },
    });
    const supplierCommit = await recordEvidence(worldA, {
      claimId: "claim.party.northstar.supplier",
      entityId: organizationId,
      fixture: party,
      relationId: "party.role",
      sourceId: "source.party-governance",
      tenantId: tenantA,
      time: interval(supplierStart, yearEnd),
      value: { kind: "text", value: "supplier" },
    });
    const roleCut = supplierCommit;
    const rolesAtOverlap = await relationQuery(
      worldA,
      party,
      organizationId,
      "party.role",
      roleQueryAt,
      tenantA,
    );
    const rolesBeforeSupplier = await relationQuery(
      worldA,
      party,
      organizationId,
      "party.role",
      new Date("2026-03-01T00:00:00.000Z"),
      tenantA,
    );
    const roleEntities = await admin.query<{ entity_count: string }>(
      `SELECT count(DISTINCT entity_id)::text AS entity_count
       FROM semantic_claims
       WHERE tenant_id = $1
         AND claim_id = ANY($2::text[])`,
      [
        tenantA,
        ["claim.party.northstar.customer", "claim.party.northstar.supplier"],
      ],
    );
    observe(
      "samePartyIsSimultaneouslyCustomerAndSupplier",
      customerCommit < supplierCommit &&
        sameStrings(textValues(rolesAtOverlap), ["customer", "supplier"]) &&
        sameStrings(textValues(rolesBeforeSupplier), ["customer"]) &&
        roleEntities.rows[0]?.entity_count === "1",
    );

    await recordEvidence(worldA, {
      claimId: "claim.party.northstar.customer-conflict",
      entityId: organizationId,
      fixture: party,
      relationId: "party.role",
      sourceId: "source.partner-master",
      tenantId: tenantA,
      time: interval(supplierStart, roleConflictEnd),
      value: { kind: "text", value: "customer" },
    });
    const conflictingRoles = await relationQuery(
      worldA,
      party,
      organizationId,
      "party.role",
      roleQueryAt,
      tenantA,
    );
    const historicalRoles = await semanticQuery(worldA, {
      consistency: { commit: roleCut, kind: "snapshot" },
      entityId: organizationId,
      fixture: party,
      selection: { id: "party.role", kind: "relation" },
      tenantId: tenantA,
      validAt: roleQueryAt,
    });
    inject("overlapping-effective-customer-role");
    observe(
      "overlappingRoleAssignmentsRemainAnExplicitConflict",
      textValues(conflictingRoles).filter((role) => role === "customer")
        .length === 2 &&
        sameStrings(textValues(historicalRoles), ["customer", "supplier"]),
    );

    await recordEvidence(worldA, {
      claimId: "claim.party.duplicate.external-id",
      entityId: duplicateOrganizationId,
      fixture: party,
      relationId: "party.externalIdentifier",
      sourceId: "source.partner-master",
      tenantId: tenantA,
      time: interval(yearStart, yearEnd),
      value: { kind: "text", value: "tax:BR:11222333000181" },
    });
    const duplicateCandidates = await Promise.all(
      [organizationId, duplicateOrganizationId].map((entityId) =>
        relationQuery(
          worldA,
          party,
          entityId,
          "party.externalIdentifier",
          roleQueryAt,
          tenantA,
        ),
      ),
    );
    const duplicateIdentityRows = await admin.query<{ candidate_count: string }>(
      `SELECT count(DISTINCT entity_id)::text AS candidate_count
       FROM semantic_claims
       WHERE tenant_id = $1
         AND relation_id = $2
         AND value_text = $3`,
      [tenantA, "party.externalIdentifier", "tax:BR:11222333000181"],
    );
    inject("duplicate-external-party-identity");
    observe(
      "duplicateExternalIdentityProducesAmbiguousCandidates",
      duplicateCandidates.every((candidate) =>
        textValues(candidate).includes("tax:BR:11222333000181"),
      ) && duplicateIdentityRows.rows[0]?.candidate_count === "2",
    );

    const admittedProduct = await commitReadyAction(
      actionA,
      productAdmissionRequest(product),
    );
    await recordProductReference(worldA, product);
    const productExternalIdentifier = await relationQuery(
      worldA,
      product,
      productId,
      "product.externalIdentifier",
      lifecycleAt,
      tenantA,
    );
    const productReference = await relationQuery(
      worldA,
      product,
      productId,
      "product.reference",
      lifecycleAt,
      tenantA,
    );
    const productBaseUnit = await relationQuery(
      worldA,
      product,
      productId,
      "product.baseUnit",
      lifecycleAt,
      tenantA,
    );
    const productPack = await relationQuery(
      worldA,
      product,
      productId,
      "product.packQuantity",
      lifecycleAt,
      tenantA,
    );
    const productLifecycle = await relationQuery(
      worldA,
      product,
      productId,
      "product.lifecycleState",
      lifecycleAt,
      tenantA,
    );
    observe(
      "productIdentityUnitAndLifecycleRoundTrip",
      admittedProduct.receipt.policy?.determiningPolicyIds.includes(
        "identity-tenant-a-commit",
      ) === true &&
        sameStrings(textValues(productExternalIdentifier), ["sku:WIDGET-PRO"]) &&
        sameStrings(entityRefValues(productReference), [
          "product.reference.widget-pro",
        ]) &&
        sameStrings(textValues(productBaseUnit), ["each"]) &&
        sameStrings(quantityValues(productPack), ["1 each"]) &&
        sameStrings(textValues(productLifecycle), ["active"]),
    );

    await recordCommercialIntent(commercialWorldA, commercial, orderLineId);
    const intentSnapshot = await relationQuery(
      commercialWorldA,
      commercial,
      orderLineId,
      "commercial.requestedQuantity",
      lifecycleAt,
      tenantA,
    );
    const requestReference = await relationQuery(
      commercialWorldA,
      commercial,
      orderLineId,
      "commercial.requestReference",
      lifecycleAt,
      tenantA,
    );
    const quoteSnapshot = await relationQuery(
      commercialWorldA,
      commercial,
      orderLineId,
      "commercial.quotedUnitPrice",
      lifecycleAt,
      tenantA,
    );
    const quoteReference = await relationQuery(
      commercialWorldA,
      commercial,
      orderLineId,
      "commercial.quoteReference",
      lifecycleAt,
      tenantA,
    );
    const buyerReference = await relationQuery(
      commercialWorldA,
      commercial,
      orderLineId,
      "commercial.buyerPartyReference",
      lifecycleAt,
      tenantA,
    );
    const orderedProductReference = await relationQuery(
      commercialWorldA,
      commercial,
      orderLineId,
      "commercial.productReference",
      lifecycleAt,
      tenantA,
    );
    const commitmentBeforeAction = await relationQuery(
      commercialWorldA,
      commercial,
      orderLineId,
      "commercial.committedQuantity",
      lifecycleAt,
      tenantA,
    );
    observe(
      "requestQuoteAndCommitmentAreDistinctBeforeAction",
      sameStrings(quantityValues(intentSnapshot), ["10 each"]) &&
        sameStrings(textValues(requestReference), ["request.rfq-1001"]) &&
        sameStrings(decimalValues(quoteSnapshot), ["19.99"]) &&
        sameStrings(textValues(quoteReference), ["quote.q-1001"]) &&
        sameStrings(textValues(buyerReference), [organizationId]) &&
        sameStrings(textValues(orderedProductReference), [productId]) &&
        commitmentBeforeAction.values.length === 0 &&
        hasSource(intentSnapshot, "source.customer-request") &&
        hasSource(quoteSnapshot, "source.sales-quote"),
    );

    const claimCountBeforeInvalid = await semanticClaimCount(admin, tenantA);
    const invalidUnit = await expectConnectCode(
      () =>
        recordEvidence(commercialWorldA, {
          claimId: "claim.commercial.invalid-unit",
          entityId: orderLineId,
          fixture: commercial,
          relationId: "commercial.requestedQuantity",
          sourceId: "source.invalid",
          tenantId: tenantA,
          time: instant(lifecycleAt),
          value: { amount: "10", kind: "quantity", unit: "kg" },
        }),
      Code.InvalidArgument,
    );
    const invalidValue = await expectConnectCode(
      () =>
        recordEvidence(commercialWorldA, {
          claimId: "claim.commercial.invalid-price-type",
          entityId: orderLineId,
          fixture: commercial,
          relationId: "commercial.quotedUnitPrice",
          sourceId: "source.invalid",
          tenantId: tenantA,
          time: instant(lifecycleAt),
          value: { kind: "text", value: "nineteen ninety-nine" },
        }),
      Code.InvalidArgument,
    );
    const invalidDecimal = await expectConnectCode(
      () =>
        actionA.propose(
          createCommitmentRequest(
            commercial,
            orderLineId,
            "invalid-decimal",
            "10",
            "019.99",
          ),
        ),
      Code.InvalidArgument,
    );
    const wrongActionUnit = await expectConnectCode(
      () =>
        actionA.propose(
          proposalRequest({
            actionId: "commercial.createCommitment",
            fixture: commercial,
            inputs: [
              {
                id: "commitmentReference",
                value: {
                  kind: "text",
                  value: "commitment.order-1001",
                },
              },
              {
                id: "quantity",
                value: { amount: "10", kind: "quantity", unit: "kg" },
              },
              { id: "revision", value: { kind: "integer", value: "1" } },
              { id: "terms", value: { kind: "text", value: "net-30" } },
              {
                id: "unitPrice",
                value: { kind: "decimal", value: "19.99" },
              },
            ],
            resourceId: orderLineId,
            suffix: "invalid-action-unit",
            validAt: lifecycleAt,
          }),
        ),
      Code.InvalidArgument,
    );
    const negativePrice = await actionA.propose(
      createCommitmentRequest(
        commercial,
        orderLineId,
        "negative-price",
        "10",
        "-1",
      ),
    );
    const claimCountAfterInvalid = await semanticClaimCount(admin, tenantA);
    inject("invalid-commercial-unit");
    inject("invalid-commercial-value");
    inject("noncanonical-commercial-price");
    inject("negative-commercial-price");
    observe(
      "invalidUnitValueAndPriceCannotWrite",
      invalidUnit === Code.InvalidArgument &&
        invalidValue === Code.InvalidArgument &&
        invalidDecimal === Code.InvalidArgument &&
        wrongActionUnit === Code.InvalidArgument &&
        negativePrice.decision === PolicyDecision.DENY &&
        negativePrice.proposal === undefined &&
        claimCountAfterInvalid === claimCountBeforeInvalid,
    );

    const created = await commitReadyAction(
      actionA,
      createCommitmentRequest(
        commercial,
        orderLineId,
        "create-1001",
        "10",
        "19.99",
      ),
    );
    const createdQuantity = await relationQuery(
      commercialWorldA,
      commercial,
      orderLineId,
      "commercial.committedQuantity",
      lifecycleAt,
      tenantA,
    );
    const createdPrice = await relationQuery(
      commercialWorldA,
      commercial,
      orderLineId,
      "commercial.committedUnitPrice",
      lifecycleAt,
      tenantA,
    );
    const createdReference = await relationQuery(
      commercialWorldA,
      commercial,
      orderLineId,
      "commercial.commitmentReference",
      lifecycleAt,
      tenantA,
    );
    const createdTerms = await relationQuery(
      commercialWorldA,
      commercial,
      orderLineId,
      "commercial.terms",
      lifecycleAt,
      tenantA,
    );
    observe(
      "commercialCreateUsesOidcCedarDelegationAndExactValues",
      created.receipt.definition?.digest === commercial.digest &&
        created.receipt.policy?.determiningPolicyIds.includes(
          "commercial-tenant-a-commit",
        ) === true &&
        sameStrings(quantityValues(createdQuantity), ["10 each"]) &&
        sameStrings(decimalValues(createdPrice), ["19.99"]) &&
        sameStrings(textValues(createdReference), ["commitment.order-1001"]) &&
        sameStrings(textValues(createdTerms), ["net-30"]),
    );

    await recordEvidence(commercialWorldA, {
      claimId: "claim.commercial.message.change-1",
      entityId: orderLineId,
      fixture: commercial,
      relationId: "commercial.proposedByMessage",
      sourceId: "source.customer-message",
      tenantId: tenantA,
      time: instant(lifecycleAt),
      value: { kind: "text", value: "message.customer.change-1" },
    });
    await recordEvidence(commercialWorldA, {
      claimId: "claim.commercial.proposed-quantity-1",
      entityId: orderLineId,
      fixture: commercial,
      relationId: "commercial.proposedQuantity",
      sourceId: "source.customer-message",
      tenantId: tenantA,
      time: instant(lifecycleAt),
      value: { amount: "8", kind: "quantity", unit: "each" },
    });
    const commitmentAfterMessage = await relationQuery(
      commercialWorldA,
      commercial,
      orderLineId,
      "commercial.committedQuantity",
      lifecycleAt,
      tenantA,
    );
    const proposedByMessage = await relationQuery(
      commercialWorldA,
      commercial,
      orderLineId,
      "commercial.proposedQuantity",
      lifecycleAt,
      tenantA,
    );
    observe(
      "sourceMessageProposesWithoutMutatingCommitment",
      sameStrings(quantityValues(commitmentAfterMessage), ["10 each"]) &&
        sameStrings(quantityValues(proposedByMessage), ["8 each"]) &&
        hasSource(proposedByMessage, "source.customer-message"),
    );

    const staleRequest = changeCommitmentRequest(
      commercial,
      orderLineId,
      "change-stale",
    );
    const staleProposal = await actionA.propose(staleRequest);
    assert.equal(staleProposal.decision, PolicyDecision.PERMIT);
    assert.ok(staleProposal.proposal);
    assert.equal(staleProposal.proposal.status, ProposalStatus.READY);
    await recordEvidence(commercialWorldA, {
      claimId: "claim.commercial.message.change-2",
      entityId: orderLineId,
      fixture: commercial,
      relationId: "commercial.proposedByMessage",
      sourceId: "source.customer-message-confirmation",
      tenantId: tenantA,
      time: instant(lifecycleAt),
      value: { kind: "text", value: "message.customer.change-2" },
    });
    await recordEvidence(commercialWorldA, {
      claimId: "claim.commercial.proposed-quantity-2",
      entityId: orderLineId,
      fixture: commercial,
      relationId: "commercial.proposedQuantity",
      sourceId: "source.customer-message-confirmation",
      tenantId: tenantA,
      time: instant(lifecycleAt),
      value: { amount: "8", kind: "quantity", unit: "each" },
    });
    const staleCommit = await actionA.commit({
      operationId: staleRequest.operationId,
      proposalId: staleRequest.proposalId,
    });
    const commitmentAfterStale = await relationQuery(
      commercialWorldA,
      commercial,
      orderLineId,
      "commercial.committedQuantity",
      lifecycleAt,
      tenantA,
    );
    inject("source-message-changed-after-commercial-proposal");
    observe(
      "commercialChangeRejectsStaleActionBasis",
      staleCommit.status === CommitStatus.STALE &&
        staleCommit.receipt === undefined &&
        staleCommit.currentStateBasis?.digest !==
          staleProposal.proposal.stateBasis?.digest &&
        sameStrings(quantityValues(commitmentAfterStale), ["10 each"]),
    );

    const changed = await commitReadyAction(
      actionA,
      changeCommitmentRequest(
        commercial,
        orderLineId,
        "change-accepted",
      ),
    );
    const commitmentAfterChange = await relationQuery(
      commercialWorldA,
      commercial,
      orderLineId,
      "commercial.committedQuantity",
      lifecycleAt,
      tenantA,
    );
    const commitmentAtCreation = await semanticQuery(commercialWorldA, {
      consistency: {
        commit: created.receipt.commitSequence,
        kind: "snapshot",
      },
      entityId: orderLineId,
      fixture: commercial,
      selection: {
        id: "commercial.committedQuantity",
        kind: "relation",
      },
      tenantId: tenantA,
      validAt: lifecycleAt,
    });
    observe(
      "intentCommitmentAndCorrectionRemainSeparateHistory",
      sameStrings(quantityValues(commitmentAtCreation), ["10 each"]) &&
        sameStrings(quantityValues(commitmentAfterChange), [
          "10 each",
          "8 each",
        ]) &&
        changed.receipt.recordIds.length === 4,
    );

    const changedExplanation = await explainOperation(
      historyA,
      changed.receipt.operationId,
    );
    if (changedExplanation.subject.case !== "action") {
      throw new Error("commercial change did not produce an Action explanation");
    }
    observe(
      "commercialExplanationPinsDefinitionPolicyAndSourceBasis",
      changedExplanation.complete &&
        changedExplanation.gaps.length === 0 &&
        changedExplanation.subject.value.definition?.reference?.digest ===
          commercial.digest &&
        changedExplanation.subject.value.proposalStateBasis?.basis?.dependencies.some(
          (dependency) =>
            dependency.claimId === "claim.commercial.proposed-quantity-2" &&
            dependency.sourceId === "source.customer-message-confirmation",
        ) === true &&
        changedExplanation.subject.value.policies.some((policy) =>
          policy.policy?.determiningPolicyIds.includes(
            "commercial-tenant-a-commit",
          ),
        ),
    );
    const changedExplanationBeforeRestart =
      explanationShape(changedExplanation);

    const fulfilled = await commitReadyAction(
      actionA,
      fulfillmentRequest(commercial, orderLineId, "fulfill-partial"),
    );
    const openQuantity = await semanticQuery(commercialWorldA, {
      entityId: orderLineId,
      fixture: commercial,
      selection: { id: "commercial.openQuantity", kind: "computation" },
      tenantId: tenantA,
      validAt: lifecycleAt,
    });
    observe(
      "partialFulfillmentKeepsExactOpenQuantityAndLineage",
      fulfilled.receipt.recordIds.length === 2 &&
        quantityValues(openQuantity).includes("5 each") &&
        hasRelation(openQuantity, "commercial.committedQuantity") &&
        hasRelation(openQuantity, "commercial.fulfilledQuantity"),
    );

    const claimsBeforeBlockedCancel = await semanticClaimCount(admin, tenantA);
    const blockedCancelRequest = cancellationRequest(
      commercial,
      orderLineId,
      "cancel-blocked",
      "commitment.order-1001",
      "5",
    );
    const blockedCancel = await actionA.propose(blockedCancelRequest);
    const claimsAfterBlockedCancel = await semanticClaimCount(admin, tenantA);
    inject("cancellation-after-downstream-fulfillment");
    observe(
      "downstreamDependencyRequiresExplicitCorrection",
      blockedCancel.decision === PolicyDecision.DENY &&
        blockedCancel.proposal === undefined &&
        blockedCancel.stateBasis?.dependencies.some((dependency) =>
          dependency.claimId.includes(
            fulfilled.receipt.operationId,
          ),
        ) === true &&
        claimsAfterBlockedCancel === claimsBeforeBlockedCancel,
    );

    const corrected = await commitReadyAction(
      actionA,
      correctionRequest(commercial, orderLineId, "correct-after-fulfillment"),
    );
    const correctionAfterCommit = await relationQuery(
      commercialWorldA,
      commercial,
      orderLineId,
      "commercial.correctionOf",
      lifecycleAt,
      tenantA,
    );
    const correctionBeforeCommit = await semanticQuery(commercialWorldA, {
      consistency: {
        commit: fulfilled.receipt.commitSequence,
        kind: "snapshot",
      },
      entityId: orderLineId,
      fixture: commercial,
      selection: { id: "commercial.correctionOf", kind: "relation" },
      tenantId: tenantA,
      validAt: lifecycleAt,
    });
    observe(
      "explicitCorrectionAppendsWithoutRewritingCommitment",
      correctionBeforeCommit.values.length === 1 &&
        correctionAfterCommit.values.length === 2 &&
        textValues(correctionAfterCommit).includes("commitment.order-1001") &&
        sameStrings(quantityValues(commitmentAfterChange), [
          "10 each",
          "8 each",
        ]) &&
        corrected.receipt.recordIds.length === 3,
    );

    await recordEvidence(commercialWorldA, {
      claimId: "claim.commercial.cancelable-dependency-count",
      entityId: cancellableOrderLineId,
      fixture: commercial,
      relationId: "commercial.downstreamDependencyCount",
      sourceId: "source.commercial-control",
      tenantId: tenantA,
      time: instant(lifecycleAt),
      value: { kind: "integer", value: "0" },
    });
    const cancellableCreated = await commitReadyAction(
      actionA,
      createCommitmentRequest(
        commercial,
        cancellableOrderLineId,
        "create-1002",
        "2",
        "9.5",
      ),
    );
    const cancelled = await commitReadyAction(
      actionA,
      cancellationRequest(
        commercial,
        cancellableOrderLineId,
        "cancel-1002",
        "commitment.order-1002",
        "2",
      ),
    );
    const cancellationHistory = await relationQuery(
      commercialWorldA,
      commercial,
      cancellableOrderLineId,
      "commercial.cancellationOf",
      lifecycleAt,
      tenantA,
    );
    observe(
      "cancellationIsANewGovernedHistoricalRecord",
      cancellableCreated.receipt.commitSequence <
        cancelled.receipt.commitSequence &&
        sameStrings(textValues(cancellationHistory), [
          "commitment.order-1002",
        ]) &&
        cancelled.receipt.policy?.determiningPolicyIds.includes(
          "commercial-tenant-a-commit",
        ) === true,
    );

    await recordEvidence(commercialWorldB, {
      claimId: "claim.commercial.partner-dependency-count",
      entityId: partnerOrderLineId,
      fixture: commercial,
      relationId: "commercial.downstreamDependencyCount",
      sourceId: "source.partner-policy",
      tenantId: tenantB,
      time: instant(lifecycleAt),
      value: { kind: "integer", value: "0" },
    });
    const partnerCreated = await commitReadyAction(
      actionB,
      createCommitmentRequest(
        commercial,
        partnerOrderLineId,
        "partner-create",
        "4",
        "21.25",
      ),
    );
    const tenantSubstitution = await expectConnectCode(
      () =>
        actionA.propose(
          createCommitmentRequest(
            commercial,
            partnerOrderLineId,
            "tenant-substitution",
            "4",
            "21.25",
          ),
        ),
      Code.PermissionDenied,
    );
    const partnerOperation = await admin.query<{ tenant_id: string }>(
      `SELECT tenant_id
       FROM action_operations
       WHERE operation_id = $1`,
      [partnerCreated.receipt.operationId],
    );
    const partnerRequest = createCommitmentRequest(
      commercial,
      partnerOrderLineId,
      "payload-shape",
      "4",
      "21.25",
    );
    inject("cross-tenant-commercial-resource-substitution");
    observe(
      "tenantComesFromOidcAndDelegationNotActionPayload",
      tenantSubstitution === Code.PermissionDenied &&
        !Object.hasOwn(partnerRequest, "tenantId") &&
        partnerOperation.rows[0]?.tenant_id === tenantB,
    );
    observe(
      "twoTenantsUseDifferentCedarPoliciesOnOneRuntime",
      created.receipt.policy?.determiningPolicyIds.includes(
        "commercial-tenant-a-commit",
      ) === true &&
        partnerCreated.receipt.policy?.determiningPolicyIds.includes(
          "commercial-tenant-b-commit",
        ) === true &&
        created.receipt.definition?.digest ===
          partnerCreated.receipt.definition?.digest,
    );

    const surface = compileSurface(commercial, orderLineId);
    const surfaceActions = surface.actionBindings.map(
      (binding) => binding.ref.actionId,
    );
    observe(
      "deterministicSurfaceUsesTheCommercialDefinitionWithoutLlm",
      surface.attribution.compiler === "deterministic" &&
        surface.attribution.generatedWithoutLlm &&
        surface.attribution.definitionDigest === commercial.digest &&
        [
          "commercial.cancelCommitment",
          "commercial.changeCommitment",
          "commercial.correctCommitment",
          "commercial.createCommitment",
          "commercial.recordFulfillment",
        ].every((actionId) => surfaceActions.includes(actionId)) &&
        surface.queryBindings.some(
          (binding) =>
            binding.ref.kind === "relation" &&
            binding.ref.relationId === "commercial.committedQuantity",
        ),
    );

    const strongCorrection = await relationQuery(
      commercialWorldA,
      commercial,
      orderLineId,
      "commercial.correctedQuantity",
      lifecycleAt,
      tenantA,
    );
    const projection = await rebuildProjection(tenantA);
    const projectedCorrection = await semanticQuery(commercialWorldA, {
      consistency: { kind: "eventual" },
      entityId: orderLineId,
      fixture: commercial,
      selection: { id: "commercial.correctedQuantity", kind: "relation" },
      tenantId: tenantA,
      validAt: lifecycleAt,
    });
    observe(
      "postgresCommitProjectsToDataFusionWithEquivalentLineage",
      projection.wroteManifest &&
        projection.projectedRows > 0 &&
        semanticShape(strongCorrection) ===
          semanticShape(projectedCorrection),
    );

    const correctionExplanation = await explainOperation(
      historyA,
      corrected.receipt.operationId,
    );
    const correctionExplanationBeforeRestart =
      explanationShape(correctionExplanation);
    const beforeRestartPid = server.child.pid;
    await stopServer(server);
    server = undefined;
    server = await startServer(policyManifestPath);
    const restartedWorld = worldClient(commercialAToken);
    const restartedHistory = historyClient(commercialAToken);
    const correctionAfterRestart = await relationQuery(
      restartedWorld,
      commercial,
      orderLineId,
      "commercial.correctedQuantity",
      lifecycleAt,
      tenantA,
    );
    const projectedAfterRestart = await semanticQuery(restartedWorld, {
      consistency: { kind: "eventual" },
      entityId: orderLineId,
      fixture: commercial,
      selection: { id: "commercial.correctedQuantity", kind: "relation" },
      tenantId: tenantA,
      validAt: lifecycleAt,
    });
    const historicalAfterRestart = await semanticQuery(restartedWorld, {
      consistency: {
        commit: created.receipt.commitSequence,
        kind: "snapshot",
      },
      entityId: orderLineId,
      fixture: commercial,
      selection: {
        id: "commercial.committedQuantity",
        kind: "relation",
      },
      tenantId: tenantA,
      validAt: lifecycleAt,
    });
    const changedAfterRestart = await explainOperation(
      restartedHistory,
      changed.receipt.operationId,
    );
    const correctedAfterRestart = await explainOperation(
      restartedHistory,
      corrected.receipt.operationId,
    );
    observe(
      "restartRegeneratesCurrentHistoricalProjectionAndExplanation",
      beforeRestartPid !== server.child.pid &&
        semanticShape(correctionAfterRestart) ===
          semanticShape(projectedAfterRestart) &&
        sameStrings(quantityValues(historicalAfterRestart), ["10 each"]) &&
        explanationShape(changedAfterRestart) ===
          changedExplanationBeforeRestart &&
        explanationShape(correctedAfterRestart) ===
          correctionExplanationBeforeRestart,
    );

    const cleanLeakage = await runLeakageGate();
    const mutantLeakage = await runLeakageMutant();
    observe(
      "genericRustContainsNoPartyProductOrCommercialDispatch",
      cleanLeakage.code === 0 &&
        JSON.parse(cleanLeakage.stdout).findings.length === 0,
    );
    observe(
      "knownCommercialActionBranchMutantIsKilled",
      mutantLeakage.code !== 0 &&
        /commercial\.changeCommitment/u.test(mutantLeakage.stderr),
    );

    const authorityTables = await admin.query<{ tablename: string }>(
      `SELECT tablename
       FROM pg_tables
       WHERE schemaname = 'public'
         AND (
           tablename LIKE '%ledger%'
           OR tablename LIKE '%commits%'
           OR tablename = 'projection_outbox'
         )
       ORDER BY tablename`,
    );
    observe(
      "authorityCommitsAndProjectionOutboxRemainCanonical",
      sameStrings(
        authorityTables.rows.map((row) => row.tablename),
        ["authority_commits", "projection_outbox"],
      ) &&
        projection.manifestDigest.length === 64 &&
        projection.parquetDigest.length === 64,
    );

    const coreTree = await command("cargo", [
      "tree",
      "--package",
      "zoen-core",
      "--depth",
      "1",
    ]);
    observe(
      "zoenCoreStillHasNoIoOrWasmtimeDependencies",
      coreTree.split("\n").filter(Boolean).length === 1,
    );

    const postgresVersion = (
      await admin.query<{ server_version: string }>("SHOW server_version")
    ).rows[0]?.server_version;
    assert.match(postgresVersion ?? "", /^18\./u);
    const keycloakVersion = await command("docker", [
      "compose",
      "--project-name",
      "zoen-domain-commercial",
      "--file",
      "e2e/domain-commercial/compose.yaml",
      "exec",
      "-T",
      "keycloak",
      "/opt/keycloak/bin/kc.sh",
      "--version",
    ]);
    assert.match(keycloakVersion, /Keycloak 26\.0\.7/u);
    const sourceCommit = await command("git", ["rev-parse", "HEAD"]);
    const manifest = {
      architectureDeviations: [],
      assertions,
      componentVersions: {
        datafusion: "embedded zoen-query",
        keycloak: keycloakVersion.split("\n")[0],
        minio: "S3-compatible projection store",
        postgres: postgresVersion,
      },
      definitions: {
        commercial: definitionEvidence(commercial),
        party: definitionEvidence(party),
        product: definitionEvidence(product),
      },
      failureInjections,
      finishedAt: new Date().toISOString(),
      historicalCuts: {
        commitmentCreated: created.receipt.commitSequence.toString(),
        commitmentCorrected: corrected.receipt.commitSequence.toString(),
        partyRolesBeforeConflict: roleCut.toString(),
      },
      operations: {
        cancellation: cancelled.receipt.operationId,
        change: changed.receipt.operationId,
        correction: corrected.receipt.operationId,
        create: created.receipt.operationId,
        fulfillment: fulfilled.receipt.operationId,
        partnerCreate: partnerCreated.receipt.operationId,
      },
      projection: {
        manifestDigest: projection.manifestDigest,
        parquetDigest: projection.parquetDigest,
        projectedRows: projection.projectedRows,
        throughCommit: projection.throughCommit,
      },
      scenario,
      sourceCommit,
      startedAt,
      tenants: [tenantA, tenantB],
    };
    await writeScenarioArtifact(repositoryRoot, scenario, manifest);
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  } finally {
    if (server !== undefined) {
      await stopServer(server);
    }
    await admin.end();
  }
}

async function recordPartyRelationships(
  client: ReturnType<typeof worldClient>,
  fixture: DomainFixture,
): Promise<void> {
  const records: readonly {
    readonly claimId: string;
    readonly entityId: string;
    readonly relationId: string;
    readonly sourceId: string;
    readonly value: SemanticValue;
  }[] = [
    {
      claimId: "claim.party.northstar.legal-entity",
      entityId: organizationId,
      relationId: "party.legalEntity",
      sourceId: "source.party-registry",
      value: {
        kind: "entity-ref",
        value: "party.legal-entity.northstar-br",
      },
    },
    {
      claimId: "claim.party.northstar.location",
      entityId: organizationId,
      relationId: "party.location",
      sourceId: "source.party-registry",
      value: { kind: "entity-ref", value: "party.location.sao-paulo" },
    },
    {
      claimId: "claim.party.northstar.contact",
      entityId: organizationId,
      relationId: "party.contactPoint",
      sourceId: "source.party-registry",
      value: { kind: "entity-ref", value: "party.contact.sales" },
    },
    {
      claimId: "claim.party.ana.contact",
      entityId: personId,
      relationId: "party.contactPoint",
      sourceId: "source.party-registry",
      value: { kind: "entity-ref", value: "party.contact.ana-email" },
    },
  ];
  for (const record of records) {
    await recordEvidence(client, {
      ...record,
      fixture,
      tenantId: tenantA,
      time: interval(yearStart, yearEnd),
    });
  }
}

async function recordProductReference(
  client: ReturnType<typeof worldClient>,
  fixture: DomainFixture,
): Promise<void> {
  const records: readonly {
    readonly claimId: string;
    readonly relationId: string;
    readonly value: SemanticValue;
  }[] = [
    {
      claimId: "claim.product.widget.reference",
      relationId: "product.reference",
      value: {
        kind: "entity-ref",
        value: "product.reference.widget-pro",
      },
    },
  ];
  for (const record of records) {
    await recordEvidence(client, {
      ...record,
      entityId: productId,
      fixture,
      sourceId: "source.product-catalog",
      tenantId: tenantA,
      time: instant(lifecycleAt),
    });
  }
}

async function recordCommercialIntent(
  client: ReturnType<typeof worldClient>,
  fixture: DomainFixture,
  entityId: string,
): Promise<void> {
  const records: readonly {
    readonly claimId: string;
    readonly relationId: string;
    readonly sourceId: string;
    readonly value: SemanticValue;
  }[] = [
    {
      claimId: "claim.commercial.request-reference",
      relationId: "commercial.requestReference",
      sourceId: "source.customer-request",
      value: { kind: "text", value: "request.rfq-1001" },
    },
    {
      claimId: "claim.commercial.buyer-party",
      relationId: "commercial.buyerPartyReference",
      sourceId: "source.customer-request",
      value: { kind: "text", value: organizationId },
    },
    {
      claimId: "claim.commercial.product-reference",
      relationId: "commercial.productReference",
      sourceId: "source.customer-request",
      value: { kind: "text", value: productId },
    },
    {
      claimId: "claim.commercial.requested-quantity",
      relationId: "commercial.requestedQuantity",
      sourceId: "source.customer-request",
      value: { amount: "10", kind: "quantity", unit: "each" },
    },
    {
      claimId: "claim.commercial.quote-reference",
      relationId: "commercial.quoteReference",
      sourceId: "source.sales-quote",
      value: { kind: "text", value: "quote.q-1001" },
    },
    {
      claimId: "claim.commercial.quoted-quantity",
      relationId: "commercial.quotedQuantity",
      sourceId: "source.sales-quote",
      value: { amount: "10", kind: "quantity", unit: "each" },
    },
    {
      claimId: "claim.commercial.quoted-price",
      relationId: "commercial.quotedUnitPrice",
      sourceId: "source.sales-quote",
      value: { kind: "decimal", value: "19.99" },
    },
    {
      claimId: "claim.commercial.initial-dependency-count",
      relationId: "commercial.downstreamDependencyCount",
      sourceId: "source.commercial-control",
      value: { kind: "integer", value: "0" },
    },
  ];
  for (const record of records) {
    await recordEvidence(client, {
      ...record,
      entityId,
      fixture,
      tenantId: tenantA,
      time: instant(lifecycleAt),
    });
  }
}

function partyAdmissionRequest(
  fixture: DomainFixture,
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
    validAt: roleQueryAt,
  });
}

function productAdmissionRequest(fixture: DomainFixture) {
  return proposalRequest({
    actionId: "product.admitItem",
    fixture,
    inputs: [
      {
        id: "externalIdentifier",
        value: { kind: "text", value: "sku:WIDGET-PRO" },
      },
      { id: "lifecycleState", value: { kind: "text", value: "active" } },
      {
        id: "packQuantity",
        value: { amount: "1", kind: "quantity", unit: "each" },
      },
    ],
    resourceId: productId,
    suffix: "admit-widget-pro",
    validAt: lifecycleAt,
  });
}

function createCommitmentRequest(
  fixture: DomainFixture,
  resourceId: string,
  suffix: string,
  quantity: string,
  unitPrice: string,
) {
  return proposalRequest({
    actionId: "commercial.createCommitment",
    fixture,
    inputs: [
      {
        id: "commitmentReference",
        value: {
          kind: "text",
          value:
            resourceId === partnerOrderLineId
              ? "commitment.partner-1"
              : resourceId === cancellableOrderLineId
                ? "commitment.order-1002"
                : "commitment.order-1001",
        },
      },
      {
        id: "quantity",
        value: { amount: quantity, kind: "quantity", unit: "each" },
      },
      { id: "revision", value: { kind: "integer", value: "1" } },
      { id: "terms", value: { kind: "text", value: "net-30" } },
      { id: "unitPrice", value: { kind: "decimal", value: unitPrice } },
    ],
    resourceId,
    suffix,
    validAt: lifecycleAt,
  });
}

function changeCommitmentRequest(
  fixture: DomainFixture,
  resourceId: string,
  suffix: string,
) {
  return proposalRequest({
    actionId: "commercial.changeCommitment",
    fixture,
    inputs: [
      {
        id: "correctionOf",
        value: { kind: "text", value: "commitment.order-1001" },
      },
      {
        id: "quantity",
        value: { amount: "8", kind: "quantity", unit: "each" },
      },
      { id: "revision", value: { kind: "integer", value: "2" } },
      { id: "unitPrice", value: { kind: "decimal", value: "18.75" } },
    ],
    resourceId,
    suffix,
    validAt: lifecycleAt,
  });
}

function fulfillmentRequest(
  fixture: DomainFixture,
  resourceId: string,
  suffix: string,
) {
  return proposalRequest({
    actionId: "commercial.recordFulfillment",
    fixture,
    inputs: [
      {
        id: "quantity",
        value: { amount: "3", kind: "quantity", unit: "each" },
      },
    ],
    resourceId,
    suffix,
    validAt: lifecycleAt,
  });
}

function cancellationRequest(
  fixture: DomainFixture,
  resourceId: string,
  suffix: string,
  cancellationOf: string,
  quantity: string,
) {
  return proposalRequest({
    actionId: "commercial.cancelCommitment",
    fixture,
    inputs: [
      {
        id: "cancellationOf",
        value: { kind: "text", value: cancellationOf },
      },
      {
        id: "quantity",
        value: { amount: quantity, kind: "quantity", unit: "each" },
      },
    ],
    resourceId,
    suffix,
    validAt: lifecycleAt,
  });
}

function correctionRequest(
  fixture: DomainFixture,
  resourceId: string,
  suffix: string,
) {
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
    resourceId,
    suffix,
    validAt: lifecycleAt,
  });
}

async function commitReadyAction(
  client: ActionClient,
  request: ReturnType<typeof proposalRequest>,
) {
  const proposed = await client.propose(request);
  assert.equal(proposed.decision, PolicyDecision.PERMIT);
  assert.equal(proposed.proposal?.status, ProposalStatus.READY);
  assert.ok(proposed.proposal);
  const committed = await client.commit({
    operationId: request.operationId,
    proposalId: request.proposalId,
  });
  assert.equal(committed.status, CommitStatus.COMMITTED);
  assert.ok(committed.receipt);
  return { proposal: proposed.proposal, receipt: committed.receipt };
}

function relationQuery(
  client: ReturnType<typeof worldClient>,
  fixture: DomainFixture,
  entityId: string,
  relationId: string,
  validAt: Date,
  tenantId: string,
) {
  return semanticQuery(client, {
    entityId,
    fixture,
    selection: { id: relationId, kind: "relation" },
    tenantId,
    validAt,
  });
}

function textValues(
  response: Awaited<ReturnType<typeof semanticQuery>>,
): string[] {
  return valueShapes(response).flatMap((value) =>
    value.kind === "text" ? [value.value] : [],
  );
}

function entityRefValues(
  response: Awaited<ReturnType<typeof semanticQuery>>,
): string[] {
  return valueShapes(response).flatMap((value) =>
    value.kind === "entity-ref" ? [value.value] : [],
  );
}

function decimalValues(
  response: Awaited<ReturnType<typeof semanticQuery>>,
): string[] {
  return valueShapes(response).flatMap((value) =>
    value.kind === "decimal" ? [value.value] : [],
  );
}

function quantityValues(
  response: Awaited<ReturnType<typeof semanticQuery>>,
): string[] {
  return valueShapes(response).flatMap((value) =>
    value.kind === "quantity" ? [`${value.amount} ${value.unit}`] : [],
  );
}

function hasSource(
  response: Awaited<ReturnType<typeof semanticQuery>>,
  sourceId: string,
): boolean {
  return response.values.some((value) =>
    value.dependencies.some((dependency) => dependency.sourceId === sourceId),
  );
}

function hasRelation(
  response: Awaited<ReturnType<typeof semanticQuery>>,
  relationId: string,
): boolean {
  return response.values.some((value) =>
    value.dependencies.some(
      (dependency) => dependency.relationId === relationId,
    ),
  );
}

function sameStrings(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return (
    JSON.stringify([...actual].sort()) ===
    JSON.stringify([...expected].sort())
  );
}

async function semanticClaimCount(
  client: ReturnType<typeof adminClient>,
  tenantId: string,
): Promise<number> {
  const result = await client.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM semantic_claims WHERE tenant_id = $1",
    [tenantId],
  );
  return Number(result.rows[0]?.count);
}

function definitionEvidence(fixture: DomainFixture) {
  return {
    definitionId: fixture.definition.definitionId,
    digest: fixture.digest,
    revision: fixture.definition.revision.toString(),
  };
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
