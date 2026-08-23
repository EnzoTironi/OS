import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, "..", "..", "dist", "e2e", "activation-sample", "cli.js");
const { main } = await import(pathToFileURL(cli).href);
const code = await main(process.argv.slice(2));
process.exit(code);
