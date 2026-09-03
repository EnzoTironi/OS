export type Google =
  | { kind: "unset" }
  | { kind: "set"; clientId: string; clientSecret: string };

export interface DoorConfig {
  baseURL: string;
  betterAuthSecret: string;
  databaseUrl: string;
  google: Google;
  listenHost: "127.0.0.1";
  listenPort: number;
}

function required(env: NodeJS.Dict<string>, name: string): string {
  const value = env[name];
  if (value === undefined || value.length === 0) {
    process.stderr.write(`${name}\n`);
    process.exit(1);
  }
  return value;
}

function parseGoogle(env: NodeJS.Dict<string>): Google {
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  if (
    clientId === undefined ||
    clientId.length === 0 ||
    clientSecret === undefined ||
    clientSecret.length === 0
  ) {
    return { kind: "unset" };
  }
  return { clientId, clientSecret, kind: "set" };
}

export function loadConfig(env: NodeJS.Dict<string>): DoorConfig {
  return {
    baseURL: required(env, "BETTER_AUTH_URL"),
    betterAuthSecret: required(env, "BETTER_AUTH_SECRET"),
    databaseUrl: required(env, "DATABASE_URL"),
    google: parseGoogle(env),
    listenHost: "127.0.0.1",
    listenPort: 58_704,
  };
}
