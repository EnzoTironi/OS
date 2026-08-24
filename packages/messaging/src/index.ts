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
export {
  assertLiveLinqAdvertisement,
  createLiveLinqProvider,
  createLiveLinqProviderFromEnv,
  LINQ_LIVE_DEFAULT_ALLOWLIST,
  LiveLinqAllowlistError,
  LiveLinqConfigError,
  parseLinqWebhookEnvelope,
  type LiveLinqOutboundObservation,
  type LiveLinqPhoneNumber,
  type LiveLinqProvider,
  type LiveLinqProviderOptions,
} from "./adapters/linq-live.js";
export {
  companionSessionIsReady,
  composeOutboundChatJid,
  createHttpCompanionSession,
  createRecordingCompanionSession,
  enrichInboundPersonRefs,
  normalizeCompanionInbound,
  type CompanionInbound,
  type CompanionOutbound,
  type CompanionReady,
  type CompanionSendReceipt,
  type CompanionSession,
  type RecordingCompanionSession,
  type WhatsAppWireShape,
} from "./companion-session.js";
export {
  assertLiveWhatsAppAdvertisement,
  createLiveWhatsAppProvider,
  createLiveWhatsAppProviderFromEnv,
  parseCompanionInboundEnvelope,
  parseWhatsAppDoorE164,
  PERSONAL_WHATSAPP_DOOR_E164,
  selectWhatsAppShape,
  LiveWhatsAppConfigError,
  WhatsAppEnvelopeError,
  WhatsAppSurfaceUrlError,
  type LiveWhatsAppProvider,
} from "./adapters/whatsapp-live.js";
export {
  createWhatsAppMessagingIngress,
  evaluateWhatsAppAdvertisement,
  type WhatsAppMessagingIngress,
} from "./whatsapp-ingress.js";
export {
  assertLiveTelegramAdvertisement,
  createLiveTelegramProvider,
  createLiveTelegramProviderFromEnv,
  parseTelegramBotUpdate,
  readTelegramBotTokenFromEnv,
  readTelegramIngressModeFromEnv,
  requireTelegramBotToken,
  verifyTelegramWebhookSecret,
  LiveTelegramConfigError,
  TelegramEnvelopeError,
  TelegramWebhookSecretError,
  type LiveTelegramProvider,
  type LiveTelegramProviderOptions,
  type TelegramIngressMode,
} from "./adapters/telegram-live.js";
export {
  createTelegramMessagingIngress,
  evaluateTelegramAdvertisement,
  type TelegramMessagingIngress,
} from "./telegram-ingress.js";
export {
  extractStandardWebhookHeaders,
  generateWhsecSecret,
  signStandardWebhook,
  verifyStandardWebhook,
  WebhookVerificationError,
  type StandardWebhookHeaders,
} from "./standard-webhooks.js";
export {
  createMessagingGateway,
  ProviderDisabledError,
  type MessagingGateway,
  type MessagingGatewayOptions,
  type ResolvedPresentation,
} from "./gateway.js";
export {
  CriticalControlUnreachableError,
  DisclosureRequiredError,
  lowerPresentationIntent,
  type LowerPresentationIntentInput,
  type LowerPresentationResult,
} from "./lower-presentation-intent.js";
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
