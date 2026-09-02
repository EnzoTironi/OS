import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { AgentOs } from "@rivet-dev/agentos-core";
import type {
  SandboxBackend,
  SandboxBackendCreateInput,
  SandboxBackendHandle,
  SandboxBackendPrewarmInput,
  SandboxBackendSessionState,
  SandboxCommandResult,
  SandboxNetworkPolicy,
  SandboxSession,
  SandboxSpawnOptions,
} from "eve/sandbox";
import { SandboxTemplateNotProvisionedError } from "eve/sandbox";

import {
  getHostCredential,
  type HostCredential,
  hostCredentialFromRaw,
  putHostCredential,
} from "./credentials";
import {
  ensureMembershipDisk,
  guestToHost,
  type MembershipDisk,
  MembershipId,
  type MembershipId as MembershipIdBrand,
  membershipDisk,
  resolveWorkspacePath,
  unboundMembership,
} from "./membership";
import {
  isolatePlantScript,
  isZoenArgv,
  runIsolateZoen,
  splitCommand,
  zoenBinPath,
} from "./run-zoen";

export const WORKBENCH_BACKEND_NAME = "zoen-membership-workbench";

const GUEST_NETWORK_DENY = "network default deny";
const TRAILING_SLASHES = /\/+$/u;

interface LiveVm {
  refs: number;
  vm: AgentOs;
}

const liveVms = new Map<string, LiveVm>();

export interface WorkbenchSessionOptions {
  readonly definitionDigest?: string;
  readonly definitionId?: string;
  readonly doorToken?: string;
  readonly membershipId: string;
  readonly tenantId?: string;
  readonly validAt?: string;
}

export interface BoundSandbox {
  readonly disk: MembershipDisk;
  dispose: () => Promise<void>;
  readonly membershipId: MembershipIdBrand;
  readTextFile: (path: string) => Promise<string | null>;
  run: (command: string) => Promise<SandboxCommandResult>;
  readonly workspace: string;
  writeTextFile: (path: string, content: string) => Promise<void>;
}

export interface OpenBoundSandboxInput {
  readonly definitionDigest: string;
  readonly definitionId: string;
  readonly disksRoot: string;
  readonly doorToken: string;
  readonly membershipId: string;
  readonly tenantId: string;
  readonly validAt: string;
  readonly zoendBaseUrl: string;
}

const AGENTOS_PERMISSIONS = {
  binding: "allow" as const,
  childProcess: "allow" as const,
  env: "allow" as const,
  fs: "allow" as const,
  network: "deny" as const,
  process: "allow" as const,
};

export async function openBoundSandbox(
  input: OpenBoundSandboxInput
): Promise<BoundSandbox> {
  const credential = hostCredentialFromRaw(input);
  putHostCredential(credential);
  const disk = membershipDisk(input.disksRoot, credential.membershipId);
  await ensureMembershipDisk(disk);
  await plantZoenMarker(disk);
  const vm = await retainVm(disk);
  return createBoundSandbox({
    credential,
    disk,
    vm,
    zoendBaseUrl: input.zoendBaseUrl,
  });
}

async function retainVm(disk: MembershipDisk): Promise<AgentOs> {
  const existing = liveVms.get(disk.membershipId);
  if (existing !== undefined) {
    existing.refs += 1;
    return existing.vm;
  }
  const vm = await AgentOs.create({
    defaultSoftware: true,
    mounts: [
      {
        path: "/workspace",
        plugin: { config: { hostPath: disk.workspace }, id: "host_dir" },
        readOnly: false,
      },
    ],
    permissions: AGENTOS_PERMISSIONS,
  });
  liveVms.set(disk.membershipId, { refs: 1, vm });
  return vm;
}

async function releaseVm(membershipId: MembershipIdBrand): Promise<void> {
  const existing = liveVms.get(membershipId);
  if (existing === undefined) {
    return;
  }
  existing.refs -= 1;
  if (existing.refs > 0) {
    return;
  }
  liveVms.delete(membershipId);
  await existing.vm.dispose();
}

function createBoundSandbox(input: {
  readonly disk: MembershipDisk;
  readonly vm: AgentOs;
  readonly zoendBaseUrl: string;
  readonly credential: HostCredential | undefined;
}): BoundSandbox {
  return {
    disk: input.disk,
    async dispose(): Promise<void> {
      await releaseVm(input.disk.membershipId);
    },
    membershipId: input.disk.membershipId,
    async readTextFile(path: string): Promise<string | null> {
      try {
        return await readFile(guestToHost(input.disk, path), "utf8");
      } catch (error) {
        if (isNotFound(error)) {
          return null;
        }
        throw error;
      }
    },
    run(command: string): Promise<SandboxCommandResult> {
      return runOnWorkbench({
        command,
        credential:
          input.credential ?? getHostCredential(input.disk.membershipId),
        disk: input.disk,
        vm: input.vm,
        zoendBaseUrl: input.zoendBaseUrl,
      });
    },
    workspace: input.disk.workspace,
    async writeTextFile(path: string, content: string): Promise<void> {
      const host = guestToHost(input.disk, path);
      await mkdir(dirname(host), { recursive: true });
      await writeFile(host, content);
    },
  };
}

async function runOnWorkbench(input: {
  readonly command: string;
  readonly disk: MembershipDisk;
  readonly vm: AgentOs;
  readonly zoendBaseUrl: string;
  readonly credential: HostCredential | undefined;
}): Promise<SandboxCommandResult> {
  const argv = splitCommand(input.command);
  if (isZoenArgv(argv)) {
    return runIsolateZoen({
      argv,
      credential: input.credential,
      workspace: input.disk.workspace,
      zoendBaseUrl: input.zoendBaseUrl,
    });
  }
  const result = await input.vm.process.exec(input.command, {
    cwd: "/workspace",
    output: { capture: "all" },
  });
  const exitCode = typeof result.exitCode === "number" ? result.exitCode : 1;
  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  const stderr = typeof result.stderr === "string" ? result.stderr : "";
  if (
    looksLikeNetworkProbe(argv) &&
    exitCode === 0 &&
    stdout.length === 0 &&
    stderr.length === 0
  ) {
    return { exitCode: 1, stderr: `${GUEST_NETWORK_DENY}\n`, stdout };
  }
  return { exitCode, stderr, stdout };
}

function looksLikeNetworkProbe(argv: readonly string[]): boolean {
  const joined = argv.join(" ");
  return (
    joined.includes("fetch(") ||
    argv[0] === "curl" ||
    argv[0] === "wget" ||
    argv[0] === "nc"
  );
}

export function workbenchBackend(options: {
  readonly disksRoot?: string;
}): SandboxBackend<Record<string, never>, WorkbenchSessionOptions> {
  const zoendBaseUrl = requiredZoendUrl();

  return {
    async create(
      input: SandboxBackendCreateInput
    ): Promise<SandboxBackendHandle<WorkbenchSessionOptions>> {
      const disksRoot = resolveDisksRoot(
        options.disksRoot,
        input.runtimeContext.appRoot
      );
      if (input.templateKey !== null) {
        const templateRoot = templatePath(disksRoot, input.templateKey);
        try {
          await readFile(join(templateRoot, ".seeded"), "utf8");
        } catch (error) {
          if (isNotFound(error)) {
            throwTemplateNotProvisioned(input.templateKey, error);
          }
          throw error;
        }
      }

      let bound: BoundSandbox | undefined;
      let boundMembership = unboundMembership;

      const session = lazySession({
        getBound: () => bound,
        id: input.sessionKey,
      });

      const useSessionFn = async (sessionOptions?: WorkbenchSessionOptions) => {
        const membershipId = MembershipId(
          sessionOptions?.membershipId ??
            (typeof input.existingMetadata?.membershipId === "string"
              ? input.existingMetadata.membershipId
              : unboundMembership)
        );
        if (
          sessionOptions?.doorToken !== undefined &&
          sessionOptions.tenantId !== undefined
        ) {
          putHostCredential(
            hostCredentialFromRaw({
              definitionDigest: sessionOptions.definitionDigest ?? "",
              definitionId: sessionOptions.definitionId ?? "",
              doorToken: sessionOptions.doorToken,
              membershipId,
              tenantId: sessionOptions.tenantId,
              validAt: sessionOptions.validAt ?? "",
            })
          );
        }
        const disk = membershipDisk(disksRoot, membershipId);
        await ensureMembershipDisk(disk);
        if (input.templateKey !== null) {
          await copyTemplateWorkspace(
            templatePath(disksRoot, input.templateKey),
            disk
          );
        }
        await plantZoenMarker(disk);
        const vm = await retainVm(disk);
        if (bound !== undefined && boundMembership !== membershipId) {
          await bound.dispose();
        }
        boundMembership = membershipId;
        bound = createBoundSandbox({
          credential: getHostCredential(membershipId),
          disk,
          vm,
          zoendBaseUrl,
        });
        return session;
      };

      return {
        captureState(): Promise<SandboxBackendSessionState> {
          return Promise.resolve({
            backendName: WORKBENCH_BACKEND_NAME,
            metadata: { membershipId: boundMembership },
            sessionKey: input.sessionKey,
          });
        },
        async delete() {
          if (bound !== undefined) {
            await bound.dispose();
            bound = undefined;
          }
          await rm(membershipDisk(disksRoot, boundMembership).root, {
            force: true,
            recursive: true,
          });
        },
        session,
        async shutdown() {
          if (bound !== undefined) {
            await bound.dispose();
            bound = undefined;
          }
        },
        async stop() {
          if (bound !== undefined) {
            await bound.dispose();
            bound = undefined;
          }
        },
        useSessionFn,
      };
    },
    name: WORKBENCH_BACKEND_NAME,
    async prewarm(
      input: SandboxBackendPrewarmInput
    ): Promise<{ reused: boolean }> {
      const disksRoot = resolveDisksRoot(
        options.disksRoot,
        input.runtimeContext.appRoot
      );
      const templateRoot = templatePath(disksRoot, input.templateKey);
      try {
        await readFile(join(templateRoot, ".seeded"), "utf8");
        return { reused: true };
      } catch (error) {
        if (!isNotFound(error)) {
          throw error;
        }
      }
      await mkdir(join(templateRoot, "workspace"), { recursive: true });
      await writeTemplateSeeds(templateRoot, input.seedFiles);
      await writeFile(join(templateRoot, ".seeded"), "1\n");
      return { reused: false };
    },
  };
}

function requiredZoendUrl(): string {
  const zoend = process.env.ZOEN_ZOEND?.trim().replace(TRAILING_SLASHES, "");
  if (zoend === undefined || zoend.length === 0) {
    throw new Error("ZOEN_ZOEND is required");
  }
  return zoend;
}

function lazySession(input: {
  readonly id: string;
  readonly getBound: () => BoundSandbox | undefined;
}): SandboxSession {
  const requireBound = (): BoundSandbox => {
    const bound = input.getBound();
    if (bound === undefined) {
      throw new Error("workbench session is not bound to a membership");
    }
    return bound;
  };

  return {
    id: input.id,
    async readBinaryFile(options) {
      const text = await requireBound().readTextFile(options.path);
      return text === null ? null : Buffer.from(text);
    },
    async readFile(options) {
      const text = await requireBound().readTextFile(options.path);
      if (text === null) {
        return null;
      }
      return bytesStream(text);
    },
    readTextFile(options) {
      return requireBound().readTextFile(options.path);
    },
    async removePath(options) {
      const bound = requireBound();
      await rm(guestToHost(bound.disk, options.path), {
        force: options.force === true,
        recursive: options.recursive === true,
      });
    },
    resolvePath: resolveWorkspacePath,
    run(options) {
      const command = commandFromRun(options);
      return requireBound().run(command);
    },
    setNetworkPolicy(policy: SandboxNetworkPolicy) {
      if (policy !== "deny-all") {
        return Promise.reject(new Error("workbench network is deny-all"));
      }
      return Promise.resolve();
    },
    async spawn(options: SandboxSpawnOptions) {
      const command = commandFromRun(options);
      const result = await requireBound().run(command);
      return finishedProcess(result);
    },
    async writeBinaryFile(options) {
      const content = Buffer.from(options.content).toString("utf8");
      await requireBound().writeTextFile(options.path, content);
    },
    async writeFile(options) {
      const chunks: Buffer[] = [];
      for await (const chunk of options.content) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      await requireBound().writeTextFile(
        options.path,
        Buffer.concat(chunks).toString("utf8")
      );
    },
    async writeTextFile(options) {
      await requireBound().writeTextFile(options.path, options.content);
    },
  };
}

function commandFromRun(
  options: { readonly command?: string } | string
): string {
  if (typeof options === "string") {
    return options;
  }
  if (typeof options.command === "string") {
    return options.command;
  }
  throw new Error("sandbox run requires command");
}

function bytesStream(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function finishedProcess(result: SandboxCommandResult) {
  return {
    kill(): Promise<void> {
      return Promise.resolve();
    },
    stderr: bytesStream(result.stderr),
    stdout: bytesStream(result.stdout),
    wait() {
      return Promise.resolve({ exitCode: result.exitCode });
    },
  };
}

function throwTemplateNotProvisioned(
  templateKey: string,
  cause: unknown
): never {
  throw Object.assign(
    new SandboxTemplateNotProvisionedError({
      backendName: WORKBENCH_BACKEND_NAME,
      templateKey,
    }),
    { cause }
  );
}

async function writeTemplateSeeds(
  templateRoot: string,
  seedFiles: SandboxBackendPrewarmInput["seedFiles"]
): Promise<void> {
  await Promise.all(
    seedFiles.map(async (seed) => {
      const host = join(templateRoot, "workspace", seed.path);
      await mkdir(dirname(host), { recursive: true });
      const content =
        typeof seed.content === "string"
          ? seed.content
          : Buffer.from(seed.content);
      await writeFile(host, content);
    })
  );
}

function resolveDisksRoot(
  explicit: string | undefined,
  appRoot: string
): string {
  return (
    explicit ??
    process.env.ZOEN_MEMBERSHIP_DISK_ROOT?.trim() ??
    join(appRoot, ".eve", "workbench-disks")
  );
}

function templatePath(disksRoot: string, templateKey: string): string {
  return join(disksRoot, ".templates", encodeURIComponent(templateKey));
}

async function copyTemplateWorkspace(
  templateRoot: string,
  disk: MembershipDisk
): Promise<void> {
  const source = join(templateRoot, "workspace");
  await mkdir(disk.workspace, { recursive: true });
  await cp(source, disk.workspace, { recursive: true });
}

async function plantZoenMarker(disk: MembershipDisk): Promise<void> {
  const planted = join(disk.workspace, "bin", "zoen");
  await mkdir(dirname(planted), { recursive: true });
  await writeFile(planted, isolatePlantScript(zoenBinPath()), { mode: 0o755 });
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

export function parseSessionMembership(
  raw: string | undefined
): MembershipIdBrand {
  if (raw === undefined || raw.trim().length === 0) {
    return unboundMembership;
  }
  return MembershipId(raw);
}
