import { betterAuth } from "better-auth";
import { deviceAuthorization } from "better-auth/plugins/device-authorization";
import { Pool } from "pg";
import { loadConfig, type DoorConfig } from "./config.ts";

export function createAuth(config: DoorConfig) {
  return betterAuth({
    database: new Pool({ connectionString: config.databaseUrl }),
    baseURL: config.baseURL,
    secret: config.betterAuthSecret,
    ...(config.google.kind === "set"
      ? {
          socialProviders: {
            google: {
              clientId: config.google.clientId,
              clientSecret: config.google.clientSecret,
            },
          },
        }
      : {}),
    plugins: [deviceAuthorization({ verificationUri: "/device" })],
  });
}

export const config = loadConfig(process.env);
export const auth = createAuth(config);
