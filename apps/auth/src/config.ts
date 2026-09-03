export type Google =
  | { kind: "unset" }
  | { kind: "set"; clientId: string; clientSecret: string };

export interface DoorConfig {
  baseURL: string;
  betterAuthSecret: string;
  databaseUrl: string;
  deviceExpiresInSeconds: number;
  devicePollIntervalSeconds: number;
  google: Google;
  listenHost: "127.0.0.1";
  listenPort: number;
}

const positiveIntegerPattern = /^[1-9]\d*$/;

function positiveSeconds(
  env: NodeJS.Dict<string>,
  name: string,
  fallback: number
): number {
  const raw = env[name];
  if (raw === undefined) {
    return fallback;
  }
  if (!positiveIntegerPattern.test(raw)) {
    process.stderr.write(`${name}\n`);
    process.exit(1);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    process.stderr.write(`${name}\n`);
    process.exit(1);
  }
  return value;
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
    deviceExpiresInSeconds: positiveSeconds(
      env,
      "ZOEN_DEVICE_EXPIRES_IN_SECONDS",
      1800
    ),
    devicePollIntervalSeconds: positiveSeconds(
      env,
      "ZOEN_DEVICE_POLL_INTERVAL_SECONDS",
      5
    ),
    google: parseGoogle(env),
    listenHost: "127.0.0.1",
    listenPort: 58_704,
  };
}
