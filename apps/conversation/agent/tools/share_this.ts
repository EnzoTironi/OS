import { defineTool } from "eve/tools";
import { z } from "zod";

import { commitKernelAction } from "../kernel-action";

export default defineTool({
  description:
    "Share a belief by writing a DAC share Relation. Kernel Action zoen.world.share. Does not rewrite classifiedAs.",
  inputSchema: z.object({
    resourceId: z.string().min(1),
    with: z.string().min(1),
  }),
  async execute(input) {
    return commitKernelAction({
      actionId: "zoen.world.share",
      resourceId: input.resourceId,
      inputs: [{ inputId: "with", value: { textValue: input.with } }],
    });
  },
});
