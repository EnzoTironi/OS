import { dispatchZoen, parseEnv } from "./runtime.ts";

const argv = process.argv.slice(2);
if (argv.length === 0 || argv[0] === "help" || argv[0] === "--help") {
  const result = await dispatchZoen({
    argv,
    env: {
      zoend: "",
      bearer: "",
      tenant: "",
      sourceHome: "",
      definitionId: "",
      definitionDigest: "",
      validAt: "",
      principalId: "",
      actorId: "",
      workloadId: "",
      isolate: false,
    },
  });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exit(result.exitCode);
}

let env;
try {
  env = parseEnv(process.env);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(2);
}

const result = await dispatchZoen({ argv, env });
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exit(result.exitCode);
