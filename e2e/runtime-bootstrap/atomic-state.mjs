import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { realpath, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export async function runtimeRegistryRoot(repository) {
  const common = execFileSync(
    "/usr/bin/git",
    ["rev-parse", "--git-common-dir"],
    { cwd: repository, encoding: "utf8", env: inspectionEnvironment() },
  ).trim();
  return path.join(
    await realpath(path.resolve(repository, common)),
    "zoen-e2e",
    "runtime-v1",
  );
}

export async function writeJsonAtomically(outputPath, value) {
  const temporary = `${outputPath}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    flag: "wx",
  });
  await rename(temporary, outputPath);
}

export function inspectionEnvironment() {
  return { LC_ALL: "C", PATH: "/usr/bin:/bin", TZ: "UTC" };
}

export function code(error) {
  return error instanceof Error && "code" in error
    ? Reflect.get(error, "code")
    : undefined;
}

export async function pathExists(candidate) {
  try {
    await stat(candidate);
    return true;
  } catch (error) {
    if (code(error) === "ENOENT") {
      return false;
    }
    throw error;
  }
}
