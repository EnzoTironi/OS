import { defineTool } from "eve/tools";
import { z } from "zod";

import { commitKernelAction } from "../kernel-action";

export default defineTool({
  description:
    "Reserve a belief with a sealed classifiedAs write. Kernel Action zoen.world.reserve.",
  inputSchema: z.object({
    resourceId: z.string().min(1),
    token: z.string().min(1),
  }),
  async execute(input) {
    return commitKernelAction({
      actionId: "zoen.world.reserve",
      resourceId: input.resourceId,
      inputs: [{ inputId: "token", value: { textValue: input.token } }],
    });
  },
});
