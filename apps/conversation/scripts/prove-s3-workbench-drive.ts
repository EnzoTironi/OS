import { openBoundSandbox } from "../agent/sandbox/workbench.ts";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`missing ${name}`);
  }
  return value;
}

function printSection(
  heading: string,
  command: string,
  result: {
    exitCode?: number;
    stdout?: string;
    stderr?: string;
    extra?: string;
  }
) {
  process.stdout.write(`## ${heading}\n\n`);
  process.stdout.write(`command: ${command}\n`);
  if (result.exitCode !== undefined) {
    process.stdout.write(`exit: ${result.exitCode}\n`);
  }
  if (result.stdout !== undefined && result.stdout.length > 0) {
    process.stdout.write(`stdout:\n${result.stdout}\n`);
  }
  if (result.stderr !== undefined && result.stderr.length > 0) {
    process.stdout.write(`stderr:\n${result.stderr}\n`);
  }
  if (result.extra !== undefined) {
    process.stdout.write(`${result.extra}\n`);
  }
  process.stdout.write("\n");
}

const disksRoot = required("S3_DISKS_ROOT");
const zoendBaseUrl = required("S3_ZOEND");
const definitionId = process.env.S3_DEFINITION_ID?.trim() || "world.s2read";
const definitionDigest = required("S3_DEFINITION_DIGEST");
const validAt = required("S3_VALID_AT");
const tenantId = required("S3_TENANT");
const membershipA = required("S3_MEMBERSHIP_A");
const membershipB = required("S3_MEMBERSHIP_B");

const sandboxA = await openBoundSandbox({
  definitionDigest,
  definitionId,
  disksRoot,
  doorToken: required("S3_TOKEN_A"),
  membershipId: membershipA,
  tenantId,
  validAt,
  zoendBaseUrl,
});

const sandboxB = await openBoundSandbox({
  definitionDigest,
  definitionId,
  disksRoot,
  doorToken: required("S3_TOKEN_B"),
  membershipId: membershipB,
  tenantId,
  validAt,
  zoendBaseUrl,
});

try {
  if (sandboxA.membershipId !== membershipA) {
    throw new Error("workbench A opened under the wrong Membership");
  }
  if (sandboxB.membershipId !== membershipB) {
    throw new Error("workbench B opened under the wrong Membership");
  }
  printSection("0. exact Membership workbenches", "openBoundSandbox", {
    extra: `membership A: ${membershipA}\nmembership B: ${membershipB}`,
  });
  await sandboxA.writeTextFile("secret-a.txt", "membership-a-only\n");
  const planted = await sandboxA.run("ls /workspace/bin/zoen");
  printSection(
    "1. planted zoen on membership A",
    "ls /workspace/bin/zoen",
    planted
  );
  const help = await sandboxA.run("zoen help");
  printSection("1b. zoen help", "zoen help", help);
  const query = await sandboxA.run("zoen world query --type world.Note");
  printSection(
    "1c. zoen world query",
    "zoen world query --type world.Note",
    query
  );
  if (query.exitCode !== 0) {
    throw new Error("world query failed");
  }

  const commitCommand =
    "zoen action commit --proposal-id proposal.stamp-low " +
    "--operation-id operation.stamp-low " +
    "--preview-hash 0000000000000000000000000000000000000000000000000000000000000000";
  const commit = await sandboxA.run(commitCommand);
  printSection("2. isolate commit", commitCommand, commit);
  if (!commit.stderr.includes("isolate cannot commit")) {
    throw new Error("isolate commit did not deny");
  }

  const network = await sandboxA.run(
    'node -e \'fetch("http://example.com").then(r=>console.log("status "+r.status)).catch(e=>console.error(String(e)))\''
  );
  printSection(
    "4. isolate network",
    "node -e fetch(http://example.com)",
    network
  );
  const networkText = `${network.stdout}\n${network.stderr}`;
  if (
    !/fetch failed|network default deny|ECONN|ENOTFOUND|denied/i.test(
      networkText
    )
  ) {
    throw new Error(`network was not denied: ${networkText}`);
  }

  const leak = await sandboxB.run("cat /workspace/secret-a.txt");
  printSection(
    "5. membership B reads membership A file",
    "cat /workspace/secret-a.txt",
    leak
  );
  if (leak.stdout.includes("membership-a-only")) {
    throw new Error("membership B read membership A VFS");
  }
  const own = await sandboxB.run("ls /workspace");
  printSection("5b. membership B workspace", "ls /workspace", own);
} finally {
  await sandboxA.dispose();
  await sandboxB.dispose();
}
