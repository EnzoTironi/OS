#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const root = path.resolve(".cache", "e2e");
const lock = path.join(root, "prepare.lock");
const command = process.argv[2] ?? "";

if (command === "acquire") {
  await mkdir(root, { recursive: true });
  const ownerPid = positiveInteger(flag("--owner-pid"));
  const ownerStartedAt = processStartedAt(ownerPid);
  if (ownerStartedAt === null) {
    throw new Error(`prepare owner ${ownerPid} is not alive`);
  }
  const token = randomBytes(32).toString("hex");
  for (let attempt = 0; attempt < 14_400; attempt += 1) {
    try {
      await mkdir(lock);
      await writeFile(
        path.join(lock, "owner.json"),
        `${JSON.stringify({ ownerPid, ownerStartedAt, token, version: 1 }, null, 2)}\n`,
        { flag: "wx" },
      );
      process.stdout.write(`${token}\n`);
      process.exit(0);
    } catch (error) {
      if (code(error) !== "EEXIST") {
        throw error;
      }
    }
    const state = await ownerState();
    if (state === "stale") {
      const stale = `${lock}.stale-${randomBytes(8).toString("hex")}`;
      try {
        await rename(lock, stale);
        await rm(stale, { force: true, recursive: true });
        continue;
      } catch (error) {
        if (code(error) !== "ENOENT") {
          throw error;
        }
      }
    } else if (state === "corrupt") {
      throw new Error(`prepare lock ${lock} is corrupt; reconcile it manually`);
    }
    await delay(250);
  }
  throw new Error("timed out waiting for the e2e preparation writer");
} else if (command === "release") {
  const token = flag("--token");
  const owner = JSON.parse(await readFile(path.join(lock, "owner.json"), "utf8"));
  if (
    owner === null ||
    typeof owner !== "object" ||
    Array.isArray(owner) ||
    owner.token !== token
  ) {
    throw new Error("refusing to release a preparation lock owned by another process");
  }
  const releasing = `${lock}.release-${token.slice(0, 16)}`;
  await rename(lock, releasing);
  await rm(releasing, { force: true, recursive: true });
} else {
  throw new Error(`unknown prepare-lock command ${JSON.stringify(command)}`);
}

async function ownerState() {
  try {
    const owner = JSON.parse(await readFile(path.join(lock, "owner.json"), "utf8"));
    if (
      owner === null ||
      typeof owner !== "object" ||
      Array.isArray(owner) ||
      !Number.isInteger(owner.ownerPid) ||
      typeof owner.ownerStartedAt !== "string"
    ) {
      return "corrupt";
    }
    return processStartedAt(owner.ownerPid) === owner.ownerStartedAt
      ? "live"
      : "stale";
  } catch (error) {
    if (code(error) !== "ENOENT") {
      return "corrupt";
    }
    try {
      const age = Date.now() - (await stat(lock)).mtimeMs;
      return age < 5_000 ? "pending" : "stale";
    } catch (statError) {
      if (code(statError) === "ENOENT") {
        return "stale";
      }
      throw statError;
    }
  }
}

function processStartedAt(pid) {
  const result = spawnSync("ps", ["-o", "lstart=", "-p", String(pid)], {
    encoding: "utf8",
  });
  const value = result.status === 0 ? result.stdout.trim() : "";
  return value === "" ? null : value;
}

function flag(name) {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (value === undefined || value === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}

function positiveInteger(raw) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("--owner-pid must be a positive integer");
  }
  return value;
}

function code(error) {
  return error instanceof Error && "code" in error
    ? Reflect.get(error, "code")
    : undefined;
}
