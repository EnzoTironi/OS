import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { Client as PostgresClient } from "pg";

const required = [
  "DATABASE_URL",
  "S3_ACCESS_KEY_ID",
  "S3_ALLOW_HTTP",
  "S3_BUCKET",
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_SECRET_ACCESS_KEY",
  "ZOEN_CONFIG_VERSION",
  "ZOEN_MIGRATION_COMPATIBILITY",
  "ZOEN_OIDC_DISCOVERY_URL",
  "ZOEN_OIDC_ISSUER",
  "ZOEN_RESTATE_ADMIN_URL",
  "ZOEN_TENANT_AWARENESS",
];

for (const name of required) {
  if (process.env[name] === undefined || process.env[name] === "") {
    throw new Error(`${name} is required`);
  }
}

if (process.env.ZOEN_CONFIG_VERSION !== "zoen.config.v1") {
  throw new Error(`unsupported config version ${process.env.ZOEN_CONFIG_VERSION}`);
}
if (!["current", "previous"].includes(process.env.ZOEN_MIGRATION_COMPATIBILITY)) {
  throw new Error(
    `incompatible migration preflight ${process.env.ZOEN_MIGRATION_COMPATIBILITY}`,
  );
}
if (process.env.ZOEN_TENANT_AWARENESS !== "true") {
  throw new Error("tenant awareness cannot be disabled");
}

const postgres = new PostgresClient({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5_000,
});
await postgres.connect();
try {
  const version = await postgres.query("SHOW server_version");
  const serverVersion = version.rows[0]?.server_version;
  if (typeof serverVersion !== "string" || !serverVersion.startsWith("18.")) {
    throw new Error(`Postgres 18 is required, received ${String(serverVersion)}`);
  }
} finally {
  await postgres.end();
}

const s3 = new S3Client({
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: true,
  region: process.env.S3_REGION,
});
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 5_000);
try {
  await s3.send(
    new HeadBucketCommand({ Bucket: process.env.S3_BUCKET }),
    { abortSignal: controller.signal },
  );
} finally {
  clearTimeout(timeout);
  s3.destroy();
}

const oidc = await fetch(process.env.ZOEN_OIDC_DISCOVERY_URL, {
  signal: AbortSignal.timeout(5_000),
});
if (!oidc.ok) {
  throw new Error(`OIDC discovery returned HTTP ${oidc.status}`);
}
const discovery = await oidc.json();
if (
  typeof discovery !== "object" ||
  discovery === null ||
  discovery.issuer !== process.env.ZOEN_OIDC_ISSUER
) {
  throw new Error("OIDC discovery issuer does not match ZOEN_OIDC_ISSUER");
}

const restate = await fetch(`${process.env.ZOEN_RESTATE_ADMIN_URL}/health`, {
  signal: AbortSignal.timeout(5_000),
});
if (!restate.ok) {
  throw new Error(`Restate health returned HTTP ${restate.status}`);
}
