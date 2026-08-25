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
const archivePath = path.join(
  repositoryRoot,
  "archive",
  "domain",
  "commercial",
  "src",
  "commercial.zoen.ts",
);

const lake = await readFile(lakePath, "utf8");
const archived = await readFile(archivePath, "utf8");
const lakeBody = lake.replace(/^\/\*\*[\s\S]*?\*\/\n/, "");

if (lakeBody !== archived) {
  process.stderr.write(
    `${JSON.stringify(
      {
        rule: "commercial-lake",
        error:
          "packages/ontology/fixtures/commercial.zoen.ts body drifted from archive/domain/commercial/src/commercial.zoen.ts",
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
      archive: "archive/domain/commercial/src/commercial.zoen.ts",
      pinned: true,
    })}\n`,
  );
}
