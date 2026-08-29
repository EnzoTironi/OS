import { providerKey } from "./brands.js";
import type { ChannelPresentationCapability } from "./channel.js";

/** Closed set of probeable capabilities (ticket matrix ∩ presentation). */
export type CapabilityId =
  | "dm"
  | "group"
  | "reply_thread"
  | "typing"
  | "reactions"
  | "read_receipts"
  | "text"
  | "image_file"
  | "voice_audio"
  | "native_card"
  | "native_button"
  | "native_link"
  | "ephemeral"
  | "proactive_outbound";

export const CAPABILITY_IDS: readonly CapabilityId[] = [
  "dm",
  "group",
  "reply_thread",
  "typing",
  "reactions",
  "read_receipts",
  "text",
  "image_file",
  "voice_audio",
  "native_card",
  "native_button",
  "native_link",
  "ephemeral",
  "proactive_outbound",
] as const;

/** Where an unsupported capability must land. */
export type DegradeTarget = "text" | "link" | "dm" | "web_surface";

/**
 * Probe answer is a sum type: native XOR unsupported-with-degrade.
 * Illegal: supported:false with no degrade; supported:true with degradeTo.
 */
export type ProbeAnswer =
  | { readonly status: "native" }
  | { readonly status: "unsupported"; readonly degradeTo: DegradeTarget };

export interface CapabilityProbes {
  readonly providerId: string;
  probe(id: CapabilityId): ProbeAnswer;

  canDm(): ProbeAnswer;
  canGroup(): ProbeAnswer;
  canReplyThread(): ProbeAnswer;
  canType(): ProbeAnswer;
  canReact(): ProbeAnswer;
  canReadReceipt(): ProbeAnswer;
  canText(): ProbeAnswer;
  canImageFile(): ProbeAnswer;
  canVoiceAudio(): ProbeAnswer;
  canNativeCard(): ProbeAnswer;
  canNativeButton(): ProbeAnswer;
  canNativeLink(): ProbeAnswer;
  canEphemeral(): ProbeAnswer;
  canProactiveOutbound(): ProbeAnswer;
}

export type CapabilityMatrixRow = {
  readonly providerId: string;
  readonly capability: CapabilityId;
  readonly answer: ProbeAnswer;
};

export type CapabilityMatrix = readonly CapabilityMatrixRow[];

/** Sole matrix constructor. Hand-edited matrices are forbidden. */
export function deriveCapabilityMatrix(
  adapters: readonly { readonly probes: CapabilityProbes }[],
): CapabilityMatrix {
  const rows: CapabilityMatrixRow[] = [];
  for (const adapter of adapters) {
    for (const capability of CAPABILITY_IDS) {
      rows.push({
        answer: adapter.probes.probe(capability),
        capability,
        providerId: adapter.probes.providerId,
      });
    }
  }
  return rows;
}

const SUGAR: readonly {
  readonly method: keyof Omit<CapabilityProbes, "providerId" | "probe">;
  readonly id: CapabilityId;
}[] = [
  { id: "dm", method: "canDm" },
  { id: "group", method: "canGroup" },
  { id: "reply_thread", method: "canReplyThread" },
  { id: "typing", method: "canType" },
  { id: "reactions", method: "canReact" },
  { id: "read_receipts", method: "canReadReceipt" },
  { id: "text", method: "canText" },
  { id: "image_file", method: "canImageFile" },
  { id: "voice_audio", method: "canVoiceAudio" },
  { id: "native_card", method: "canNativeCard" },
  { id: "native_button", method: "canNativeButton" },
  { id: "native_link", method: "canNativeLink" },
  { id: "ephemeral", method: "canEphemeral" },
  { id: "proactive_outbound", method: "canProactiveOutbound" },
];

/** Named helpers always delegate to probe; table is the only authority. */
export function createCapabilityProbes(
  providerId: string,
  table: Readonly<Record<CapabilityId, ProbeAnswer>>,
): CapabilityProbes {
  const probe = (id: CapabilityId): ProbeAnswer => table[id];
  const probes: CapabilityProbes = {
    providerId,
    probe,
    canDm: () => probe("dm"),
    canGroup: () => probe("group"),
    canReplyThread: () => probe("reply_thread"),
    canType: () => probe("typing"),
    canReact: () => probe("reactions"),
    canReadReceipt: () => probe("read_receipts"),
    canText: () => probe("text"),
    canImageFile: () => probe("image_file"),
    canVoiceAudio: () => probe("voice_audio"),
    canNativeCard: () => probe("native_card"),
    canNativeButton: () => probe("native_button"),
    canNativeLink: () => probe("native_link"),
    canEphemeral: () => probe("ephemeral"),
    canProactiveOutbound: () => probe("proactive_outbound"),
  };
  for (const { method, id } of SUGAR) {
    const viaSugar = probes[method]();
    const viaProbe = probe(id);
    if (JSON.stringify(viaSugar) !== JSON.stringify(viaProbe)) {
      throw new Error(`probe sugar drift: ${method}`);
    }
  }
  return probes;
}

/** Project probes into gateway delivery flags. Not a second registry. */
export function projectPresentationCaps(
  probes: CapabilityProbes,
): ChannelPresentationCapability {
  const provider = providerKey(probes.providerId);
  return {
    buttons: probes.canNativeButton().status === "native",
    cards: probes.canNativeCard().status === "native",
    ephemeral: probes.canEphemeral().status === "native",
    extensions: {
      imessageApp: false,
      imessageExperience: probes.providerId === "linq",
    },
    files: probes.canImageFile().status === "native",
    linkButtons: probes.canNativeLink().status === "native",
    provider,
    reactions: probes.canReact().status === "native",
    readReceipts: probes.canReadReceipt().status === "native",
    text: true,
    typing: probes.canType().status === "native",
    voice: probes.canVoiceAudio().status === "native",
  };
}
