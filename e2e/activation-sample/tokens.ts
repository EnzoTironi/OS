import assert from "node:assert/strict";
import { z } from "zod";
import { e2eHttpUrl } from "../host-env.js";

const oidcIssuer = e2eHttpUrl(
  "ZOEN_E2E_KEYCLOAK_PORT",
  58_350,
  "/realms/zoen",
);
const tokenResponseSchema = z
  .object({ access_token: z.string().min(1) })
  .passthrough();

export async function passwordToken(username: string): Promise<string> {
  const response = await fetch(`${oidcIssuer}/protocol/openid-connect/token`, {
    body: new URLSearchParams({
      client_id: "zoen-web",
      grant_type: "password",
      password: "web-password",
      username,
    }),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  const body: unknown = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return tokenResponseSchema.parse(body).access_token;
}
