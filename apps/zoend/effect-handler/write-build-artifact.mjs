import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const artifactFilename = "effect-handler-artifact.json";
const revisionPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const [, , revision, outputDirectory] = process.argv;

if (
  revision === undefined ||
  !revisionPattern.test(revision) ||
  outputDirectory === undefined ||
  outputDirectory.trim().length === 0
) {
  process.stderr.write(
    "usage: write-build-artifact.mjs <immutable-revision> <compiled-handler-directory>\n"
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
