import { betterAuth } from "better-auth";
import { deviceAuthorization } from "better-auth/plugins/device-authorization";
import { Pool } from "pg";
import { type DoorConfig, loadConfig } from "./config.ts";

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

export function createAuth(door: DoorConfig) {
  return betterAuth({
    baseURL: door.baseURL,
    database: new Pool({ connectionString: door.databaseUrl }),
    emailAndPassword: { enabled: true },
    secret: door.betterAuthSecret,
    ...(door.google.kind === "set"
      ? {
          socialProviders: {
            google: {
              accessType: "offline",
              clientId: door.google.clientId,
              clientSecret: door.google.clientSecret,
              disableDefaultScope: true,
              prompt: "select_account",
              scope: [...googleScopes],
            },
          },
        }
      : {}),
    plugins: [
      deviceAuthorization({
        expiresIn: `${door.deviceExpiresInSeconds}s`,
        interval: `${door.devicePollIntervalSeconds}s`,
        validateClient: (clientId) => clientId === "zoen",
        verificationUri: "/device",
      }),
    ],
  });
}

export const config = loadConfig(process.env);
export const auth = createAuth(config);
