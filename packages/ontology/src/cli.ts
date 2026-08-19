import { compileDefinition } from "./compiler.js";

async function main(): Promise<void> {
  const [command, sourcePath, extra] = process.argv.slice(2);
  if (
    command !== "compile" ||
    sourcePath === undefined ||
    extra !== undefined
  ) {
    throw new Error("usage: zoen-ontology compile <definition.zoen.ts>");
  }

  const compiled = await compileDefinition(sourcePath);
  process.stdout.write(`${JSON.stringify(compiled)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
