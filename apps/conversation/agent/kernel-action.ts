import { runZoenArgv } from "./sandbox/run-zoen";

export type KernelInput = {
  readonly inputId: string;
  readonly value: { readonly textValue: string };
};

export async function commitKernelAction(command: {
  readonly actionId: string;
  readonly resourceId: string;
  readonly inputs: readonly KernelInput[];
}): Promise<unknown> {
  if (process.env.ZOEN_ISOLATE === "1") {
    throw new Error("isolate cannot commit");
  }
  const zoend = process.env.ZOEN_ZOEND?.trim();
  const bearer = process.env.ZOEN_BEARER?.trim();
  const tenant = process.env.ZOEN_TENANT?.trim();
  const definitionId = process.env.ZOEN_DEFINITION_ID?.trim();
  const digest = process.env.ZOEN_DEFINITION_DIGEST?.trim();
  if (!zoend || !bearer || !tenant || !definitionId || !digest) {
    throw new Error("zoend session env is required");
  }
  const env = {
    ZOEN_ISOLATE: "0",
    ZOEN_ZOEND: zoend,
    ZOEN_BEARER: bearer,
    ZOEN_TENANT: tenant,
    ZOEN_DEFINITION_ID: definitionId,
    ZOEN_DEFINITION_DIGEST: digest,
    ZOEN_VALID_AT: process.env.ZOEN_VALID_AT?.trim() || "2026-01-15T00:00:00Z",
  };
  const slug = command.actionId.replaceAll(".", "-");
  const proposalId = `proposal.${slug}`;
  const operationId = `operation.${slug}`;
  const proposeArgv = [
    "action",
    "propose",
    "--proposal-id",
    proposalId,
    "--operation-id",
    operationId,
    "--action-id",
    command.actionId,
    "--resource-id",
    command.resourceId,
  ];
  for (const input of command.inputs) {
    proposeArgv.push("--input", `${input.inputId}=${input.value.textValue}`);
  }
  const proposed = await runZoenArgv({ argv: proposeArgv, env });
  if (proposed.exitCode !== 0) {
    throw new Error(proposed.stderr.trim() || proposed.stdout.trim() || "zoen action propose failed");
  }
  const doc = JSON.parse(proposed.stdout) as {
    previewHash?: string | null;
    proposal?: { previewHash?: string };
  };
  const previewHash = doc.previewHash ?? doc.proposal?.previewHash;
  if (previewHash === undefined || previewHash === null || previewHash.length === 0) {
    throw new Error("propose missing preview_hash");
  }
  const committed = await runZoenArgv({
    argv: [
      "action",
      "commit",
      "--proposal-id",
      proposalId,
      "--operation-id",
      operationId,
      "--preview-hash",
      previewHash,
    ],
    env,
  });
  if (committed.exitCode !== 0) {
    throw new Error(committed.stderr.trim() || committed.stdout.trim() || "zoen action commit failed");
  }
  return JSON.parse(committed.stdout) as unknown;
}
