export { authorityDigest } from "./authority-digest.js";
export {
  applyCopy,
  assertCopyProposalShape,
  proposeCopy,
} from "./copy.js";
export {
  collectDeclaredActionIds,
  deriveCapabilities,
  deriveCapabilityFacts,
  selectFirstSuccess,
} from "./derive.js";
export { extractCandidate, type ExtractCandidateInput } from "./extract.js";
export {
  assertInspectSourcesAllowed,
  buildWorkingSetSnapshot,
  type ActiveDefinitionRow,
} from "./inspect.js";
export {
  assertActionAuth,
  assertPublicQueryAllowed,
  publishSurface,
} from "./surface-publish.js";
export {
  runKitchenTests,
  synthesizeTests,
  type KitchenTestResult,
} from "./tests.js";
export {
  assertPublisherIdentity,
  validateCandidate,
} from "./validate.js";
export type {
  AuthorityFacts,
  CapabilityFact,
  CopyProposal,
  ExtractionTrace,
  KitchenCandidate,
  KitchenTestBundle,
  PublishedSurface,
  SurfaceAccess,
  ValidateReport,
  WorkingSetSnapshot,
} from "./types.js";
