import { readFile } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = process.cwd();
const lakePath = path.join(
  repositoryRoot,
  "packages",
  "ontology",
  "fixtures",
  "commercial.zoen.ts",
);

const lake = await readFile(lakePath, "utf8");
if (!lake.includes("defineBundle") || !lake.includes("commercial.OrderLine")) {
  process.stderr.write(
    `${JSON.stringify(
      {
        rule: "commercial-lake",
        error:
          "packages/ontology/fixtures/commercial.zoen.ts is the live lake and must keep defineBundle plus commercial.OrderLine",
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
      lake: "packages/ontology/fixtures/commercial.zoen.ts",
      sourceOfTruth: true,
    })}\n`,
  );
}
