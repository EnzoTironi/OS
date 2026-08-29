import { betterAuth } from "better-auth";
import { deviceAuthorization } from "better-auth/plugins/device-authorization";
import { Pool } from "pg";
import { loadConfig, type DoorConfig } from "./config.ts";

const googleScopes = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/tasks",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/contacts.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/documents",
] as const;

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
              scope: [...googleScopes],
              disableDefaultScope: true,
              accessType: "offline",
              prompt: "select_account",
            },
          },
        }
      : {}),
    plugins: [deviceAuthorization({ verificationUri: "/device" })],
  });
}

export const config = loadConfig(process.env);
export const auth = createAuth(config);
