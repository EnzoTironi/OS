import {
  execFileSync,
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  repositoryRoot,
  waitFor,
  type ManagedProcess,
} from "./effect-support.js";

const eveNodeMajor = 24;

export async function startEve(input: {
  readonly authBaseUrl: string;
  readonly eveOrigin: string;
  readonly zoendBaseUrl: string;
}): Promise<ManagedProcess> {
  const conversationRoot = path.join(repositoryRoot, "apps", "conversation");
  const eveBin = path.join(
    conversationRoot,
    "node_modules",
    "eve",
    "bin",
    "eve.js",
  );
  const npmBin = path.join(path.dirname(process.execPath), "npm");
  if (!existsSync(eveBin)) {
    execFileSync(
      npmBin,
      ["ci", "--ignore-scripts", "--prefix", conversationRoot],
      {
        cwd: repositoryRoot,
        stdio: "inherit",
      },
    );
  }
  const eveNode = eveNodeExecutable();
  const evePath = `${path.dirname(eveNode)}${path.delimiter}${process.env.PATH ?? ""}`;
  const buildEnv = { ...process.env };
  for (const name of [
    "KAPSO_API_KEY",
    "KAPSO_PHONE_NUMBER_ID",
    "KAPSO_WEBHOOK_SECRET",
    "KAPSO_BASE_URL",
    "WHATSAPP_ACCESS_TOKEN",
  ]) {
    delete buildEnv[name];
  }
  execFileSync(eveNode, [eveBin, "build"], {
    cwd: conversationRoot,
    env: {
      ...buildEnv,
      PATH: evePath,
      ZOEN_MODEL: process.env.ZOEN_MODEL ?? "openai-compatible/hy3-free",
    },
    stdio: "inherit",
  });

  const output: string[] = [];
  const stderr: string[] = [];
  const evePort = new URL(input.eveOrigin).port;
  const child: ChildProcessWithoutNullStreams = spawn(
    eveNode,
    [eveBin, "start", "--host", "127.0.0.1", "--port", evePort],
    {
      cwd: conversationRoot,
      env: {
        ...process.env,
        PATH: evePath,
        ZOEN_AUTH_BASE_URL: input.authBaseUrl,
        ZOEN_MODEL: process.env.ZOEN_MODEL ?? "openai-compatible/hy3-free",
        ZOEN_ZOEND: input.zoendBaseUrl,
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  child.stdin.end();
  child.stdout.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    output.push(text);
    stderr.push(text);
  });
  const managed: ManagedProcess = {
    child,
    name: "eve",
    output,
    stderr,
  };
  try {
    await waitFor(
      async () => {
        if (child.exitCode !== null) {
          throw new Error(`eve exited during startup:\n${output.join("")}`);
        }
        try {
          const response = await fetch(`${input.eveOrigin}/eve/v1/health`);
          return response.ok ? true : undefined;
        } catch {
          return undefined;
        }
      },
      "Eve /eve/v1/health",
      2400,
    );
  } catch (error) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
    }
    throw error;
  }
  return managed;
}

function eveNodeExecutable(): string {
  const candidates = [
    process.env.ZOEN_EVE_NODE,
    process.execPath,
    "/usr/local/node24/bin/node",
  ].filter((value): value is string => value !== undefined && value !== "");
  for (const candidate of candidates) {
    if (nodeMajor(candidate) >= eveNodeMajor) {
      return candidate;
    }
  }
  throw new Error(
    `Eve requires Node.js >= ${eveNodeMajor} (runner is ${process.version}). Set ZOEN_EVE_NODE to a Node ${eveNodeMajor}+ binary.`,
  );
}

function nodeMajor(executable: string): number {
  if (executable === process.execPath) {
    return Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  }
  if (!existsSync(executable)) {
    return 0;
  }
  try {
    const version = execFileSync(executable, ["-p", "process.versions.node"], {
      encoding: "utf8",
    }).trim();
    return Number.parseInt(version.split(".")[0] ?? "0", 10);
  } catch {
    return 0;
  }
}
