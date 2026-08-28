export type Google =
  | { kind: "unset" }
  | { kind: "set"; clientId: string; clientSecret: string };

export type DoorConfig = {
  databaseUrl: string;
  betterAuthSecret: string;
  baseURL: string;
  listenHost: "127.0.0.1";
  listenPort: number;
  google: Google;
};

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
  return { kind: "set", clientId, clientSecret };
}

export function loadConfig(env: NodeJS.Dict<string>): DoorConfig {
  return {
    databaseUrl: required(env, "DATABASE_URL"),
    betterAuthSecret: required(env, "BETTER_AUTH_SECRET"),
    baseURL: required(env, "BETTER_AUTH_URL"),
    listenHost: "127.0.0.1",
    listenPort: 58704,
    google: parseGoogle(env),
  };
}
