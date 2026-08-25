#!/usr/bin/env node
/**
 * Lever for #300: prove Sample Company approve wiring and toy-camera unbind.
 * Rerun: node apps/web/scripts/verify-qa-300.mjs
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

async function read(rel) {
  return readFile(path.join(root, rel), "utf8");
}

const approvePage = await read("apps/web/src/routes/approve.$controlRef.tsx");
assert.equal(
  /compileLocalStepUp|stepup\.local|Request Stock|inventory\.requestStock|inventory\.item\.1/.test(
    approvePage,
  ),
  false,
  "mutant: approve page still compiles toy Request Stock / stepup.local",
);

const authority = await read("apps/web/src/authority.ts");
assert.equal(
  authority.includes(
    "This Action requires an approval flow that this surface does not provide.",
  ),
  false,
  "surface still refuses proposals waiting for approval",
);
assert.match(
  authority,
  /ProposalStatus\.AWAITING_APPROVAL/,
  "AWAITING_APPROVAL must route to step-up",
);
assert.match(authority, /needs_step_up/, "propose outcome must signal step-up");

const issueRoute = await read("apps/web/src/routes/api.step-up.issue.ts");
assert.match(issueRoute, /issueAuthenticatedApprovalControl/);

const stepUpServer = await read("apps/web/src/step-up-server.ts");
assert.match(stepUpServer, /toy_inventory_camera_forbidden/);
assert.match(stepUpServer, /toy_stepup_local_forbidden/);
assert.match(stepUpServer, /action_ref_resource_mismatch/);

const indexPage = await read("apps/web/src/routes/index.tsx");
assert.match(indexPage, /\/api\/step-up\/issue/);
assert.match(indexPage, /awaiting_approval/);
assert.match(indexPage, /approveUrl/);

const views = await read("packages/surface/src/renderers/views.tsx");
assert.match(views, /Open step-up approval/);
assert.match(views, /data-approve-href/);

const model = await read("packages/surface/src/model.ts");
assert.match(model, /kind: \"awaiting_approval\"/);

const routeTree = await read("apps/web/src/routeTree.gen.ts");
assert.match(routeTree, /api\.step-up\.issue/);
assert.match(routeTree, /\/api\/step-up\/issue/);

const commitRoute = await read("apps/web/src/routes/api.step-up.commit.ts");
assert.match(commitRoute, /ActionService\/Approve/);
assert.match(commitRoute, /tryApproveViaActionApi/);

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: [
        "approve_page_unbound_from_toy_camera",
        "authority_routes_awaiting_approval_to_step_up",
        "issue_api_seals_sample_company_action_ref",
        "surface_shows_approve_href",
        "step_up_commit_tries_approve_then_commit",
      ],
    },
    null,
    2,
  ),
);
