import type { AdaptiveSurfaceModel } from "../../../archive/packages/surface/src/model.js";
import {
  type CapabilityAlias,
  capabilityAliasForScope,
  type EmbeddingProvider,
  type EmbeddingProviderRoute,
  type ModelCapabilityAlias,
  type ModelPlanner,
  type ProviderRoute,
  type SemanticCapabilityScope,
} from "./types.js";

export interface Registration {
  dispose(): void;
}

export type ProviderResolution =
  | {
      readonly kind: "available";
      readonly planner: ModelPlanner;
      readonly route: ProviderRoute;
      readonly surfaceModel?: AdaptiveSurfaceModel;
    }
  | {
      readonly kind: "unavailable";
    };

export type EmbeddingProviderResolution =
  | {
      readonly kind: "available";
      readonly provider: EmbeddingProvider;
      readonly route: EmbeddingProviderRoute;
    }
  | {
      readonly kind: "unavailable";
    };

interface ProviderRegistration {
  readonly planner: ModelPlanner;
  readonly route: ProviderRoute;
  readonly surfaceModel?: AdaptiveSurfaceModel;
}

export class AgentRegistry {
  readonly #capabilityScopes = new Map<
    CapabilityAlias,
    SemanticCapabilityScope
  >();
  readonly #embeddingProviders = new Map<
    string,
    {
      readonly provider: EmbeddingProvider;
      readonly route: EmbeddingProviderRoute;
    }
  >();
  readonly #providers = new Map<string, ProviderRegistration>();

  registerCapabilityScope(scope: SemanticCapabilityScope): Registration {
    const alias = capabilityAliasForScope(scope);
    if (this.#capabilityScopes.has(alias)) {
      throw new Error(`capability scope ${alias} is already registered`);
    }
    this.#capabilityScopes.set(alias, scope);
    return disposable(() => {
      this.#capabilityScopes.delete(alias);
    });
  }

  registerProvider(
    route: ProviderRoute,
    planner: ModelPlanner,
    surfaceModel?: AdaptiveSurfaceModel,
  ): Registration {
    if (this.#providers.has(route.id)) {
      throw new Error(`provider route ${route.id} is already registered`);
    }
    for (const registered of this.#providers.values()) {
      if (registered.route.capability === route.capability) {
        throw new Error(
          `model capability ${route.capability} already has a provider route`,
        );
      }
    }
    this.#providers.set(route.id, { planner, route, surfaceModel });
    return disposable(() => {
      this.#providers.delete(route.id);
    });
  }

  registerEmbeddingProvider(
    provider: EmbeddingProvider,
  ): Registration {
    const { route } = provider;
    if (this.#embeddingProviders.has(route.id)) {
      throw new Error(`embedding provider route ${route.id} is already registered`);
    }
    for (const registered of this.#embeddingProviders.values()) {
      if (registered.route.capability === route.capability) {
        throw new Error(
          `embedding capability ${route.capability} already has a provider route`,
        );
      }
    }
    this.#embeddingProviders.set(route.id, { provider, route });
    return disposable(() => {
      this.#embeddingProviders.delete(route.id);
    });
  }

  capabilityAliases(): readonly CapabilityAlias[] {
    return [...this.#capabilityScopes.keys()];
  }

  capabilityScopes(): readonly SemanticCapabilityScope[] {
    return [...this.#capabilityScopes.values()];
  }

  providerRouteIds(): readonly string[] {
    return [
      ...this.#providers.keys(),
      ...this.#embeddingProviders.keys(),
    ];
  }

  resolveProvider(modelCapability: ModelCapabilityAlias): ProviderResolution {
    for (const provider of this.#providers.values()) {
      if (provider.route.capability === modelCapability) {
        return {
          kind: "available",
          planner: provider.planner,
          route: provider.route,
          surfaceModel: provider.surfaceModel,
        };
      }
    }
    return { kind: "unavailable" };
  }

  resolveEmbeddingProvider(
    modelCapability: ModelCapabilityAlias,
  ): EmbeddingProviderResolution {
    for (const provider of this.#embeddingProviders.values()) {
      if (provider.route.capability === modelCapability) {
        return {
          kind: "available",
          provider: provider.provider,
          route: provider.route,
        };
      }
    }
    return { kind: "unavailable" };
  }
}

function disposable(remove: () => void): Registration {
  let disposed = false;
  return {
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      remove();
    },
  };
}
