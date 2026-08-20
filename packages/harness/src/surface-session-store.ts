import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import {
  parseAdaptiveSurfaceSession,
  type AdaptiveSurfaceSession,
} from "../../surface/src/index.js";
import type { AdaptiveSurfaceSessionPersistence } from "./adaptive-surface.js";

const identifierSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/);

interface StoredSurfaceSessionRow {
  readonly session_digest: string;
  readonly surface_session: unknown;
}

export class PostgresAdaptiveSurfaceSessionStore
  implements AdaptiveSurfaceSessionPersistence
{
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async save(
    trustedTenantId: string,
    value: AdaptiveSurfaceSession,
  ): Promise<void> {
    const tenantId = identifierSchema.parse(trustedTenantId);
    const session = parseAdaptiveSurfaceSession(value);
    const sessionDigest = sha256(JSON.stringify(session));
    const inserted = await this.#pool.query(
      `
        INSERT INTO company_surface_sessions (
          tenant_id,
          session_id,
          session_digest,
          surface_session
        )
        VALUES ($1, $2, $3, $4::jsonb)
        ON CONFLICT (tenant_id, session_id) DO NOTHING
      `,
      [tenantId, session.sessionId, sessionDigest, JSON.stringify(session)],
    );
    if (inserted.rowCount === 1) {
      return;
    }
    const existing = await this.loadRow(tenantId, session.sessionId);
    if (existing?.session_digest !== sessionDigest) {
      throw new Error("Adaptive Surface session identity collision");
    }
  }

  async load(
    trustedTenantId: string,
    sessionId: string,
  ): Promise<AdaptiveSurfaceSession | undefined> {
    const row = await this.loadRow(
      identifierSchema.parse(trustedTenantId),
      identifierSchema.parse(sessionId),
    );
    if (row === undefined) {
      return undefined;
    }
    const session = parseAdaptiveSurfaceSession(row.surface_session);
    if (sha256(JSON.stringify(session)) !== row.session_digest) {
      throw new Error("Adaptive Surface session digest mismatch");
    }
    return session;
  }

  private async loadRow(
    tenantId: string,
    sessionId: string,
  ): Promise<StoredSurfaceSessionRow | undefined> {
    const result = await this.#pool.query<StoredSurfaceSessionRow>(
      `
        SELECT session_digest, surface_session
        FROM company_surface_sessions
        WHERE tenant_id = $1 AND session_id = $2
      `,
      [tenantId, sessionId],
    );
    return result.rows[0];
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
