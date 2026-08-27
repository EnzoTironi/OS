import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.join(process.cwd(), "deploy", "helm", "zoen");
const forbidden = [
  {
    id: "literal-replication-env",
    pattern: /POSTGRES_REPLICATION_PASSWORD[\s\S]{0,80}value:\s*replicator/u,
  },
  {
    id: "literal-replication-sql",
    pattern: /PASSWORD\s+'replicator'/u,
  },
  {
    id: "literal-replication-default",
    pattern: /POSTGRES_REPLICATION_PASSWORD:-replicator/u,
  },
  {
    id: "literal-projection-username-password",
    pattern: /PASSWORD\s+'\{\{\s*\.Values\.postgres\.projectionUser\s*\}\}'/u,
  },
  {
    id: "literal-projection-sql",
    pattern: /PASSWORD\s+'zoen_projection'/u,
  },
];

const files = await walk(root);
const hits = [];
for (const file of files) {
  const text = await readFile(file, "utf8");
  for (const rule of forbidden) {
    if (rule.pattern.test(text)) {
      hits.push({
        rule: rule.id,
        file: path.relative(process.cwd(), file),
      });
    }
  }
}

if (hits.length > 0) {
  process.stderr.write(
    `${JSON.stringify({ rule: "helm-secret-literals", hits }, null, 2)}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    `${JSON.stringify({
      rule: "helm-secret-literals",
      filesScanned: files.length,
      hits: [],
    })}\n`,
  );
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
      continue;
    }
    files.push(full);
  }
  return files;
}
