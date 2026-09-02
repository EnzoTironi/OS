import { createWriteStream } from "node:fs";
import { createHash } from "node:crypto";
import {
  accessSync,
  constants,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";

const expectedKacheVersion = "0.16.0";
const samplesInput = process.env.KACHE_BENCH_SAMPLES ?? "3";
const thresholdInput = process.env.KACHE_BENCH_THRESHOLD_PERCENT ?? "20";
const jobsInput = process.env.KACHE_BENCH_JOBS ?? "10";
const maxAttemptsInput = process.env.KACHE_BENCH_MAX_ATTEMPTS ?? "5";
const samples = Number(samplesInput);
const thresholdPercent = Number(thresholdInput);
const jobs = Number(jobsInput);
const maxAttempts = Number(maxAttemptsInput);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRepository = path.resolve(scriptDirectory, "..");
const compilerQuietPeriodMilliseconds = 10_000;
const compilerQuietTimeoutMilliseconds = 10 * 60_000;
const compilerNames = new Set([
  "cargo",
  "clang",
  "clang++",
  "ld",
  "ld64",
  "rustc",
]);

function runningProcesses() {
  const result = spawnSync("ps", ["-axo", "pid=,ppid=,comm="], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "cannot inspect running processes");
  }
  return result.stdout
    .split("\n")
    .flatMap((line) => {
      const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/);
      return match
        ? [
            {
              command: match[3],
              pid: Number.parseInt(match[1], 10),
              ppid: Number.parseInt(match[2], 10),
            },
          ]
        : [];
    });
}

function competingCompilers(ownedRootPid) {
  const processes = runningProcesses();
  const owned = new Set(ownedRootPid === undefined ? [] : [ownedRootPid]);
  let foundDescendant = true;
  while (foundDescendant) {
    foundDescendant = false;
    for (const process of processes) {
      if (!owned.has(process.pid) && owned.has(process.ppid)) {
        owned.add(process.pid);
        foundDescendant = true;
      }
    }
  }
  return processes.filter(
    (process) =>
      !owned.has(process.pid) &&
      compilerNames.has(path.basename(process.command)),
  );
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForCompilerQuietWindow() {
  const startedAt = performance.now();
  let quietSince;
  let announcedWait = false;
  while (performance.now() - startedAt < compilerQuietTimeoutMilliseconds) {
    const competitors = competingCompilers();
    if (competitors.length === 0) {
      quietSince ??= performance.now();
      if (performance.now() - quietSince >= compilerQuietPeriodMilliseconds) {
        return;
      }
    } else {
      quietSince = undefined;
      if (!announcedWait) {
        console.log(
          `Waiting for ${competitors.length} external compiler process(es) to finish`,
        );
        announcedWait = true;
      }
    }
    await delay(2_000);
  }
  throw new Error("external compilers did not become quiet within 10 minutes");
}

if (!/^\d+$/.test(samplesInput) || !Number.isSafeInteger(samples) || samples < 3) {
  throw new Error("KACHE_BENCH_SAMPLES must be an integer of at least 3");
}
if (
  !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(thresholdInput) ||
  !Number.isFinite(thresholdPercent) ||
  thresholdPercent <= 0
) {
  throw new Error("KACHE_BENCH_THRESHOLD_PERCENT must be positive");
}
if (!/^\d+$/.test(jobsInput) || !Number.isSafeInteger(jobs) || jobs < 1) {
  throw new Error("KACHE_BENCH_JOBS must be a positive integer");
}
if (
  !/^\d+$/.test(maxAttemptsInput) ||
  !Number.isSafeInteger(maxAttempts) ||
  maxAttempts < 1
) {
  throw new Error("KACHE_BENCH_MAX_ATTEMPTS must be a positive integer");
}

const trackedStatus = spawnSync(
  "git",
  ["status", "--porcelain", "--untracked-files=no"],
  { cwd: workspaceRepository, encoding: "utf8" },
);
if (trackedStatus.status !== 0) {
  throw new Error(trackedStatus.stderr.trim() || "git status failed");
}
if (trackedStatus.stdout.trim() !== "") {
  throw new Error("commit or stash tracked changes before benchmarking");
}
const trackedScript = spawnSync(
  "git",
  ["ls-files", "--error-unmatch", "scripts/benchmark-kache.mjs"],
  { cwd: workspaceRepository, encoding: "utf8" },
);
if (trackedScript.status !== 0) {
  throw new Error("commit scripts/benchmark-kache.mjs before benchmarking");
}

const kacheBinary = process.env.KACHE_BIN ?? "kache";
const versionResult = spawnSync(kacheBinary, ["--version"], {
  cwd: workspaceRepository,
  encoding: "utf8",
});
if (versionResult.status !== 0) {
  throw new Error(
    `cannot execute ${kacheBinary}; install kache ${expectedKacheVersion} first`,
  );
}
const version = versionResult.stdout.trim();
if (version !== `kache ${expectedKacheVersion}`) {
  throw new Error(
    `expected kache ${expectedKacheVersion}, received ${version || "no version"}`,
  );
}

const requestedOutput = process.env.KACHE_BENCH_DIR;
const outputDirectory = requestedOutput
  ? path.resolve(requestedOutput)
  : mkdtempSync(path.join(tmpdir(), "zoen-kache-benchmark-"));
if (requestedOutput) {
  mkdirSync(outputDirectory, { recursive: false });
}
const logsDirectory = path.join(outputDirectory, "logs");
const targetsDirectory = path.join(outputDirectory, "targets");
const cacheDirectory = path.join(outputDirectory, "cache");
const runtimesDirectory = path.join(outputDirectory, "runtimes");
const reportsDirectory = path.join(outputDirectory, "reports");
const sourceDirectory = path.join(outputDirectory, "source");
const kacheConfig = path.join(outputDirectory, "kache.toml");
mkdirSync(logsDirectory);
mkdirSync(targetsDirectory);
mkdirSync(cacheDirectory);
mkdirSync(runtimesDirectory);
mkdirSync(reportsDirectory);
const discardedResults = [];
writeFileSync(
  kacheConfig,
  '[cache]\nevent_log_max_size = "8GiB"\nevent_log_keep_lines = 100000\n',
);

const commitResult = spawnSync("git", ["rev-parse", "HEAD"], {
  cwd: workspaceRepository,
  encoding: "utf8",
});
if (commitResult.status !== 0) {
  throw new Error(commitResult.stderr.trim() || "cannot resolve HEAD");
}
const benchmarkCommit = commitResult.stdout.trim();
const worktreeResult = spawnSync(
  "git",
  ["worktree", "add", "--detach", sourceDirectory, benchmarkCommit],
  { cwd: workspaceRepository, encoding: "utf8" },
);
if (worktreeResult.status !== 0) {
  throw new Error(worktreeResult.stderr.trim() || "cannot create benchmark worktree");
}
let worktreeActive = true;
function removeBenchmarkWorktree() {
  if (!worktreeActive) {
    return;
  }
  const result = spawnSync("git", ["worktree", "remove", sourceDirectory], {
    cwd: workspaceRepository,
    encoding: "utf8",
  });
  if (result.status === 0) {
    worktreeActive = false;
  } else {
    process.stderr.write(
      `Could not remove temporary worktree ${sourceDirectory}: ${(result.stderr || result.stdout).trim()}\n`,
    );
  }
}
process.once("exit", removeBenchmarkWorktree);

const repository = sourceDirectory;

const cleanEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith("KACHE_")),
);
const commonEnvironment = {
  ...cleanEnvironment,
  CARGO_TERM_COLOR: "never",
  KACHE_CACHE_DIR: cacheDirectory,
  KACHE_CONFIG: kacheConfig,
  KACHE_LOCAL_ONLY: "1",
  KACHE_CACHE_EXECUTABLES: "1",
  KACHE_EVENT_ROOT: repository,
  RUSTC_WORKSPACE_WRAPPER: "",
  TERM: "dumb",
};

const expectedBinaries = [
  "zoen",
  "zoen-effect-dispatcher",
  "zoen-http-connector",
  "zoen-projection",
];

function safeRemoveTarget(targetDirectory) {
  const relative = path.relative(targetsDirectory, targetDirectory);
  if (
    relative === "" ||
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`refusing to remove unsafe target path: ${targetDirectory}`);
  }
  rmSync(targetDirectory, { force: true, recursive: true });
}

async function runLogged(label, command, args, environment) {
  const logPath = path.join(logsDirectory, `${label}.log`);
  const competitionPath = path.join(logsDirectory, `${label}.competition.tsv`);
  const log = createWriteStream(logPath, { flags: "wx" });
  const startedAt = performance.now();
  const child = spawn(command, args, {
    cwd: repository,
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const observedCompetition = new Map();
  let monitorError;
  const inspectCompetition = () => {
    try {
      for (const process of competingCompilers(child.pid)) {
        if (!observedCompetition.has(process.pid)) {
          observedCompetition.set(process.pid, {
            ...process,
            firstSeen: new Date().toISOString(),
          });
        }
      }
    } catch (error) {
      monitorError = error;
    }
  };
  inspectCompetition();
  const monitor = setInterval(inspectCompetition, 2000);
  child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    log.write(chunk);
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
    log.write(chunk);
  });
  let elapsedMilliseconds;
  let status;
  try {
    status = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    elapsedMilliseconds = Math.round(performance.now() - startedAt);
  } finally {
    clearInterval(monitor);
    if (child.pid !== undefined) {
      inspectCompetition();
    }
    await new Promise((resolve, reject) => {
      log.end((error) => (error ? reject(error) : resolve()));
    });
  }
  if (status !== 0) {
    throw new Error(`${label} failed with exit code ${status}; see ${logPath}`);
  }
  if (monitorError) {
    throw new Error(`${label} could not monitor competing compilers: ${monitorError.message}`);
  }
  if (observedCompetition.size > 0) {
    const rows = ["pid\tppid\tfirst_seen\tcommand"];
    for (const process of observedCompetition.values()) {
      rows.push(
        [process.pid, process.ppid, process.firstSeen, process.command].join("\t"),
      );
    }
    writeFileSync(competitionPath, `${rows.join("\n")}\n`);
  }
  return {
    competitionPath:
      observedCompetition.size > 0 ? competitionPath : undefined,
    competingCompilerCount: observedCompetition.size,
    elapsedMilliseconds,
    logPath,
  };
}

async function build(kind, sample, attempt = 1) {
  const label =
    sample === "warmup"
      ? `${kind}-${sample}`
      : `${kind}-${sample}-attempt-${attempt}`;
  const targetDirectory = path.join(targetsDirectory, "current");
  const runtimeDirectory = path.join(runtimesDirectory, label);
  mkdirSync(targetDirectory);
  mkdirSync(runtimeDirectory);
  const environment = {
    ...commonEnvironment,
    CARGO_TARGET_DIR: targetDirectory,
    KACHE_RUNTIME_DIR: runtimeDirectory,
    RUSTC_WRAPPER: kind === "treatment" ? kacheBinary : "",
  };
  try {
    const result = await runLogged(
      label,
      "cargo",
      [
        "build",
        "--locked",
        "--offline",
        "--workspace",
        "--jobs",
        String(jobs),
      ],
      environment,
    );
    for (const binaryName of expectedBinaries) {
      const binaryPath = path.join(targetDirectory, "debug", binaryName);
      if (!statSync(binaryPath).isFile()) {
        throw new Error(`${label} did not produce ${binaryName}`);
      }
      accessSync(binaryPath, constants.X_OK);
    }
    const binary = path.join(targetDirectory, "debug", expectedBinaries[0]);
    const binaryResult = spawnSync(binary, ["--version"], {
      cwd: repository,
      encoding: "utf8",
    });
    if (binaryResult.status !== 0 || binaryResult.stdout.trim() !== "zoen 0.1.0") {
      throw new Error(`${label} produced an unusable zoen binary`);
    }
    const report =
      kind === "treatment"
        ? captureReport(label, environment, sample === "warmup")
        : undefined;
    return {
      ...result,
      attempt,
      binaryVersion: binaryResult.stdout.trim(),
      kind,
      report,
      sample,
    };
  } finally {
    safeRemoveTarget(targetDirectory);
  }
}

function captureReport(label, environment, isWarmup) {
  const reportPath = path.join(reportsDirectory, `${label}.json`);
  const reportResult = spawnSync(
    kacheBinary,
    [
      "report",
      "--format",
      "json",
      "--since",
      "24h",
      "--root",
      repository,
      "--output",
      reportPath,
    ],
    { cwd: repository, encoding: "utf8", env: environment },
  );
  if (reportResult.status !== 0) {
    return {
      failures: [
        `report failed: ${(reportResult.stderr || reportResult.stdout).trim()}`,
      ],
      reportPath,
      summary: undefined,
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(reportPath, "utf8"));
    const summary = parsed.summary;
    if (!summary || typeof summary !== "object") {
      return {
        failures: ["report has no summary"],
        reportPath,
        summary: undefined,
      };
    }
    const failures = [];
    for (const field of [
      "errors",
      "fallbacks",
      "skipped",
      "store_failures",
    ]) {
      if (summary[field] !== 0) {
        failures.push(`${field}=${String(summary[field])}`);
      }
    }
    if (!(summary.total_crates > 0)) {
      failures.push(`total_crates=${String(summary.total_crates)}`);
    }
    if (isWarmup) {
      if (!(summary.misses > 0)) {
        failures.push(`misses=${String(summary.misses)}`);
      }
      const accountedCrates =
        summary.local_hits +
        summary.prefetch_hits +
        summary.remote_hits +
        summary.dups +
        summary.misses;
      if (accountedCrates !== summary.total_crates) {
        failures.push(
          `accounted_crates=${String(accountedCrates)} of total_crates=${String(summary.total_crates)}`,
        );
      }
    } else {
      for (const field of ["dups", "misses"]) {
        if (summary[field] !== 0) {
          failures.push(`${field}=${String(summary[field])}`);
        }
      }
      if (!(summary.local_hits > 0)) {
        failures.push(`local_hits=${String(summary.local_hits)}`);
      }
      if (!(summary.weighted_hit_rate_pct >= 90)) {
        failures.push(
          `weighted_hit_rate_pct=${String(summary.weighted_hit_rate_pct)}`,
        );
      }
    }
    if (!isWarmup && summary.local_hits !== summary.total_crates) {
      failures.push(
        `local_hits=${String(summary.local_hits)} of total_crates=${String(summary.total_crates)}`,
      );
    }
    const bypassSignature = (parsed.bypass?.reasons ?? [])
      .map(({ count, failures: bypassFailures, reason, result, route }) => ({
        count,
        failures: bypassFailures,
        reason,
        result,
        route,
      }))
      .sort((left, right) => left.reason.localeCompare(right.reason));
    return { bypassSignature, failures, reportPath, summary };
  } catch (error) {
    return {
      failures: [`cannot parse report: ${error.message}`],
      reportPath,
      summary: undefined,
    };
  }
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? Math.round((ordered[middle - 1] + ordered[middle]) / 2)
    : ordered[middle];
}

function treatmentReportFailures(result, warmup) {
  const failures = [...(result.report?.failures ?? ["report unavailable"])];
  const expectedTotalCrates = warmup.report?.summary?.total_crates;
  const expectedPassthroughs = warmup.report?.summary?.passthroughs;
  const expectedBypassSignature = JSON.stringify(
    warmup.report?.bypassSignature,
  );
  if (
    result.report?.summary &&
    expectedTotalCrates !== undefined &&
    result.report.summary.total_crates !== expectedTotalCrates
  ) {
    failures.push(
      `total_crates=${String(result.report.summary.total_crates)}, warmup=${String(expectedTotalCrates)}`,
    );
  }
  if (
    result.report?.summary &&
    expectedPassthroughs !== undefined &&
    result.report.summary.passthroughs !== expectedPassthroughs
  ) {
    failures.push(
      `passthroughs=${String(result.report.summary.passthroughs)}, warmup=${String(expectedPassthroughs)}`,
    );
  }
  if (
    result.report?.bypassSignature &&
    expectedBypassSignature !== undefined &&
    JSON.stringify(result.report.bypassSignature) !== expectedBypassSignature
  ) {
    failures.push("passthrough reasons differ from warmup");
  }
  return failures;
}

function recordDiscardedResult(result) {
  discardedResults.push(result);
  const rows = [
    "kind\tsample\tattempt\telapsed_ms\tcompeting_compilers\tlog\tcompetition\treport",
    ...discardedResults.map((discarded) =>
      [
        discarded.kind,
        discarded.sample,
        discarded.attempt,
        discarded.elapsedMilliseconds,
        discarded.competingCompilerCount,
        path.relative(outputDirectory, discarded.logPath),
        path.relative(outputDirectory, discarded.competitionPath),
        discarded.report
          ? path.relative(outputDirectory, discarded.report.reportPath)
          : "",
      ].join("\t"),
    ),
  ];
  writeFileSync(
    path.join(outputDirectory, "discarded.tsv"),
    `${rows.join("\n")}\n`,
  );
}

async function runUncontaminatedSample(kind, sample, warmup) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await waitForCompilerQuietWindow();
    console.log(
      `Running ${kind} sample ${sample}/${samples}, attempt ${attempt}/${maxAttempts}`,
    );
    const result = await build(kind, sample, attempt);
    if (result.competingCompilerCount === 0) {
      return result;
    }
    recordDiscardedResult(result);
    const competition = path.relative(
      outputDirectory,
      result.competitionPath,
    );
    if (kind === "treatment") {
      const failures = treatmentReportFailures(result, warmup);
      if (failures.length > 0) {
        throw new Error(
          `${kind} sample ${sample} was contaminated and changed or failed the cache: ${failures.join("; ")}`,
        );
      }
    }
    console.log(
      `Discarding contaminated ${kind} sample ${sample} attempt ${attempt}; evidence: ${competition}`,
    );
  }
  throw new Error(
    `${kind} sample ${sample} remained contaminated for ${maxAttempts} attempts`,
  );
}

writeFileSync(
  path.join(outputDirectory, "claim.md"),
  `# Kache benchmark claim\n\n` +
    `Kache ${expectedKacheVersion} must reduce the median wall time of ` +
    `\`cargo build --locked --offline --workspace --jobs ${jobs}\` with a new target directory by at ` +
    `least ${thresholdPercent}%, across ${samples} uncontaminated samples on the same machine.\n`,
);

const environmentFacts = [
  ["commit", ["git", ["rev-parse", "HEAD"]]],
  ["rustc", ["rustc", ["--version"]]],
  ["cargo", ["cargo", ["--version"]]],
];
const scriptHash = createHash("sha256")
  .update(readFileSync(path.join(repository, "scripts", "benchmark-kache.mjs")))
  .digest("hex");
const environmentLines = [
  `kache=${version}`,
  `jobs=${jobs}`,
  `max_attempts=${maxAttempts}`,
  `quiet_period_ms=${compilerQuietPeriodMilliseconds}`,
  `benchmark_script_sha256=${scriptHash}`,
];
for (const [label, [command, args]] of environmentFacts) {
  const result = spawnSync(command, args, { cwd: repository, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
  environmentLines.push(`${label}=${result.stdout.trim()}`);
}
writeFileSync(
  path.join(outputDirectory, "environment.txt"),
  `${environmentLines.join("\n")}\n`,
);

console.log(`Artifacts: ${outputDirectory}`);
console.log("Fetching locked dependencies before measurement");
await runLogged("fetch", "cargo", ["fetch", "--locked"], {
  ...commonEnvironment,
  KACHE_RUNTIME_DIR: path.join(runtimesDirectory, "fetch"),
  RUSTC_WRAPPER: "",
});

console.log("Warming the isolated Kache store");
const warmup = await build("treatment", "warmup");

const results = [];
for (let sample = 1; sample <= samples; sample += 1) {
  const order =
    sample % 2 === 1
      ? ["baseline", "treatment"]
      : ["treatment", "baseline"];
  for (const kind of order) {
    const result = await runUncontaminatedSample(kind, sample, warmup);
    results.push(result);
    console.log(
      `${kind} sample ${sample}: ${(result.elapsedMilliseconds / 1000).toFixed(2)}s`,
    );
  }
}

const baselineMedian = median(
  results
    .filter((result) => result.kind === "baseline")
    .map((result) => result.elapsedMilliseconds),
);
const treatmentMedian = median(
  results
    .filter((result) => result.kind === "treatment")
    .map((result) => result.elapsedMilliseconds),
);
const improvementPercent =
  ((baselineMedian - treatmentMedian) / baselineMedian) * 100;
const treatmentResults = results.filter((result) => result.kind === "treatment");
const expectedTotalCrates = warmup.report?.summary?.total_crates;
const expectedPassthroughs = warmup.report?.summary?.passthroughs;
const reportFailures = [
  ...(warmup.report?.failures ?? ["report unavailable"]).map(
    (failure) => `warmup: ${failure}`,
  ),
  ...treatmentResults.flatMap((result) =>
    treatmentReportFailures(result, warmup).map(
      (failure) => `treatment-${result.sample}: ${failure}`,
    ),
  ),
];
const reportsParseable =
  warmup.report?.summary !== undefined &&
  treatmentResults.every((result) => result.report?.summary !== undefined);
const cacheHealthy = reportsParseable && reportFailures.length === 0;
const verdict = !reportsParseable
  ? "INCONCLUSIVE"
  : improvementPercent >= thresholdPercent && cacheHealthy
    ? "VERIFIED"
    : "NOT VERIFIED";

const rows = [
  "kind\tsample\tattempt\telapsed_ms\tbinary\tlocal_hits\tmisses\tdups\tpassthroughs\tweighted_hit_rate_pct\tlog\treport",
];
for (const result of results) {
  const summary = result.report?.summary;
  rows.push(
    [
      result.kind,
      result.sample,
      result.attempt,
      result.elapsedMilliseconds,
      result.binaryVersion,
      summary?.local_hits ?? "",
      summary?.misses ?? "",
      summary?.dups ?? "",
      summary?.passthroughs ?? "",
      summary?.weighted_hit_rate_pct ?? "",
      path.relative(outputDirectory, result.logPath),
      result.report
        ? path.relative(outputDirectory, result.report.reportPath)
        : "",
    ].join("\t"),
  );
}
writeFileSync(path.join(outputDirectory, "results.tsv"), `${rows.join("\n")}\n`);

const totalLocalHits = treatmentResults.reduce(
  (total, result) => total + (result.report?.summary?.local_hits ?? 0),
  0,
);
const reasoning = !reportsParseable
  ? "At least one Kache report was unavailable or malformed, so the timing cannot prove cache use."
  : cacheHealthy
    ? `Kache recorded ${totalLocalHits} local hits with no misses, duplicate compilations, skipped units, errors, store failures, or fallbacks. ` +
      `${String(expectedPassthroughs)} unsupported or probe invocations passed through consistently in each build. ` +
      `The same locked workspace, command, machine, warm OS caches and freshly recreated target path were used for both paths. ` +
      `${discardedResults.length} contaminated attempt(s) were excluded.`
    : `Kache's health gates failed: ${reportFailures.join("; ")}.`;
const verdictText = `${verdict}\n` +
  `Claim: Kache ${expectedKacheVersion} reduces the median clean-target workspace build by at least ${thresholdPercent}%.\n\n` +
  `Evidence:\n` +
  `median baseline=${(baselineMedian / 1000).toFixed(2)}s, ` +
  `median treatment=${(treatmentMedian / 1000).toFixed(2)}s, ` +
  `improvement=${improvementPercent.toFixed(2)}%, threshold=${thresholdPercent}%.\n\n` +
  `Reasoning:\n${reasoning}\n`;
writeFileSync(path.join(outputDirectory, "verdict.md"), verdictText);

console.log(verdictText);
console.log(`Raw evidence: ${outputDirectory}`);
removeBenchmarkWorktree();
if (verdict !== "VERIFIED") {
  process.exitCode = 1;
}
