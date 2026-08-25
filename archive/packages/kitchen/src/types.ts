import type { CapabilityInput, CompiledPack, FirstSuccessInput } from "../../pack/src/compiler.js";
import type { SurfaceDocument } from "../../surface/src/model.js";

/** Everything Kitchen may read from the creator tenant. No semantic values. */
export type WorkingSetSnapshot = {
  readonly tenantId: string;
  readonly capturedAtMicros: number;
  readonly activeDefinitions: ReadonlyArray<{
    readonly definitionId: string;
    readonly digest: string;
    readonly revision: string;
    readonly canonicalJson: string;
  }>;
  readonly capabilityFacts: ReadonlyArray<CapabilityFact>;
  readonly surfaceCandidates: ReadonlyArray<{
    readonly surfaceId: string;
    readonly surfaceDigest: string;
    readonly document: unknown;
  }>;
};

export type CapabilityFact = {
  readonly requirementId: string;
  readonly class: CapabilityInput["class"];
  readonly scope: string;
  readonly sensitivity: "sensitive" | "non_sensitive";
  readonly necessity: "required" | "optional";
  readonly degrade?: { readonly mode: string; readonly actionIds: readonly string[] };
  readonly evidence: {
    readonly definitionId: string;
    readonly digest: string;
    readonly declaredActionIds: readonly string[];
  };
};

/** Hashed into PackDigest. LLM cannot write these fields. */
export type AuthorityFacts = {
  readonly packId: string;
  readonly version: string;
  readonly publisher: { readonly id: string; readonly displayName: string };
  readonly ontology: ReadonlyArray<{
    readonly definitionId: string;
    readonly digest: string;
    readonly canonicalJson: string;
  }>;
  readonly capabilities: ReadonlyArray<CapabilityInput>;
  readonly firstSuccess: FirstSuccessInput;
};

/** Presentation only. May be LLM-proposed. No authority fields. */
export type CopyProposal = {
  readonly forAuthorityDigest: string;
  readonly title: string;
  readonly summary: string;
  readonly onboardingQuestions: ReadonlyArray<{
    readonly id: string;
    readonly prompt: string;
    readonly relatesToRequirementId?: string;
  }>;
};

export type ExtractionTrace = {
  readonly sourceTenantId: string;
  readonly definitionPins: ReadonlyArray<{ definitionId: string; digest: string }>;
  readonly omitted: ReadonlyArray<{
    readonly kind:
      | "tenant_only_dependency"
      | "unpinned_artifact"
      | "secret_shaped_field"
      | "conversation_ref"
      | "semantic_record_value";
    readonly ref: string;
    readonly reason: string;
  }>;
  readonly firstSuccessSelection: {
    readonly contractId: string;
    readonly outcome: FirstSuccessInput["outcome"];
    readonly reason: "creator_hint" | "single_write_action" | "explicit_required";
  };
};

export type KitchenTestBundle = {
  readonly schema: "zoen.kitchen.tests.v1";
  readonly assertions: ReadonlyArray<
    | { readonly kind: "manifest_digest_stable"; readonly expectedDigest: string }
    | { readonly kind: "ontology_pin"; readonly definitionId: string; readonly digest: string }
    | { readonly kind: "no_secret_fields" }
    | { readonly kind: "no_tenant_record_payloads" }
    | { readonly kind: "capability_subseteq_declarations" }
    | {
        readonly kind: "first_success_ref_exists";
        readonly contractId: string;
        readonly outcome: FirstSuccessInput["outcome"];
      }
    | {
        readonly kind: "surface_refs_subseteq_pack";
        readonly surfaceDigest: string;
      }
    | {
        readonly kind: "copy_cannot_widen_authority";
        readonly authorityDigest: string;
      }
  >;
};

export type KitchenCandidate = {
  readonly authority: AuthorityFacts;
  readonly compiled: CompiledPack;
  readonly copy: CopyProposal | null;
  readonly tests: KitchenTestBundle;
  readonly extractionTrace: ExtractionTrace;
};

export type SurfaceAccess =
  | { readonly kind: "authenticated" }
  | { readonly kind: "tenant_internal" }
  | {
      readonly kind: "public_readonly";
      readonly allowedQueryBindingIds: readonly string[];
    };

export type PublishedSurface = {
  readonly surfaceDigest: string;
  readonly packDigest: string;
  readonly access: SurfaceAccess;
  readonly document: SurfaceDocument;
};

export type ValidateReport = {
  readonly ok: boolean;
  readonly secretScan: { readonly ok: boolean; readonly findings: readonly string[] };
  readonly tenantRecordScan: { readonly ok: boolean; readonly findings: readonly string[] };
  readonly dependencyPins: { readonly ok: boolean; readonly findings: readonly string[] };
  readonly capabilityCoverage: { readonly ok: boolean; readonly findings: readonly string[] };
  readonly firstSuccess: { readonly ok: boolean; readonly findings: readonly string[] };
  readonly surfaceBindings: { readonly ok: boolean; readonly findings: readonly string[] };
  readonly mutableVersion: { readonly ok: boolean; readonly findings: readonly string[] };
  readonly copyAuthoritySealed: { readonly ok: boolean; readonly findings: readonly string[] };
};
