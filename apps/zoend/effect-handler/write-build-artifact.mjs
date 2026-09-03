import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const artifactFilename = "effect-handler-artifact.json";
const outputDirectory = fileURLToPath(
  new URL("../../../dist/apps/zoend/effect-handler/", import.meta.url)
);
const revisionPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const [, , revision] = process.argv;

if (
  process.argv.length !== 3 ||
  revision === undefined ||
  !revisionPattern.test(revision)
) {
  process.stderr.write(
    "usage: write-build-artifact.mjs <immutable-revision>\n"
  );
  process.exitCode = 2;
} else {
  await mkdir(outputDirectory, { recursive: true });
  const destination = path.join(outputDirectory, artifactFilename);
  const temporary = `${destination}.${process.pid}.tmp`;
  const document = `${JSON.stringify({ revision, schemaVersion: 1 })}\n`;
  await writeFile(temporary, document, { flag: "wx", mode: 0o444 });
  await rename(temporary, destination);
  await chmod(destination, 0o444);
}
