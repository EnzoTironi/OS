import {
  type CapabilityAlias,
  type ModelPlanner,
  type ProviderRoute,
  type SemanticCapability,
  type TaskScope,
} from "./types.js";

export interface Registration {
  dispose(): void;
}

export type RegistryResolution =
  | {
      readonly capabilities: readonly SemanticCapability[];
      readonly kind: "available";
      readonly planner: ModelPlanner;
      readonly route: ProviderRoute;
    }
  | {
      readonly kind: "capability_unavailable";
      readonly missing: readonly CapabilityAlias[];
    }
  | {
      readonly kind: "provider_unavailable";
    };

interface ProviderRegistration {
  readonly planner: ModelPlanner;
  readonly route: ProviderRoute;
}

export class AgentRegistry {
  readonly #capabilities = new Map<CapabilityAlias, SemanticCapability>();
  readonly #providers = new Map<string, ProviderRegistration>();

  registerCapability(capability: SemanticCapability): Registration {
    if (this.#capabilities.has(capability.alias)) {
      throw new Error(`capability ${capability.alias} is already registered`);
    }
    this.#capabilities.set(capability.alias, capability);
    return disposable(() => {
      this.#capabilities.delete(capability.alias);
    });
  }

  registerProvider(
    route: ProviderRoute,
    planner: ModelPlanner,
  ): Registration {
    if (this.#providers.has(route.id)) {
      throw new Error(`provider route ${route.id} is already registered`);
    }
    this.#providers.set(route.id, { planner, route });
    return disposable(() => {
      this.#providers.delete(route.id);
    });
  }

  resolve(task: TaskScope): RegistryResolution {
    const provider = this.#providers.get(task.providerRoute);
    if (
      provider === undefined ||
      provider.route.capability !== task.modelCapability
    ) {
      return { kind: "provider_unavailable" };
    }

    const capabilities: SemanticCapability[] = [];
    const missing: CapabilityAlias[] = [];
    for (const alias of new Set(task.capabilities)) {
      const capability = this.#capabilities.get(alias);
      if (capability === undefined) {
        missing.push(alias);
      } else {
        capabilities.push(capability);
      }
    }
    if (missing.length > 0) {
      return { kind: "capability_unavailable", missing };
    }
    return {
      capabilities,
      kind: "available",
      planner: provider.planner,
      route: provider.route,
    };
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
