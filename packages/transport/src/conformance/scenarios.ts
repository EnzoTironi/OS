import type { CapabilityId, DegradeTarget } from "../capability-probes.js";

export type ProtocolScenarioId =
  | "inbound_dedupe"
  | "burst_debounce"
  | "restart_reconnect"
  | "secure_web_surface_fallback";

export type ScenarioMode =
  | { readonly kind: "native"; readonly requires: CapabilityId }
  | {
      readonly kind: "degrade";
      readonly requires: CapabilityId;
      readonly expectDegradeTo: DegradeTarget;
    }
  | { readonly kind: "protocol"; readonly protocol: ProtocolScenarioId };

export interface ConformanceScenario {
  readonly id: string;
  readonly mode: ScenarioMode;
}

export const CONFORMANCE_SCENARIOS: readonly ConformanceScenario[] = [
  { id: "text_native", mode: { kind: "native", requires: "text" } },
  { id: "dm_native", mode: { kind: "native", requires: "dm" } },
  { id: "group_native", mode: { kind: "native", requires: "group" } },
  {
    id: "typing_or_degrade",
    mode: { kind: "degrade", requires: "typing", expectDegradeTo: "text" },
  },
  {
    id: "ephemeral_or_degrade",
    mode: { kind: "degrade", requires: "ephemeral", expectDegradeTo: "dm" },
  },
  {
    id: "native_card_or_web_surface",
    mode: {
      expectDegradeTo: "web_surface",
      kind: "degrade",
      requires: "native_card",
    },
  },
  {
    id: "protocol_inbound_dedupe",
    mode: { kind: "protocol", protocol: "inbound_dedupe" },
  },
  {
    id: "protocol_burst_debounce",
    mode: { kind: "protocol", protocol: "burst_debounce" },
  },
  {
    id: "protocol_restart_reconnect",
    mode: { kind: "protocol", protocol: "restart_reconnect" },
  },
  {
    id: "protocol_secure_web_surface_fallback",
    mode: { kind: "protocol", protocol: "secure_web_surface_fallback" },
  },
] as const;
