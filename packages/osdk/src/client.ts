import type { CompiledDefinition } from "@zoen/ontology";
import { createActionHandle, type OsdkActionHandle } from "./actions.js";
import { buildOsdkModel, type OsdkModel } from "./model.js";
import { createObjectSets, type ObjectSet, type ProjectedObject } from "./objects.js";
import type { OsdkActionsPort, OsdkDefinitionRef, OsdkWorld } from "./ports.js";

export interface CreateOsdkOptions {
  readonly actions: OsdkActionsPort;
  readonly definition?: OsdkDefinitionRef;
  readonly tenantId: string;
  readonly validAt?: Date;
  readonly world: OsdkWorld;
}

export interface OsdkRuntimeClient {
  readonly actions: Readonly<Record<string, OsdkActionHandle>>;
  readonly model: OsdkModel;
  readonly objects: Readonly<Record<string, ObjectSet<ProjectedObject>>>;
}

/**
 * Context: typed ontology client over claim-based World + governed Action.
 * Inputs: compiled `.zoen.ts` bundle and zoend World/Action ports.
 * Outputs: `objects.<Type>` claim projections and `actions.<Name>.preview|commit`.
 * Side effects: World.semanticQuery for reads; Action Propose/Approve/Commit
 * for writes. Cedar stays on zoend. No in-memory belief store.
 *
 * @example
 * const osdk = createOsdkFromCompiled(compiled, { actions, tenantId, world });
 * const line = await osdk.objects.OrderLine.fetch(orderLineId);
 * await line.links.requestReference.fetch();
 * await osdk.actions.recordQuote.preview({ ... });
 * await osdk.actions.recordQuote.commit({ ... });
 */
export function createOsdkFromCompiled(
  compiled: CompiledDefinition,
  options: CreateOsdkOptions,
): OsdkRuntimeClient {
  const model = buildOsdkModel(compiled);
  const definition = options.definition ?? {
    definitionId: compiled.definition.definitionId,
    digest: compiled.digest,
    revision: compiled.definition.revision,
  };
  const objects = createObjectSets({
    definition,
    model,
    tenantId: options.tenantId,
    validAt: options.validAt,
    world: options.world,
  });
  const actions: Record<string, OsdkActionHandle> = {};
  for (const action of model.actions) {
    actions[action.apiName] = createActionHandle({
      action: action.action,
      actions: options.actions,
      definition,
      validAt: options.validAt,
    });
  }
  return { actions, model, objects };
}
