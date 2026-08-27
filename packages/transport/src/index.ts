export {
  presentationSchema,
  type ConversationalBlock,
  type PresentationIntent,
} from "./presentation-intent.js";
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
  assertCompanionPresenceState,
  companionSessionIsReady,
  composeOutboundChatJid,
  createHttpCompanionSession,
  createRecordingCompanionSession,
  enrichInboundPersonRefs,
  normalizeCompanionInbound,
  type CompanionInbound,
  type CompanionOutbound,
  type CompanionPresence,
  type CompanionPresenceState,
  type CompanionReady,
  type CompanionSendReceipt,
  type CompanionSession,
  type CompanionTraceEvent,
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
  PERSON_WHATSAPP_SUBJECT_JID,
  assertWhatsAppPersonSubject,
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
  MediaIngressError,
  rejectWhatsAppMediaFields,
  validateMediaBlob,
  whatsappAdvertisesMedia,
  WHATSAPP_INGESTED_MEDIA_TYPES,
} from "./media-ingress.js";
export {
  admitWhatsAppIngress,
  createMemoryIngressReplayStore,
  createPostgresIngressReplayStore,
  GATEWAY_INGRESS_REPLAY_NAMESPACE,
  readWhatsAppIngressSecret,
  verifyWhatsAppInbound,
  WhatsAppIngressAuthError,
  type IngressReplayStore,
} from "./whatsapp-ingress-auth.js";
export {
  classifyWhatsAppContactInbound,
  createFileReplyLedger,
  createMemoryReplyLedger,
  createPostgresReplyLedger,
  createWhatsAppContactLoop,
  type ReplyLedger,
  type WhatsAppContactDisposition,
  type WhatsAppContactDropReason,
  type WhatsAppContactLoop,
  type WhatsAppContactLoopOptions,
} from "./whatsapp-contact-loop.js";
export {
  assertLiveTelegramAdvertisement,
  createLiveTelegramProvider,
  createLiveTelegramProviderFromEnv,
  parseTelegramBotUpdate,
  readTelegramBotTokenFromEnv,
  readTelegramIngressModeFromEnv,
  readTelegramWebhookSecretFromEnv,
  requireTelegramBotToken,
  verifyTelegramWebhookSecret,
  LiveTelegramConfigError,
  TelegramEnvelopeError,
  TelegramWebhookSecretError,
  type LiveTelegramProvider,
  type LiveTelegramProviderOptions,
  type TelegramIngressMode,
  type TelegramWebhookSecretFailure,
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
