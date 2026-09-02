import { defineTool } from "eve/tools";
import { z } from "zod";

import {
  type AppFileText,
  digestAppFiles,
} from "../../../shared/app-files-digest";
import { commitKernelAction } from "../kernel-action";

const SLUG = /^[a-z0-9-]{1,40}$/;

export default defineTool({
  description:
    "Deploy the app files already written under /workspace/apps/<slug>/ through governed kernel Action workshop.deployApp. Returns committed true + receipt only on success — never claim the app is live; the deploy itself finishes asynchronously and the person gets the URL in chat.",
  async execute(input, ctx) {
    try {
      const sandbox = await ctx.getSandbox();
      const root = `/workspace/apps/${input.slug}`;
      const listing = await sandbox.run({
        command: `find ${root} -type f | sort`,
      });
      const absolutes = listing.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      if (listing.exitCode !== 0 || absolutes.length === 0) {
        return {
          committed: false,
          error: `no app files under ${root}`,
        };
      }
      const texts = await Promise.all(
        absolutes.map((absolute) => sandbox.readTextFile({ path: absolute }))
      );
      const files: AppFileText[] = [];
      for (const [index, absolute] of absolutes.entries()) {
        const text = texts[index];
        if (text === null || text === undefined) {
          return { committed: false, error: `could not read ${absolute}` };
        }
        files.push({ path: absolute.slice(root.length + 1), text });
      }
      const filesDigest = digestAppFiles(files);
      const receipt = await commitKernelAction({
        actionId: "workshop.deployApp",
        inputs: [
          { inputId: "slug", value: { textValue: input.slug } },
          { inputId: "summary", value: { textValue: input.summary } },
          { inputId: "filesDigest", value: { textValue: filesDigest } },
          { inputId: "membershipId", value: { textValue: input.membershipId } },
        ],
        resourceId: input.resourceId,
      });
      return { committed: true, receipt };
    } catch (error) {
      return {
        committed: false,
        error:
          error instanceof Error ? error.message : "workshop.deployApp failed",
      };
    }
  },
  inputSchema: z.object({
    membershipId: z.string().min(1),
    resourceId: z.string().min(1).default("workshop.app"),
    slug: z.string().regex(SLUG),
    summary: z.string().min(1),
  }),
});
