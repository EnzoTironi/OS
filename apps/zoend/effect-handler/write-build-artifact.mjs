import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const artifactFilename = "effect-handler-artifact.json";
const revisionPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const [, , revision, outputDirectory] = process.argv;

function resolveArtifactPaths(outputDir) {
  const resolvedRoot = path.resolve(outputDir);
  if (!path.isAbsolute(resolvedRoot)) {
    return;
  }
  const destination = path.join(resolvedRoot, artifactFilename);
  const destinationRelative = path.relative(resolvedRoot, destination);
  if (
    destinationRelative === "" ||
    destinationRelative.startsWith("..") ||
    path.isAbsolute(destinationRelative)
  ) {
    return;
  }
  const temporary = `${destination}.${process.pid}.tmp`;
  const temporaryRelative = path.relative(resolvedRoot, temporary);
  if (
    temporaryRelative === "" ||
    temporaryRelative.startsWith("..") ||
    path.isAbsolute(temporaryRelative)
  ) {
    return;
  }
  return { destination, resolvedRoot, temporary };
}

const artifactPaths =
  revision !== undefined &&
  outputDirectory !== undefined &&
  revisionPattern.test(revision) &&
  path.isAbsolute(outputDirectory)
    ? resolveArtifactPaths(outputDirectory)
    : undefined;

if (
  process.argv.length !== 4 ||
  revision === undefined ||
  artifactPaths === undefined
) {
  process.stderr.write(
    "usage: write-build-artifact.mjs <immutable-revision> <compiled-handler-directory>\n"
  );
  process.exitCode = 2;
} else {
  const { destination, resolvedRoot, temporary } = artifactPaths;
  await mkdir(resolvedRoot, { recursive: true });
  const document = `${JSON.stringify({ revision, schemaVersion: 1 })}\n`;
  await writeFile(temporary, document, { flag: "wx", mode: 0o444 });
  await rename(temporary, destination);
  await chmod(destination, 0o444);
}
