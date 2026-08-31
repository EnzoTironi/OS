import { defineTool } from "eve/tools";
import { z } from "zod";

import { commitKernelAction } from "../kernel-action";

export default defineTool({
  description:
    "Persist a personal reminder through kernel Action personal.createReminder. Returns a commit receipt only on success. If this fails, tell the person you could not save — never invent a save.",
  async execute(input) {
    try {
      const receipt = await commitKernelAction({
        actionId: "personal.createReminder",
        inputs: [
          { inputId: "body", value: { textValue: input.body } },
          { inputId: "dueAt", value: { textValue: input.dueAt } },
        ],
        resourceId: input.resourceId,
      });
      return { committed: true, receipt };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "personal.createReminder failed";
      return { committed: false, error: message };
    }
  },
  inputSchema: z.object({
    body: z.string().min(1),
    dueAt: z.string().min(1),
    resourceId: z.string().min(1).default("personal.reminder"),
  }),
});
