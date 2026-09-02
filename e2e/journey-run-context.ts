import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";

const idSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const absolutePathSchema = z.string().refine(path.isAbsolute, "must be absolute");
const portSchema = z.number().int().min(1).max(65_535);

const portsSchema = z
  .object({
    adapter: portSchema,
    auth: portSchema,
    connector: portSchema,
    effectWorker: portSchema,
    keycloak: portSchema,
    minio: portSchema,
    postgres: portSchema,
    provider: portSchema,
    restateIngress: portSchema,
    restateNode: portSchema,
    restateUi: portSchema,
    worker: portSchema,
    workerControl: portSchema,
    zoend: portSchema,
  })
  .strict();

const noComposeSchema = z
  .object({ kind: z.literal("none") })
  .strict();

const composeSchema = z
  .object({
    baseFile: absolutePathSchema,
    kind: z.literal("compose"),
    overrideFile: absolutePathSchema,
    project: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,62}$/),
  })
  .strict();

export const journeyRunContextSchema = z
  .object({
    attempt: z.number().int().positive(),
    buildIdentity: z.string().regex(/^[0-9a-f]{64}$/),
    compose: z.discriminatedUnion("kind", [noComposeSchema, composeSchema]),
    contextVersion: z.literal(1),
    createdAt: z.string().datetime(),
    httpNames: z
      .object({ auth: z.string().min(1), zoend: z.string().min(1) })
      .strict(),
    lease: z
      .object({
        directory: absolutePathSchema,
        ownerToken: z.string().regex(/^[0-9a-f]{64}$/),
        slot: z.number().int().nonnegative(),
      })
      .strict(),
    owner: z
      .object({ pid: z.number().int().positive(), startedAt: z.string().min(1) })
      .strict(),
    paths: z
      .object({
        artifacts: absolutePathSchema,
        generated: absolutePathSchema,
        logs: absolutePathSchema,
        process: absolutePathSchema,
        repository: absolutePathSchema,
        runRoot: absolutePathSchema,
      })
      .strict(),
    ports: portsSchema,
    runId: idSchema,
    scenario: idSchema,
    sourceSha: z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/),
    suiteId: idSchema,
  })
  .strict();

export const journeyContextPointerSchema = z
  .object({
    attempt: z.number().int().positive(),
    contextFile: absolutePathSchema,
    runId: idSchema,
    scenario: idSchema,
    suiteId: idSchema,
    version: z.literal(1),
  })
  .strict();

export type JourneyRunContext = z.infer<typeof journeyRunContextSchema>;
export type JourneyContextPointer = z.infer<typeof journeyContextPointerSchema>;
export type JourneyPortName = keyof JourneyRunContext["ports"];

let cachedContext: JourneyRunContext | undefined;

export function journeyRunContext(): JourneyRunContext {
  if (cachedContext !== undefined) {
    return cachedContext;
  }
  const contextPath = process.env.ZOEN_E2E_CONTEXT_FILE;
  if (contextPath === undefined || contextPath === "") {
    throw new Error(
      "ZOEN_E2E_CONTEXT_FILE is required; start journeys through e2e/run.sh",
    );
  }
  const parsed: unknown = JSON.parse(readFileSync(contextPath, "utf8"));
  cachedContext = journeyRunContextSchema.parse(parsed);
  return cachedContext;
}

export function optionalJourneyRunContext(): JourneyRunContext | undefined {
  const contextPath = process.env.ZOEN_E2E_CONTEXT_FILE;
  if (contextPath === undefined || contextPath === "") {
    return undefined;
  }
  return journeyRunContext();
}

export function journeyPort(name: JourneyPortName): number {
  return journeyRunContext().ports[name];
}

export function journeyComposeProject(): string {
  const { compose } = journeyRunContext();
  if (compose.kind !== "compose") {
    throw new Error("host-only journey has no Compose project");
  }
  return compose.project;
}

export function journeyComposeFiles(): readonly [string, string] {
  const { compose } = journeyRunContext();
  if (compose.kind !== "compose") {
    throw new Error("host-only journey has no Compose files");
  }
  return [compose.baseFile, compose.overrideFile];
}

export function composeArguments(arguments_: readonly string[]): string[] {
  const [baseFile, overrideFile] = journeyComposeFiles();
  return [
    "compose",
    "--project-name",
    journeyComposeProject(),
    "--file",
    baseFile,
    "--file",
    overrideFile,
    ...arguments_,
  ];
}

/**
 * Optional proof-only barrier. Production journeys do not set the directory.
 * The marker is emitted only after Compose is already healthy and Better Auth
 * is accepting requests, so the isolation proof can terminate one owned run.
 */
export async function reachJourneyBarrier(stage: string): Promise<void> {
  const barrierRoot = process.env.ZOEN_E2E_BARRIER_DIR;
  if (barrierRoot === undefined || barrierRoot === "") {
    return;
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(stage)) {
    throw new Error(`invalid journey barrier stage ${JSON.stringify(stage)}`);
  }
  const context = journeyRunContext();
  await mkdir(barrierRoot, { recursive: true });
  const marker = path.join(barrierRoot, `${context.runId}.${stage}.ready.json`);
  await writeJsonAtomically(marker, {
    contextFile: process.env.ZOEN_E2E_CONTEXT_FILE,
    ownerToken: context.lease.ownerToken,
    runId: context.runId,
    stage,
  });
  const release = path.join(barrierRoot, `${context.runId}.${stage}.release`);
  for (let attempt = 0; attempt < 6_000; attempt += 1) {
    try {
      await readFile(release);
      return;
    } catch (error) {
      if (!isMissingFile(error)) {
        throw error;
      }
    }
    await delay(100);
  }
  throw new Error(`journey barrier ${stage} timed out for ${context.runId}`);
}

export async function writeJsonAtomically(
  outputPath: string,
  value: unknown,
): Promise<void> {
  const serialized = JSON.stringify(value, null, 2);
  if (serialized === undefined) {
    throw new Error(`${outputPath} could not be serialized`);
  }
  await mkdir(path.dirname(outputPath), { recursive: true });
  const temporary = `${outputPath}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(`${serialized}\n`);
  } finally {
    await handle.close();
  }
  await rename(temporary, outputPath);
}

function isMissingFile(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    Reflect.get(error, "code") === "ENOENT"
  );
}
