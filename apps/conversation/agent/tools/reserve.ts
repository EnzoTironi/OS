import { defineTool } from "eve/tools";
import { z } from "zod";

import { commitKernelAction } from "../kernel-action";

export default defineTool({
  description:
    "Reserve a belief with a sealed classifiedAs write. Kernel Action zoen.world.reserve.",
  execute(input) {
    return commitKernelAction({
      actionId: "zoen.world.reserve",
      inputs: [{ inputId: "token", value: { textValue: input.token } }],
      resourceId: input.resourceId,
    });
  },
  inputSchema: z.object({
    resourceId: z.string().min(1),
    token: z.string().min(1),
  }),
});
