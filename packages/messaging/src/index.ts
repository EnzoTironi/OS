export type {
  ChatSdkDeliveryReceipt,
  ChatSdkMessage,
  ChatSdkOutbound,
  ChatSdkShapedAdapter,
  ChatSdkThreadRef,
  ChatSdkUserRef,
} from "./chat-sdk-shape.js";
export type {
  CapabilityId,
  CapabilityMatrix,
  CapabilityMatrixRow,
  CapabilityProbes,
  DegradeTarget,
  ProbeAnswer,
} from "./capability-probes.js";
export {
  CAPABILITY_IDS,
  createCapabilityProbes,
  deriveCapabilityMatrix,
  projectPresentationCaps,
} from "./capability-probes.js";
export { createFakeTelegramProvider } from "./adapters/telegram-fake.js";
export { createFakeLinqProvider } from "./adapters/linq-fake.js";
export { createFakeWhatsAppBusinessProvider } from "./adapters/whatsapp-business-fake.js";
export {
  createMessagingGateway,
  type MessagingGateway,
  type MessagingGatewayOptions,
} from "./gateway.js";
export {
  CONFORMANCE_SCENARIOS,
  type ConformanceScenario,
  type ProtocolScenarioId,
  type ScenarioMode,
} from "./conformance/scenarios.js";
export {
  runConformanceScenarios,
  selectPath,
  type ScenarioContext,
  type ScenarioHandler,
  type ScenarioTrace,
  type TracePath,
} from "./conformance/runner.js";
export {
  MUTANT_IDS,
  mutantKill,
  type MutantId,
  type MutantKill,
} from "./conformance/mutants.js";
