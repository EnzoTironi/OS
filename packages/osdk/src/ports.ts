import type {
  ApproveRequest,
  ApproveResponse,
  CommitRequest,
  CommitResponse,
  ProposeRequest,
  ProposeResponse,
} from "../../sdk/src/gen/zoen/action/v1/action_pb.js";
import type {
  DefinitionReference,
  SemanticQueryRequest,
  SemanticQueryResponse,
} from "../../sdk/src/gen/zoen/world/v1/world_pb.js";

/**
 * Live `DefinitionReference` from World/Action RPCs. `revision` is bigint
 * on the wire; compileDefinition's number is converted at the boundary.
 */
export type OsdkDefinitionRef = Pick<
  DefinitionReference,
  "definitionId" | "digest" | "revision"
>;

/**
 * Live World read. No `recordEvidence` — belief writes go through Action.
 */
export type OsdkWorld = {
  semanticQuery(request: SemanticQueryRequest): Promise<SemanticQueryResponse>;
};

/**
 * Live ActionService subset used by preview (`propose`) and commit
 * (`propose` → `approve` when awaiting → `commit`). Cedar stays on zoend.
 */
export type OsdkActionsPort = {
  approve(request: ApproveRequest): Promise<ApproveResponse>;
  commit(request: CommitRequest): Promise<CommitResponse>;
  propose(request: ProposeRequest): Promise<ProposeResponse>;
};
