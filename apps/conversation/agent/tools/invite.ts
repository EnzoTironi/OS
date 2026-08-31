import { defineTool } from "eve/tools";
import { z } from "zod";

import { commitKernelAction } from "../kernel-action";

export default defineTool({
  description:
    "Invite a person into this world. Kernel Action zoen.world.invite. Default clearance zoen.world.floor.",
  execute(input) {
    return commitKernelAction({
      actionId: "zoen.world.invite",
      inputs: [
        { inputId: "accountId", value: { textValue: input.accountId } },
        { inputId: "actorId", value: { textValue: input.actorId } },
        { inputId: "principalId", value: { textValue: input.principalId } },
        { inputId: "token", value: { textValue: input.token } },
        { inputId: "workloadId", value: { textValue: input.workloadId } },
      ],
      resourceId: input.resourceId,
    });
  },
  inputSchema: z.object({
    accountId: z.string().min(1),
    actorId: z.string().min(1),
    principalId: z.string().min(1),
    resourceId: z.string().min(1),
    token: z.string().min(1),
    workloadId: z.string().min(1),
  }),
});
