import { readFile } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = process.cwd();
const lakePath = path.join(
  repositoryRoot,
  "testdata",
  "lakes",
  "commercial.canonical.json",
);

const lake = await readFile(lakePath, "utf8");
if (!lake.includes('"id":"commercial.OrderLine"') || !lake.includes("zoen.definition.v1")) {
  process.stderr.write(
    `${JSON.stringify(
      {
        rule: "commercial-lake",
        error:
          "testdata/lakes/commercial.canonical.json is the live lake and must keep commercial.OrderLine",
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    `${JSON.stringify({
      rule: "commercial-lake",
      lake: "testdata/lakes/commercial.canonical.json",
      sourceOfTruth: true,
    })}\n`,
  );
}
