import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { compileDefinition } from "@zoen/ontology";
import { generateOsdkModules } from "./generator.js";

async function main(): Promise<void> {
  const [command, sourcePath, outDir] = process.argv.slice(2);
  if (
    command !== "generate" ||
    sourcePath === undefined ||
    outDir === undefined
  ) {
    throw new Error("usage: zoen-osdk generate <definition.zoen.ts> <outdir>");
  }
  const compiled = await compileDefinition(sourcePath);
  const modules = generateOsdkModules(compiled);
  const absoluteOut = path.resolve(outDir);
  await mkdir(absoluteOut, { recursive: true });
  await writeFile(
    path.join(absoluteOut, "objects.ts"),
    modules.files["objects.ts"],
  );
  await writeFile(
    path.join(absoluteOut, "actions.ts"),
    modules.files["actions.ts"],
  );
  await writeFile(path.join(absoluteOut, "index.ts"), modules.files["index.ts"]);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
