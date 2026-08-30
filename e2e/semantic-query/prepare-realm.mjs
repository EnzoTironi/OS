import { mkdir } from "node:fs/promises";
import path from "node:path";

const outputDirectory =
  process.env.ZOEN_E2E_GENERATED_DIR ??
  path.join("e2e", "semantic-query", ".generated");
await mkdir(outputDirectory, { recursive: true });
