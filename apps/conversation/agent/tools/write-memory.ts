import { defineTool } from "eve/tools";
import { z } from "zod";

import { commitKernelAction } from "../kernel-action";

export default defineTool({
  description:
    "Persist a personal memory note through kernel Action personal.writeMemory. Returns a commit receipt only on success. If this fails, tell the person you could not save — never invent a save.",
  async execute(input) {
    try {
      const receipt = await commitKernelAction({
        actionId: "personal.writeMemory",
        inputs: [{ inputId: "body", value: { textValue: input.body } }],
        resourceId: input.resourceId,
      });
      return { committed: true, receipt };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "personal.writeMemory failed";
      return { committed: false, error: message };
    }
  },
  inputSchema: z.object({
    body: z.string().min(1),
    resourceId: z.string().min(1).default("personal.note"),
  }),
});
