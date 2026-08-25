import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { formatWhatsAppMinuteText } from "../../packages/messaging/src/whatsapp-minute.js";
import {
  compileCommercial,
  definitionReference,
  ingestChangeCommitmentBasis,
  ingestQuotedQuantityRivals,
  oidcToken,
  publish,
  quantityLabels,
  queryRelation,
  quantityRelationId,
  resourceId,
  waitForOidc,
  writePolicyManifest,
  definitionClient,
  worldClient,
} from "./support.js";

const pairDir = process.env.ZOEN_WA_PAIR_DIR ?? "/tmp/zoen-wa-pair";
const actionUrl =
  process.env.ZOEN_WHATSAPP_MINUTE_URL ?? "https://app.zoen.local/";

async function main(): Promise<void> {
  await mkdir(pairDir, { recursive: true });
  const commercial = await compileCommercial();
  const policyPath = path.join(pairDir, "policies.json");
  await writePolicyManifest(policyPath, commercial);
  await waitForOidc();
  const token = await oidcToken("admin-a");
  const definitions = definitionClient(token);
  const world = worldClient(token);
  const published = await publish(definitions, commercial);
  await definitions.activateRevision({
    activeRevisionPrecondition: {
      case: "expectNoActiveRevision",
      value: true,
    },
    definitionId: commercial.definition.definitionId,
    digest: commercial.digest,
    tenantId: "tenant.a",
  });
  const definition = definitionReference(commercial);
  await ingestQuotedQuantityRivals(world, definition);
  await ingestChangeCommitmentBasis(world, definition);
  const quoted = await queryRelation(world, definition, quantityRelationId);
  const labels = quantityLabels(quoted);
  if (labels.join(",") !== "10 each,12 each") {
    throw new Error(`unexpected rivals ${labels.join(",")}`);
  }
  const rivals = [
    { label: "10 each", sourceId: "source.sheet" },
    { label: "12 each", sourceId: "source.erp" },
  ];
  const minute = {
    actionUrl,
    entityId: resourceId,
    rivals,
  };
  const text = formatWhatsAppMinuteText(minute);
  await writeFile(
    path.join(pairDir, "minute.json"),
    `${JSON.stringify({ ...minute, text }, null, 2)}\n`,
  );
  process.stdout.write(
    `${JSON.stringify(
      {
        digest: published.digest,
        policyPath,
        rivals,
        resourceId,
        text,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
