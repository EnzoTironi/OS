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
  hostCredentialFromRaw,
  putHostCredential,
  type HostCredential,
} from "./credentials";
import {
  MembershipId,
  ensureMembershipDisk,
  guestToHost,
  membershipDisk,
  resolveWorkspacePath,
  unboundMembership,
  type MembershipDisk,
  type MembershipId as MembershipIdBrand,
} from "./membership";
import {
  isZoenArgv,
  runPlantedZoen,
  splitCommand,
} from "./planted-zoen";

export const WORKBENCH_BACKEND_NAME = "zoen-membership-workbench";

const GUEST_NETWORK_DENY = "network default deny";

type LiveVm = {
  vm: AgentOs;
  refs: number;
};

const liveVms = new Map<string, LiveVm>();

export type WorkbenchSessionOptions = {
  readonly membershipId: string;
  readonly tenantId?: string;
  readonly doorToken?: string;
  readonly definitionId?: string;
  readonly definitionDigest?: string;
  readonly validAt?: string;
};

export type BoundSandbox = {
  readonly membershipId: MembershipIdBrand;
  readonly disk: MembershipDisk;
  readonly workspace: string;
  run(command: string): Promise<SandboxCommandResult>;
  writeTextFile(path: string, content: string): Promise<void>;
  readTextFile(path: string): Promise<string | null>;
  dispose(): Promise<void>;
};

export type OpenBoundSandboxInput = {
  readonly membershipId: string;
  readonly tenantId: string;
  readonly doorToken: string;
  readonly zoendBaseUrl: string;
  readonly definitionId: string;
  readonly definitionDigest: string;
  readonly validAt: string;
  readonly disksRoot: string;
};

const AGENTOS_PERMISSIONS = {
  fs: "allow" as const,
  network: "deny" as const,
  childProcess: "allow" as const,
  process: "allow" as const,
  env: "allow" as const,
  binding: "allow" as const,
};

export async function openBoundSandbox(input: OpenBoundSandboxInput): Promise<BoundSandbox> {
  const credential = hostCredentialFromRaw(input);
  putHostCredential(credential);
  const disk = membershipDisk(input.disksRoot, credential.membershipId);
  await ensureMembershipDisk(disk);
  await plantZoenMarker(disk);
  const vm = await retainVm(disk);
  return createBoundSandbox({
    disk,
    vm,
    zoendBaseUrl: input.zoendBaseUrl,
    credential,
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
    permissions: AGENTOS_PERMISSIONS,
    mounts: [
      {
        path: "/workspace",
        plugin: { id: "host_dir", config: { hostPath: disk.workspace } },
        readOnly: false,
      },
    ],
  });
  liveVms.set(disk.membershipId, { vm, refs: 1 });
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
    membershipId: input.disk.membershipId,
    disk: input.disk,
    workspace: input.disk.workspace,
    async run(command: string): Promise<SandboxCommandResult> {
      return runOnWorkbench({
        command,
        disk: input.disk,
        vm: input.vm,
        zoendBaseUrl: input.zoendBaseUrl,
        credential: input.credential ?? getHostCredential(input.disk.membershipId),
      });
    },
    async writeTextFile(path: string, content: string): Promise<void> {
      const host = guestToHost(input.disk, path);
      await mkdir(dirname(host), { recursive: true });
      await writeFile(host, content);
    },
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
    async dispose(): Promise<void> {
      await releaseVm(input.disk.membershipId);
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
    return runPlantedZoen({
      argv,
      credential: input.credential,
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
  if (looksLikeNetworkProbe(argv) && exitCode === 0 && stdout.length === 0 && stderr.length === 0) {
    return { exitCode: 1, stdout, stderr: `${GUEST_NETWORK_DENY}\n` };
  }
  return { exitCode, stdout, stderr };
}

function looksLikeNetworkProbe(argv: readonly string[]): boolean {
  const joined = argv.join(" ");
  return joined.includes("fetch(") || argv[0] === "curl" || argv[0] === "wget" || argv[0] === "nc";
}

export function workbenchBackend(options: {
  readonly disksRoot?: string;
  readonly zoendBaseUrl?: string;
}): SandboxBackend<Record<string, never>, WorkbenchSessionOptions> {
  const zoendBaseUrl =
    options.zoendBaseUrl ??
    process.env.ZOEN_ZOEND_BASE_URL?.trim() ??
    "http://127.0.0.1:58705";

  return {
    name: WORKBENCH_BACKEND_NAME,
    async prewarm(input: SandboxBackendPrewarmInput): Promise<{ reused: boolean }> {
      const disksRoot = resolveDisksRoot(options.disksRoot, input.runtimeContext.appRoot);
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
      for (const seed of input.seedFiles) {
        const host = join(templateRoot, "workspace", seed.path);
        await mkdir(dirname(host), { recursive: true });
        const content = typeof seed.content === "string" ? seed.content : Buffer.from(seed.content);
        await writeFile(host, content);
      }
      await writeFile(join(templateRoot, ".seeded"), "1\n");
      return { reused: false };
    },
    async create(
      input: SandboxBackendCreateInput,
    ): Promise<SandboxBackendHandle<WorkbenchSessionOptions>> {
      const disksRoot = resolveDisksRoot(options.disksRoot, input.runtimeContext.appRoot);
      if (input.templateKey !== null) {
        const templateRoot = templatePath(disksRoot, input.templateKey);
        try {
          await readFile(join(templateRoot, ".seeded"), "utf8");
        } catch (error) {
          if (isNotFound(error)) {
            throw new SandboxTemplateNotProvisionedError({
              backendName: WORKBENCH_BACKEND_NAME,
              templateKey: input.templateKey,
            });
          }
          throw error;
        }
      }

      let bound: BoundSandbox | undefined;
      let boundMembership = unboundMembership;

      const session = lazySession({
        id: input.sessionKey,
        getBound: () => bound,
      });

      const useSessionFn = async (sessionOptions?: WorkbenchSessionOptions) => {
        const membershipId = MembershipId(
          sessionOptions?.membershipId ??
            (typeof input.existingMetadata?.membershipId === "string"
              ? input.existingMetadata.membershipId
              : unboundMembership),
        );
        if (sessionOptions?.doorToken !== undefined && sessionOptions.tenantId !== undefined) {
          putHostCredential(
            hostCredentialFromRaw({
              membershipId,
              tenantId: sessionOptions.tenantId,
              doorToken: sessionOptions.doorToken,
              definitionId: sessionOptions.definitionId ?? "",
              definitionDigest: sessionOptions.definitionDigest ?? "",
              validAt: sessionOptions.validAt ?? "",
            }),
          );
        }
        const disk = membershipDisk(disksRoot, membershipId);
        await ensureMembershipDisk(disk);
        if (input.templateKey !== null) {
          await copyTemplateWorkspace(templatePath(disksRoot, input.templateKey), disk);
        }
        const vm = await retainVm(disk);
        if (bound !== undefined && boundMembership !== membershipId) {
          await bound.dispose();
        }
        boundMembership = membershipId;
        bound = createBoundSandbox({
          disk,
          vm,
          zoendBaseUrl,
          credential: getHostCredential(membershipId),
        });
        return session;
      };

      return {
        session,
        useSessionFn,
        async captureState(): Promise<SandboxBackendSessionState> {
          return {
            backendName: WORKBENCH_BACKEND_NAME,
            sessionKey: input.sessionKey,
            metadata: { membershipId: boundMembership },
          };
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
        async stop() {
          if (bound !== undefined) {
            await bound.dispose();
            bound = undefined;
          }
        },
        async shutdown() {
          if (bound !== undefined) {
            await bound.dispose();
            bound = undefined;
          }
        },
      };
    },
  };
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
    resolvePath: resolveWorkspacePath,
    async run(options) {
      const command = commandFromRun(options);
      return requireBound().run(command);
    },
    async spawn(options: SandboxSpawnOptions) {
      const command = commandFromRun(options);
      const result = await requireBound().run(command);
      return finishedProcess(result);
    },
    async readTextFile(options) {
      return requireBound().readTextFile(options.path);
    },
    async writeTextFile(options) {
      await requireBound().writeTextFile(options.path, options.content);
    },
    async readBinaryFile(options) {
      const text = await requireBound().readTextFile(options.path);
      return text === null ? null : Buffer.from(text);
    },
    async writeBinaryFile(options) {
      const content = Buffer.from(options.content).toString("utf8");
      await requireBound().writeTextFile(options.path, content);
    },
    async readFile(options) {
      const text = await requireBound().readTextFile(options.path);
      if (text === null) {
        return null;
      }
      return bytesStream(text);
    },
    async writeFile(options) {
      const chunks: Buffer[] = [];
      for await (const chunk of options.content) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      await requireBound().writeTextFile(options.path, Buffer.concat(chunks).toString("utf8"));
    },
    async removePath(options) {
      const bound = requireBound();
      await rm(guestToHost(bound.disk, options.path), {
        force: options.force === true,
        recursive: options.recursive === true,
      });
    },
    async setNetworkPolicy(policy: SandboxNetworkPolicy) {
      if (policy !== "deny-all") {
        throw new Error("workbench network is deny-all");
      }
    },
  };
}

function commandFromRun(options: { readonly command?: string } | string): string {
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
    stdout: bytesStream(result.stdout),
    stderr: bytesStream(result.stderr),
    async wait() {
      return { exitCode: result.exitCode };
    },
    async kill() {},
  };
}

function resolveDisksRoot(explicit: string | undefined, appRoot: string): string {
  return explicit ?? process.env.ZOEN_MEMBERSHIP_DISK_ROOT?.trim() ?? join(appRoot, ".eve", "workbench-disks");
}

function templatePath(disksRoot: string, templateKey: string): string {
  return join(disksRoot, ".templates", encodeURIComponent(templateKey));
}

async function copyTemplateWorkspace(templateRoot: string, disk: MembershipDisk): Promise<void> {
  const source = join(templateRoot, "workspace");
  await mkdir(disk.workspace, { recursive: true });
  await cp(source, disk.workspace, { recursive: true });
}

async function plantZoenMarker(disk: MembershipDisk): Promise<void> {
  const planted = join(disk.workspace, "bin", "zoen");
  await mkdir(dirname(planted), { recursive: true });
  await writeFile(
    planted,
    "#!/bin/sh\nprintf '%s\\n' 'zoen: planted host command' >&2\nexit 126\n",
    { mode: 0o755 },
  );
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

export function parseSessionMembership(raw: string | undefined): MembershipIdBrand {
  if (raw === undefined || raw.trim().length === 0) {
    return unboundMembership;
  }
  return MembershipId(raw);
}
