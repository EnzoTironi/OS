import { CompanyBrain } from "./knowledge.js";
import type { AgentContextAssembler } from "./session.js";

export class CompanyBrainContextAssembler implements AgentContextAssembler {
  readonly #brain: CompanyBrain;

  constructor(brain: CompanyBrain) {
    this.#brain = brain;
  }

  assemble(
    input: Parameters<AgentContextAssembler["assemble"]>[0],
  ) {
    return this.#brain.retrieve(
      input.trustedContext.tenantId,
      input.knowledgeQuery,
    );
  }
}
