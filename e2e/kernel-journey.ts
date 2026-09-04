import path from "node:path";
import { e2eGeneratedDirectory, e2ePostgresUrl } from "./host-env.js";

export const worldDefinitionDigest = "a".repeat(64);
export const worldActionId = "zoen.world.discover";
export const sevenVerbs = [
  "Discover",
  "Query",
  "Propose",
  "Decide",
  "Commit",
  "Explain",
  "Execute",
] as const;
export const kernelSurfaces = ["cli", "connect", "mcp", "eve"] as const;

export function kernelJourneyPaths(scenario: string, postgresPortFallback: number) {
  const repositoryRoot = process.cwd();
  const databaseUrl = e2ePostgresUrl("postgres", "postgres", postgresPortFallback);
  const generatedDirectory = e2eGeneratedDirectory(repositoryRoot, scenario);
  const targetDir = process.env.CARGO_TARGET_DIR ?? path.join(repositoryRoot, "target");
  const zoenPath = path.join(targetDir, "debug", "zoen");
  return { repositoryRoot, databaseUrl, generatedDirectory, zoenPath };
}
