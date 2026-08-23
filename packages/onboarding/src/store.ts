import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { GoalDigest, ZoenAccountId } from "./brands.js";
import type { OnboardingSession } from "./types.js";

export function sessionKey(
  digest: GoalDigest,
  accountId: ZoenAccountId,
): string {
  return `${digest}:${accountId}`;
}

export interface OnboardingSessionStore {
  get(
    digest: GoalDigest,
    accountId: ZoenAccountId,
  ): Promise<OnboardingSession | null>;
  save(session: OnboardingSession): Promise<void>;
  /** All sessions for an account (projection rebuild / listing). */
  listByAccount(accountId: ZoenAccountId): Promise<ReadonlyArray<OnboardingSession>>;
}

export function createMemoryStore(
  seed: ReadonlyMap<string, OnboardingSession> = new Map(),
): OnboardingSessionStore & { readonly snapshot: () => Map<string, OnboardingSession> } {
  const data = new Map(seed);
  return {
    async get(digest, accountId) {
      return data.get(sessionKey(digest, accountId)) ?? null;
    },
    async save(session) {
      data.set(sessionKey(session.digest, session.accountId), session);
    },
    async listByAccount(accountId) {
      return [...data.values()].filter((s) => s.accountId === accountId);
    },
    snapshot() {
      return new Map(data);
    },
  };
}

type FileEnvelope = {
  readonly sessions: Record<string, OnboardingSession>;
};

/**
 * Durable product-state store. Survives process restart.
 * Not Membership/TEC authority.
 */
export function createFileStore(filePath: string): OnboardingSessionStore {
  let cache: Map<string, OnboardingSession> | null = null;

  async function load(): Promise<Map<string, OnboardingSession>> {
    if (cache !== null) {
      return cache;
    }
    try {
      const raw = await readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as FileEnvelope;
      cache = new Map(Object.entries(parsed.sessions ?? {}));
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        cache = new Map();
      } else {
        throw error;
      }
    }
    return cache;
  }

  async function persist(data: Map<string, OnboardingSession>): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true });
    const envelope: FileEnvelope = {
      sessions: Object.fromEntries(data.entries()),
    };
    await writeFile(filePath, `${JSON.stringify(envelope, null, 2)}\n`);
    cache = data;
  }

  return {
    async get(digest, accountId) {
      const data = await load();
      return data.get(sessionKey(digest, accountId)) ?? null;
    },
    async save(session) {
      const data = await load();
      const next = new Map(data);
      next.set(sessionKey(session.digest, session.accountId), session);
      await persist(next);
    },
    async listByAccount(accountId) {
      const data = await load();
      return [...data.values()].filter((s) => s.accountId === accountId);
    },
  };
}
