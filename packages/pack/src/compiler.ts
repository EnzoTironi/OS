import { createHash } from "node:crypto";
import canonicalize from "canonicalize";

export type OntologyDepInput = {
  readonly definitionId: string;
  readonly digest: string;
  readonly canonicalJson: string;
};

export type CapabilityInput = {
  readonly id: string;
  readonly class:
    | "source_read"
    | "external_write"
    | "human_executor"
    | "notification"
    | "adapter";
  readonly scope: string;
  readonly sensitivity?: "sensitive" | "non_sensitive";
  readonly degrade?: {
    readonly mode: string;
    readonly actionIds: readonly string[];
  };
};

export type FirstSuccessInput = {
  readonly id: string;
  readonly outcome:
    | { readonly kind: "action_committed"; readonly actionId: string }
    | { readonly kind: "evidence_recorded"; readonly relationId: string };
};

export type PackAuthoringInput = {
  readonly id: string;
  readonly version: string;
  readonly publisher: { readonly id: string; readonly displayName: string };
  readonly presentation: { readonly title: string; readonly summary: string };
  readonly ontology: readonly OntologyDepInput[];
  readonly capabilities: readonly CapabilityInput[];
  readonly firstSuccess: FirstSuccessInput;
};

export type CompiledPack = {
  readonly schema: "zoen.pack.v1";
  readonly canonicalJson: string;
  readonly digest: string;
  readonly pack: Record<string, unknown>;
};

export function definePack(input: PackAuthoringInput): PackAuthoringInput {
  return input;
}

export function ontologyDep(input: OntologyDepInput): OntologyDepInput {
  return input;
}

export function requireCapability(
  input: Omit<CapabilityInput, "degrade">,
): CapabilityInput {
  return input;
}

export function optionalCapability(
  input: CapabilityInput & {
    readonly degrade: NonNullable<CapabilityInput["degrade"]>;
  },
): CapabilityInput {
  if (input.degrade === undefined) {
    throw new Error(`optional capability ${input.id} missing degrade`);
  }
  return input;
}

export function firstSuccess(input: FirstSuccessInput): FirstSuccessInput {
  return input;
}

function kindFromClass(value: CapabilityInput["class"]): string {
  switch (value) {
    case "source_read":
      return "read_source";
    case "external_write":
      return "write_effect";
    case "human_executor":
      return "human_executor";
    case "notification":
      return "notification";
    case "adapter":
      return "adapter";
    default: {
      const exhaustive: never = value;
      return exhaustive;
    }
  }
}

export function compilePack(input: PackAuthoringInput): CompiledPack {
  if (input.version === "latest" || input.version.length === 0) {
    throw new Error(`invalid pack version: ${input.version}`);
  }
  const integrationRequirements = input.capabilities.map((capability) => {
    const optional = capability.degrade !== undefined;
    if (optional && capability.degrade === undefined) {
      throw new Error(`optional capability ${capability.id} missing degrade`);
    }
    const base = {
      kind: kindFromClass(capability.class),
      necessity: optional ? "optional" : "required",
      requirementId: capability.id,
      scope: capability.scope,
      sensitivity:
        capability.sensitivity ??
        (capability.class === "external_write" ? "sensitive" : "non_sensitive"),
    };
    if (!optional) {
      return base;
    }
    return {
      ...base,
      degrade: {
        actionIds: [...capability.degrade!.actionIds],
        mode: capability.degrade!.mode,
      },
    };
  });

  const pack = {
    description: {
      summary: input.presentation.summary,
      title: input.presentation.title,
    },
    firstSuccessContract: {
      contractId: input.firstSuccess.id,
      outcome:
        input.firstSuccess.outcome.kind === "action_committed"
          ? {
              actionId: input.firstSuccess.outcome.actionId,
              kind: "action_committed",
            }
          : {
              kind: "evidence_recorded",
              relationId: input.firstSuccess.outcome.relationId,
            },
    },
    formatVersion: "zoen.pack.v1",
    integrationRequirements,
    ontologyDependencies: input.ontology.map((dependency) => ({
      definitionId: dependency.definitionId,
      digest: dependency.digest,
    })),
    packId: input.id,
    publisher: {
      displayName: input.publisher.displayName,
      publisherId: input.publisher.id,
    },
    version: input.version,
  };

  const canonicalJson = canonicalize(pack);
  if (canonicalJson === undefined) {
    throw new Error("failed to canonicalize pack");
  }
  const digest = createHash("sha256").update(canonicalJson).digest("hex");
  return {
    canonicalJson,
    digest,
    pack: {
      ...pack,
      ontologyDependencies: input.ontology.map((dependency) => ({
        canonicalJson: dependency.canonicalJson,
        definitionId: dependency.definitionId,
        digest: dependency.digest,
      })),
    },
    schema: "zoen.pack.v1",
  };
}

/** Build a mutable authoring helper that marks optional capabilities. */
export function markOptional(
  capability: CapabilityInput,
  degrade: NonNullable<CapabilityInput["degrade"]>,
): CapabilityInput {
  if (degrade === undefined) {
    throw new Error(`optional capability ${capability.id} missing degrade`);
  }
  return { ...capability, degrade };
}
