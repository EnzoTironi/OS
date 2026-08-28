/**
 * Speaker-local world snapshot. Labels only.
 * The conversational app does not call World, Cedar, or OSDK.
 * Ontology facts enter through the planted `zoen` CLI on spawn_execution.
 */

export interface WorldRivalView {
  readonly label: string;
  readonly sourceId?: string;
}

/**
 * Membership-scoped snapshot a test or host may inject.
 * `href` stays an optional string; the turn boundary parses `URL | null`.
 */
export interface WorldQuerySnapshot {
  readonly entityIds: readonly string[];
  readonly href?: string;
  readonly notes: readonly string[];
  readonly rivals: readonly WorldRivalView[];
}

export interface WorldQueryInput {
  readonly membershipId: string;
  readonly tenantId: string;
  readonly entityId?: string;
  readonly typeApiName?: string;
  readonly validAt?: Date;
}

export interface WorldQueryClient {
  semanticQuery(input: WorldQueryInput): Promise<WorldQuerySnapshot | undefined>;
}

/**
 * Dotted entity/membership ids. Provenance `source.*` labels stay speakable.
 */
export function looksLikeEntityId(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0 || /^source\./u.test(trimmed)) {
    return false;
  }
  return /^[A-Za-z][A-Za-z0-9_-]*\.[A-Za-z][A-Za-z0-9._-]+$/u.test(trimmed);
}
