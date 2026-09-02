#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const registryPath = fileURLToPath(new URL("./scenarios.json", import.meta.url));
const parsed = JSON.parse(readFileSync(registryPath, "utf8"));

if (!Array.isArray(parsed)) {
  throw new Error("e2e/scenarios.json must be an array");
}

const names = new Set();
const namePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const scenarios = parsed.map((entry) => {
  if (
    entry === null ||
    typeof entry !== "object" ||
    Array.isArray(entry) ||
    typeof entry.name !== "string" ||
    !namePattern.test(entry.name) ||
    (entry.class !== "live" &&
      entry.class !== "credential" &&
      entry.class !== "static") ||
    typeof entry.compose !== "boolean" ||
    !Number.isInteger(entry.weight) ||
    entry.weight < 0 ||
    entry.weight > 4 ||
    typeof entry.ci !== "boolean" ||
    typeof entry.minio !== "boolean" ||
    (entry.realm !== undefined &&
      (typeof entry.realm !== "string" || !namePattern.test(entry.realm)))
  ) {
    throw new Error(`invalid scenario registry entry: ${JSON.stringify(entry)}`);
  }
  if (names.has(entry.name)) {
    throw new Error(`duplicate scenario registry entry: ${entry.name}`);
  }
  if (
    (entry.class === "credential" && entry.weight !== 4) ||
    (entry.class === "live" && entry.weight < 1) ||
    (entry.class === "static" && entry.weight !== 0)
  ) {
    throw new Error(
      `scenario ${entry.name} has invalid ${entry.class} weight ${entry.weight}`,
    );
  }
  names.add(entry.name);
  return Object.freeze(entry);
});

function select(selector) {
  if (selector === "all") {
    return scenarios;
  }
  if (selector === "live") {
    return scenarios.filter((scenario) => scenario.class === "live");
  }
  if (selector === "ci") {
    return scenarios.filter((scenario) => scenario.ci);
  }
  const scenario = scenarios.find((candidate) => candidate.name === selector);
  if (scenario === undefined) {
    throw new Error(`unknown scenario ${JSON.stringify(selector)}`);
  }
  return [scenario];
}

const [command = "names", selector = "all"] = process.argv.slice(2);
const selected = select(selector);

switch (command) {
  case "names":
    process.stdout.write(`${selected.map((scenario) => scenario.name).join(" ")}\n`);
    break;
  case "rows":
    for (const scenario of selected) {
      process.stdout.write(
        [
          scenario.name,
          scenario.class,
          scenario.compose ? "compose" : "host",
          String(scenario.weight),
          scenario.realm ?? "",
          scenario.minio ? "minio" : "",
          scenario.ci ? "ci" : "",
        ].join("|") + "\n",
      );
    }
    break;
  case "json":
    process.stdout.write(`${JSON.stringify(selected)}\n`);
    break;
  case "matrix":
    process.stdout.write(
      `${JSON.stringify({ scenario: selected.map((scenario) => scenario.name) })}\n`,
    );
    break;
  case "max-weight":
    process.stdout.write(`${Math.max(...selected.map((scenario) => scenario.weight))}\n`);
    break;
  default:
    throw new Error(`unknown registry command ${JSON.stringify(command)}`);
}
