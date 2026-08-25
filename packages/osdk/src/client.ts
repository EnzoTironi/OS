import type { CompiledDefinition } from "@zoen/ontology";
import { createActionHandle, type OsdkActionHandle } from "./actions.js";
import { buildOsdkModel, type OsdkModel } from "./model.js";
import { createTypeQueries, type TypeQuery } from "./objects.js";
import type { OsdkActionsPort, OsdkWorld } from "./ports.js";

export interface CreateOsdkOptions {
  readonly actions: OsdkActionsPort;
  readonly tenantId: string;
  readonly validAt: Date;
  readonly world: OsdkWorld;
}

export interface OsdkRuntimeClient {
  readonly actions: Readonly<Record<string, OsdkActionHandle<unknown>>>;
  readonly model: OsdkModel;
  readonly objects: Readonly<Record<string, TypeQuery>>;
}

/**
 * Context: typed ontology client over claim-based World + governed Action.
 * Inputs: compiled `.zoen.ts` and live zoend World/Action ports.
 * Outputs: `objects.<Type>` claim-query helpers and `actions.<Name>.preview|commit`.
 * Side effects: SemanticQuery for reads; Action Propose/Approve/Commit for writes.
 */
export function createOsdkFromCompiled(
  compiled: CompiledDefinition,
  options: CreateOsdkOptions,
): OsdkRuntimeClient {
  const model = buildOsdkModel(compiled);
  const definition = {
    definitionId: compiled.definition.definitionId,
    digest: compiled.digest,
    revision: BigInt(compiled.definition.revision),
  };
  const objects = createTypeQueries({
    definition,
    model,
    tenantId: options.tenantId,
    validAt: options.validAt,
    world: options.world,
  });
  const actions: Record<string, OsdkActionHandle<unknown>> = {};
  for (const action of model.actions) {
    actions[action.apiName] = createActionHandle({
      action: action.action,
      actions: options.actions,
      definition,
    });
  }
  return { actions, model, objects };
}
