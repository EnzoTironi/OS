import { decideAudienceDisclosure } from "./audience.js";
import {
  applyConversationBudget,
  DEFAULT_DATA_TOKEN_BUDGET,
} from "./context-budget.js";
import {
  conversationContextHash,
  createConversationContextRecord,
  defaultConversationJcs,
  hashCanonicalJson,
  sealConversationContextDocument,
  type ConversationAudienceKind,
  type ConversationContextAssembly,
  type ConversationContextDocument,
  type ConversationContextRecord,
  type ConversationContextScope,
  type ConversationDroppedReason,
  type ConversationInbound,
  type ConversationJcs,
  type ConversationLocale,
} from "./context-document.js";
import { conversationKeyFrom, interactionId } from "./brands.js";
import { projectConversationContext } from "./context-project.js";
import type { HistoryQueryClient } from "./history-query.js";
import type { TurnStore } from "./turn-store.js";
import type {
  AudienceObservation,
  SemanticCommitRef,
  TrustedInteractionContext,
} from "./types.js";
import type { WorldQueryClient, WorldQuerySnapshot } from "./world-query.js";

export type ConversationWorkspaceKind = "enterprise" | "personal";

export interface ConversationContextRetrieveRequest {
  readonly audienceKind: ConversationAudienceKind;
  readonly carryForwardInteractionIds: readonly string[];
  readonly claimedInteractionIds: readonly string[];
  readonly conversationKey: string;
  readonly locale: ConversationLocale;
  readonly membership: TrustedInteractionContext;
  readonly observedCommitRefs: readonly SemanticCommitRef[];
  readonly validAt: Date;
  readonly workspaceKind: ConversationWorkspaceKind;
}

export interface ConversationContextSource {
  readonly id: string;
  retrieve(
    request: ConversationContextRetrieveRequest,
  ): Promise<readonly ConversationContextRecord[]>;
}

export interface ConversationContextAssemblerOptions {
  readonly budget?: number;
  readonly jcs?: ConversationJcs;
  readonly now?: () => Date;
  readonly sources?: readonly ConversationContextSource[];
}

export interface AssembleBoundInput {
  readonly attemptId: string;
  readonly audienceKind: ConversationAudienceKind;
  readonly carryForwardInteractionIds?: readonly string[];
  readonly claimedInteractionIds: readonly string[];
  readonly conversationKey: string;
  readonly hiddenTokens?: readonly string[];
  readonly inbound: ConversationInbound;
  readonly instructions: string;
  readonly locale: ConversationLocale;
  readonly membership: TrustedInteractionContext;
  readonly observedCommitRefs?: readonly SemanticCommitRef[];
  readonly workspaceKind?: ConversationWorkspaceKind;
}

export interface AssembleUnboundInput {
  readonly href?: string;
  readonly inbound: ConversationInbound;
  readonly instructions: string;
  readonly locale?: ConversationLocale;
}

export interface ConversationContextAssembler {
  assembleBound(input: AssembleBoundInput): Promise<ConversationContextAssembly>;
  assembleUnbound(
    input: AssembleUnboundInput,
  ): Promise<ConversationContextAssembly>;
}

/**
 * Speaker-owned conversation assembler. Does not import `@zoen/harness`.
 * Sources fail open into `failures[]`. Isolation is audience + tenant + group JID.
 */
export function createConversationContextAssembler(
  options: ConversationContextAssemblerOptions = {},
): ConversationContextAssembler {
  const jcs = options.jcs ?? defaultConversationJcs;
  const now = options.now ?? (() => new Date());
  const sources = options.sources ?? [];
  const budget = options.budget ?? DEFAULT_DATA_TOKEN_BUDGET;

  return {
    async assembleBound(input) {
      assertTrustedMembership(input.membership);
      const validAt = now();
      const workspaceKind = input.workspaceKind ?? "enterprise";
      const carryForward = input.carryForwardInteractionIds ?? [];
      const request: ConversationContextRetrieveRequest = {
        audienceKind: input.audienceKind,
        carryForwardInteractionIds: carryForward,
        claimedInteractionIds: input.claimedInteractionIds,
        conversationKey: input.conversationKey,
        locale: input.locale,
        membership: input.membership,
        observedCommitRefs: input.observedCommitRefs ?? [],
        validAt,
        workspaceKind,
      };
      const collected: ConversationContextRecord[] = [
        instructionRecord("interaction", input.locale, jcs, input.conversationKey),
      ];
      const failures: ConversationContextDocument["failures"] = [];
      const dropped: ConversationContextDocument["dropped"] = [];

      const settled = await Promise.allSettled(
        sources.map(async (source) => ({
          records: await source.retrieve(request),
          sourceId: source.id,
        })),
      );
      for (const [index, outcome] of settled.entries()) {
        const source = sources[index];
        if (source === undefined) {
          continue;
        }
        if (outcome.status === "rejected") {
          failures.push({
            code: "unavailable",
            sourceId: source.id,
          });
          continue;
        }
        for (const record of outcome.value.records) {
          const allow = allowConversationRecord({
            audienceKind: input.audienceKind,
            conversationKey: input.conversationKey,
            membership: input.membership,
            record,
            workspaceKind,
          });
          if (!allow.ok) {
            dropped.push({ reason: allow.reason, recordId: record.recordId });
            continue;
          }
          collected.push(record);
        }
      }
      for (const record of claimedInboundRecords(input, jcs)) {
        if (collected.some((row) => row.recordId === record.recordId)) {
          continue;
        }
        collected.push(record);
      }

      const budgeted = applyConversationBudget({
        budget,
        carryForwardInteractionIds: carryForward,
        claimedInteractionIds: input.claimedInteractionIds,
        records: collected,
      });
      for (const drop of budgeted.dropped) {
        dropped.push(drop);
      }

      const document = sealConversationContextDocument({
        audienceKind: input.audienceKind,
        attemptId: input.attemptId,
        carryForwardInteractionIds: [...carryForward],
        claimedInteractionIds: [...input.claimedInteractionIds],
        conversationKey: input.conversationKey,
        dropped,
        failures,
        records: budgeted.records,
        schema: "zoen.conversation.context.v1",
        validAt: validAt.toISOString(),
      });
      return sealAssembly({
        document,
        hiddenTokens: [
          ...hiddenMembershipTokens(input.membership),
          ...(input.hiddenTokens ?? []),
        ],
        instructions: input.instructions,
        jcs,
      });
    },

    async assembleUnbound(input) {
      const locale = input.locale ?? "pt";
      const validAt = now();
      const inboundRecord = unboundInboundRecord(input.inbound, jcs);
      const records = [
        instructionRecord("first_contact", locale, jcs),
        inboundRecord,
      ];
      if (input.href !== undefined && input.href.length > 0) {
        records.push(unboundHrefRecord(input.href, jcs));
      }
      const document = sealConversationContextDocument({
        audienceKind: "unknown",
        attemptId: "unbound",
        carryForwardInteractionIds: [],
        claimedInteractionIds: [],
        conversationKey: "unbound",
        dropped: [],
        failures: [],
        records,
        schema: "zoen.conversation.context.v1",
        validAt: validAt.toISOString(),
      });
      return sealAssembly({
        document,
        hiddenTokens: [],
        instructions: input.instructions,
        jcs,
      });
    },
  };
}

export function createInteractionConversationSource(
  store: TurnStore,
): ConversationContextSource {
  return {
    id: "interaction",
    async retrieve(request) {
      const ids = uniqueIds([
        ...request.claimedInteractionIds,
        ...request.carryForwardInteractionIds,
      ]);
      const records: ConversationContextRecord[] = [];
      for (const id of ids) {
        const stored = await store.getRecord(interactionId(id));
        if (stored === undefined) {
          continue;
        }
        const conversationId = `${String(stored.ctx.channel.provider)}:${String(stored.ctx.channel.thread)}`;
        const storedKey = conversationKeyFrom({
          accountId: stored.ctx.accountId,
          conversationId,
          tenantId: String(stored.ctx.tenantId),
          workspaceId: stored.ctx.workloadId,
        });
        records.push(
          createConversationContextRecord({
            attribution: {
              interactionId: stored.id,
              kind: "interaction",
            },
            payload: inboundPayload(stored.inbound.body),
            retention: "interaction",
            scope: {
              conversationKey: storedKey,
              kind: "conversation",
            },
            trustClass: "interaction",
          }),
        );
      }
      return records;
    },
  };
}

export function createWorldConversationSource(
  world: WorldQueryClient,
): ConversationContextSource {
  return {
    id: "world",
    async retrieve(request) {
      const snapshot = await world.semanticQuery({
        membershipId: request.membership.membershipId,
        tenantId: String(request.membership.tenantId),
        validAt: request.validAt,
      });
      if (snapshot === undefined) {
        return [];
      }
      const disclosed = discloseWorld(snapshot, request.audienceKind);
      return [
        createConversationContextRecord({
          attribution: {
            actualCommitSequence: "0",
            definitionDigest: hashCanonicalJson({
              tenantId: String(request.membership.tenantId),
            }),
            kind: "query",
            resultDigest: hashCanonicalJson({
              notes: disclosed.notes,
              rivals: disclosed.rivals,
            }),
          },
          payload: {
            notes: [...disclosed.notes],
            rivals: disclosed.rivals.map((rival) => ({ label: rival.label })),
            type: "world",
          },
          retention: "authority",
          scope: {
            kind: "tenant",
            tenantId: String(request.membership.tenantId),
          },
          trustClass: "world",
        }),
      ];
    },
  };
}

export function createPersonalMemoryConversationSource(
  world: WorldQueryClient,
): ConversationContextSource {
  return {
    id: "personal_memory",
    async retrieve(request) {
      if (request.audienceKind !== "dm") {
        return [];
      }
      const snapshot = await world.semanticQuery({
        membershipId: request.membership.membershipId,
        tenantId: String(request.membership.tenantId),
        typeApiName: "personal.Note",
        validAt: request.validAt,
      });
      if (snapshot === undefined) {
        return [];
      }
      return snapshot.notes
        .map((note) => note.trim())
        .filter((note) => note.length > 0)
        .map((body, index) =>
          createConversationContextRecord({
            attribution: {
              actualCommitSequence: String(index),
              definitionDigest: hashCanonicalJson({ type: "personal.Note" }),
              kind: "query",
              resultDigest: hashCanonicalJson({ body, index }),
            },
            payload: { body, type: "personal_memory" },
            retention: "preference",
            scope: {
              kind: "principal",
              principalId: String(request.membership.principalId),
              tenantId: String(request.membership.tenantId),
            },
            trustClass: "personal_memory",
          }),
        );
    },
  };
}

export function createHistoryConversationSource(
  history: HistoryQueryClient,
): ConversationContextSource {
  return {
    id: "history",
    async retrieve(request) {
      const records: ConversationContextRecord[] = [];
      for (const ref of request.observedCommitRefs) {
        const operationId = semanticOperationId(ref);
        if (operationId === undefined) {
          continue;
        }
        const explained = await history.explain(operationId);
        if (explained === undefined) {
          continue;
        }
        records.push(
          createConversationContextRecord({
            attribution: {
              explanationDigest: explained.explanationDigest,
              kind: "explain",
              operationId: explained.operationId,
            },
            payload: {
              complete: explained.complete,
              labels: [...explained.labels],
              type: "history",
            },
            retention: "authority",
            scope: {
              kind: "tenant",
              tenantId: String(request.membership.tenantId),
            },
            trustClass: "history",
          }),
        );
      }
      return records;
    },
  };
}

export function defaultConversationSources(input: {
  readonly history?: HistoryQueryClient;
  readonly store?: TurnStore;
  readonly world?: WorldQueryClient;
}): ConversationContextSource[] {
  const sources: ConversationContextSource[] = [];
  if (input.store !== undefined) {
    sources.push(createInteractionConversationSource(input.store));
  }
  if (input.world !== undefined) {
    sources.push(createWorldConversationSource(input.world));
    sources.push(createPersonalMemoryConversationSource(input.world));
  }
  if (input.history !== undefined) {
    sources.push(createHistoryConversationSource(input.history));
  }
  return sources;
}

export function audienceKindFromObservation(
  audience: AudienceObservation,
): ConversationAudienceKind {
  return audience.kind;
}

export function audienceKindFromMembership(
  membership: TrustedInteractionContext,
): ConversationAudienceKind {
  return membership.channel.group === undefined ? "dm" : "group";
}

function allowConversationRecord(input: {
  readonly audienceKind: ConversationAudienceKind;
  readonly conversationKey: string;
  readonly membership: TrustedInteractionContext;
  readonly record: ConversationContextRecord;
  readonly workspaceKind: ConversationWorkspaceKind;
}):
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: ConversationDroppedReason } {
  if (input.record.trustClass === "personal_memory" && input.audienceKind !== "dm") {
    return { ok: false, reason: "audience" };
  }
  return allowConversationScope({
    conversationKey: input.conversationKey,
    membership: input.membership,
    scope: input.record.scope,
    workspaceKind: input.workspaceKind,
  });
}

export function allowConversationScope(input: {
  readonly conversationKey: string;
  readonly membership: TrustedInteractionContext;
  readonly scope: ConversationContextScope;
  readonly workspaceKind: ConversationWorkspaceKind;
}):
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: ConversationDroppedReason } {
  switch (input.scope.kind) {
    case "unbound":
      return { ok: false, reason: "unbound" };
    case "tenant":
      return input.scope.tenantId === String(input.membership.tenantId)
        ? { ok: true }
        : { ok: false, reason: "wrong_tenant" };
    case "principal":
      if (input.scope.tenantId !== String(input.membership.tenantId)) {
        return { ok: false, reason: "wrong_tenant" };
      }
      return { ok: true };
    case "conversation":
      return input.scope.conversationKey === input.conversationKey
        ? { ok: true }
        : { ok: false, reason: "audience" };
    case "account":
      if (input.workspaceKind === "enterprise" && input.scope.tenantId === undefined) {
        return { ok: false, reason: "audience" };
      }
      if (
        input.scope.tenantId !== undefined &&
        input.scope.tenantId !== String(input.membership.tenantId)
      ) {
        return { ok: false, reason: "wrong_tenant" };
      }
      if (
        input.workspaceKind === "personal" &&
        input.scope.accountId !== input.membership.accountId
      ) {
        return { ok: false, reason: "audience" };
      }
      return { ok: true };
    default: {
      const exhaustive: never = input.scope;
      return exhaustive;
    }
  }
}

function discloseWorld(
  snapshot: WorldQuerySnapshot,
  audienceKind: ConversationAudienceKind,
): WorldQuerySnapshot {
  const disclosure = decideAudienceDisclosure({
    actionRisk: "low",
    audience: { kind: audienceKind },
    channelAssurance: "provider_chat",
    resourceClass: "internal",
  });
  switch (disclosure.kind) {
    case "deliver_full":
      return snapshot;
    case "deliver_redacted":
      return { ...snapshot, notes: [] };
    case "redirect_private":
    case "require_step_up":
    case "deny":
      return { ...snapshot, notes: [], rivals: [] };
    default: {
      const exhaustive: never = disclosure;
      return exhaustive;
    }
  }
}

function instructionRecord(
  kind: "interaction" | "first_contact",
  locale: ConversationLocale,
  jcs: ConversationJcs,
  conversationKey?: string,
): ConversationContextRecord {
  const scope: ConversationContextScope =
    kind === "first_contact" || conversationKey === undefined
      ? { kind: "unbound" }
      : { conversationKey, kind: "conversation" };
  return createConversationContextRecord({
    attribution: {
      kind: "onboard",
      tokenHash: hashCanonicalJson({ kind, locale }),
    },
    jcs,
    payload: { kind, locale, type: "instruction" },
    retention: "interaction",
    scope,
    trustClass: "instruction",
  });
}

function claimedInboundRecords(
  input: AssembleBoundInput,
  jcs: ConversationJcs,
): ConversationContextRecord[] {
  const claimedId = input.claimedInteractionIds.at(-1);
  if (claimedId === undefined) {
    return [];
  }
  return [
    createConversationContextRecord({
      attribution: {
        interactionId: claimedId,
        kind: "interaction",
      },
      jcs,
      payload: inboundPayload(input.inbound),
      retention: "interaction",
      scope: {
        conversationKey: input.conversationKey,
        kind: "conversation",
      },
      trustClass: "interaction",
    }),
  ];
}

function unboundInboundRecord(
  inbound: ConversationInbound,
  jcs: ConversationJcs,
): ConversationContextRecord {
  return createConversationContextRecord({
    attribution: {
      interactionId: "unbound.inbound",
      kind: "interaction",
    },
    jcs,
    payload: inboundPayload(inbound),
    retention: "interaction",
    scope: { kind: "unbound" },
    trustClass: "interaction",
  });
}

function unboundHrefRecord(
  href: string,
  jcs: ConversationJcs,
): ConversationContextRecord {
  return createConversationContextRecord({
    attribution: {
      kind: "onboard",
      tokenHash: hashCanonicalJson({ href }),
    },
    jcs,
    payload: {
      key: "onboard_href",
      text: href,
      type: "preference",
    },
    retention: "preference",
    scope: { kind: "unbound" },
    trustClass: "preference",
  });
}

function inboundPayload(
  inbound:
    | ConversationInbound
    | { readonly kind: string; readonly text?: string; readonly mediaRef?: string },
): Extract<ConversationContextRecord["payload"], { type: "interaction" }> {
  if (inbound.kind === "media") {
    return {
      kind: "media",
      mediaRef: "mediaRef" in inbound ? String(inbound.mediaRef) : "",
      type: "interaction",
    };
  }
  return {
    kind: "text",
    text: "text" in inbound ? String(inbound.text ?? "") : "",
    type: "interaction",
  };
}

function sealAssembly(input: {
  readonly document: ConversationContextDocument;
  readonly hiddenTokens: readonly string[];
  readonly instructions: string;
  readonly jcs: ConversationJcs;
}): ConversationContextAssembly {
  return {
    contextHash: conversationContextHash(input.document, input.jcs),
    document: input.document,
    projection: projectConversationContext({
      document: input.document,
      hiddenTokens: input.hiddenTokens,
      instructions: input.instructions,
    }),
  };
}

function hiddenMembershipTokens(
  membership: TrustedInteractionContext,
): string[] {
  return [
    membership.accountId,
    membership.actorId,
    membership.bindingId,
    membership.membershipId,
    String(membership.principalId),
    String(membership.tenantId),
    membership.workloadId,
  ].filter((token) => token.length > 0);
}

function assertTrustedMembership(membership: TrustedInteractionContext): void {
  if (String(membership.tenantId) === String(membership.channel.thread)) {
    throw new Error("tenantId must not equal provider thread");
  }
  if (String(membership.principalId) === String(membership.channel.providerUser)) {
    throw new Error("principalId must not equal provider user");
  }
}

function semanticOperationId(ref: SemanticCommitRef): string | undefined {
  switch (ref.kind) {
    case "action":
      return ref.actionId;
    case "effect_request":
      return ref.effectRequestId;
    case "approval":
      return undefined;
    default: {
      const exhaustive: never = ref;
      return exhaustive;
    }
  }
}

function uniqueIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    out.push(id);
  }
  return out;
}

