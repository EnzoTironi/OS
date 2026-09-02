#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const REVIEW_THREADS_QUERY = `
query ReviewThreads($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(first: 100) {
        nodes {
          isResolved
          comments(first: 10) {
            nodes {
              body
              createdAt
              line
              path
              url
              author { login }
            }
          }
        }
      }
    }
  }
}
`;

function usage(exitCode = 2) {
  process.stderr.write(
    "usage: validate-pr.mjs --pr <number> [--worktree <path>] [--expected-head <sha>] [--poll-seconds <n>] [--timeout-seconds <n>]\n"
  );
  process.exit(exitCode);
}

function fail(message) {
  process.stderr.write(`FAIL: ${message}\n`);
  process.exit(1);
}

function firstLine(value) {
  return String(value ?? "").trim().split(/\r?\n/u, 1)[0] ?? "";
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parsePositiveInteger(value, label) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    fail(`${label} must be a positive integer`);
  }
  return parsed;
}

function parseArgs(argv) {
  const options = {
    pr: null,
    worktree: ".",
    expectedHead: null,
    pollSeconds: 30,
    timeoutSeconds: 3600,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--pr") {
      options.pr = parsePositiveInteger(argv[++index] ?? "", "--pr");
      continue;
    }
    if (argument === "--worktree") {
      options.worktree = argv[++index] ?? "";
      continue;
    }
    if (argument === "--expected-head") {
      options.expectedHead = argv[++index] ?? "";
      continue;
    }
    if (argument === "--poll-seconds") {
      options.pollSeconds = parsePositiveInteger(
        argv[++index] ?? "",
        "--poll-seconds"
      );
      continue;
    }
    if (argument === "--timeout-seconds") {
      options.timeoutSeconds = parsePositiveInteger(
        argv[++index] ?? "",
        "--timeout-seconds"
      );
      continue;
    }
    if (argument === "-h" || argument === "--help") {
      usage(0);
    }
    fail(`unknown argument: ${argument}`);
  }

  if (options.pr === null || options.worktree.length === 0) {
    usage();
  }

  return options;
}

function spawnCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    if (child.stdout !== null) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
    }
    if (child.stderr !== null) {
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
    }

    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        code: code ?? -1,
        stdout,
        stderr,
      });
    });
  });
}

async function run(command, args, options = {}) {
  const result = await spawnCommand(command, args, options);
  if (result.code !== 0) {
    const detail =
      firstLine(result.stderr) ||
      firstLine(result.stdout) ||
      `${command} exited ${result.code}`;
    fail(`${command} ${args.join(" ")}: ${detail}`);
  }
  return result.stdout.trim();
}

async function runInherited(command, args, options = {}) {
  const result = await spawnCommand(command, args, {
    ...options,
    stdio: "inherit",
  });
  if (result.code !== 0) {
    fail(`${command} ${args.join(" ")} exited ${result.code}`);
  }
}

async function runJson(command, args, options = {}) {
  const text = await run(command, args, options);
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(
      `${command} ${args.join(" ")} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function splitRepo(nameWithOwner) {
  const slash = nameWithOwner.indexOf("/");
  if (slash <= 0 || slash === nameWithOwner.length - 1) {
    fail(`invalid repository nameWithOwner: ${nameWithOwner}`);
  }
  return {
    owner: nameWithOwner.slice(0, slash),
    repo: nameWithOwner.slice(slash + 1),
  };
}

function isCoderabbitAuthor(login) {
  return login === "coderabbitai" || login === "coderabbitai[bot]";
}

function isPassingConclusion(conclusion) {
  return (
    conclusion === "success" ||
    conclusion === "neutral" ||
    conclusion === "skipped"
  );
}

function summarizeChecks(runs) {
  const pending = runs.filter((run) => run.status !== "completed");
  const failing = runs.filter(
    (run) => run.status === "completed" && !isPassingConclusion(run.conclusion)
  );
  return { pending, failing };
}

function summarizeThreads(reviewThreads) {
  return reviewThreads
    .filter((thread) => thread.isResolved !== true)
    .map((thread) => {
      const comment = thread.comments?.nodes?.[0] ?? null;
      return {
        author: comment?.author?.login ?? "unknown",
        body: firstLine(comment?.body ?? ""),
        line: comment?.line ?? null,
        path: comment?.path ?? null,
        url: comment?.url ?? "",
      };
    });
}

function latestFreshComment(comments, login, sinceMilliseconds) {
  const fresh = comments
    .filter(
      (comment) =>
        comment.user?.login === login ||
        comment.user?.login === `${login}[bot]`
    )
    .filter((comment) => {
      const changedAt = Date.parse(
        comment.updated_at ?? comment.created_at ?? ""
      );
      return Number.isFinite(changedAt) && changedAt >= sinceMilliseconds;
    })
    .sort((left, right) =>
      Date.parse(left.updated_at ?? left.created_at) -
      Date.parse(right.updated_at ?? right.created_at)
    );
  return fresh.at(-1) ?? null;
}

function freshnessBoundary(checkRuns, fallbackMilliseconds) {
  const started = checkRuns
    .map((run) => Date.parse(run.started_at ?? ""))
    .filter((value) => Number.isFinite(value));
  if (started.length === 0) {
    return fallbackMilliseconds;
  }
  return Math.min(...started);
}

function coderabbitFinished(comments, boundaryMilliseconds) {
  return comments.some((comment) => {
    if (!isCoderabbitAuthor(comment.user?.login)) {
      return false;
    }
    const createdAt = Date.parse(comment.created_at ?? "");
    if (!Number.isFinite(createdAt) || createdAt < boundaryMilliseconds) {
      return false;
    }
    return String(comment.body ?? "").includes("Review finished.");
  });
}

function coderabbitTriggered(comments, boundaryMilliseconds) {
  return comments.some((comment) => {
    const createdAt = Date.parse(comment.created_at ?? "");
    if (!Number.isFinite(createdAt) || createdAt < boundaryMilliseconds) {
      return false;
    }
    return firstLine(comment.body ?? "") === "@coderabbitai review";
  });
}

async function repoContext(worktree) {
  const root = await run("git", ["-C", worktree, "rev-parse", "--show-toplevel"]);
  const nameWithOwner = await run(
    "gh",
    ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"],
    { cwd: worktree }
  );
  return { root, ...splitRepo(nameWithOwner) };
}

async function prFacts(worktree, pr) {
  return runJson(
    "gh",
    [
      "pr",
      "view",
      String(pr),
      "--json",
      "headRefName,headRefOid,isDraft,mergeStateStatus,reviewDecision,state,url",
    ],
    { cwd: worktree }
  );
}

async function commitTimestamp(worktree, owner, repo, sha) {
  const date = await run(
    "gh",
    [
      "api",
      `repos/${owner}/${repo}/commits/${sha}`,
      "--jq",
      ".commit.committer.date",
    ],
    { cwd: worktree }
  );
  const parsed = Date.parse(date);
  if (!Number.isFinite(parsed)) {
    fail(`invalid commit date for ${sha}: ${date}`);
  }
  return parsed;
}

async function pullReviews(worktree, owner, repo, pr) {
  return runJson(
    "gh",
    ["api", `repos/${owner}/${repo}/pulls/${pr}/reviews`],
    { cwd: worktree }
  );
}

async function pullIssueComments(worktree, owner, repo, pr) {
  return runJson(
    "gh",
    ["api", `repos/${owner}/${repo}/issues/${pr}/comments`],
    { cwd: worktree }
  );
}

async function pullReviewThreads(worktree, owner, repo, pr) {
  const response = await runJson(
    "gh",
    [
      "api",
      "graphql",
      "-f",
      `query=${REVIEW_THREADS_QUERY}`,
      "-F",
      `owner=${owner}`,
      "-F",
      `repo=${repo}`,
      "-F",
      `number=${pr}`,
    ],
    { cwd: worktree }
  );
  return (
    response?.data?.repository?.pullRequest?.reviewThreads?.nodes ?? []
  );
}

async function pullCheckRuns(worktree, owner, repo, sha) {
  const response = await runJson(
    "gh",
    ["api", `repos/${owner}/${repo}/commits/${sha}/check-runs`],
    { cwd: worktree }
  );
  return response.check_runs ?? [];
}

async function ensureLocalHeadMatches(worktree, remoteHead, expectedHead) {
  const localHead = await run(
    "git",
    ["-C", worktree, "rev-parse", "HEAD"]
  );
  if (expectedHead !== null && expectedHead.length > 0 && remoteHead !== expectedHead) {
    fail(`remote head ${remoteHead} does not match expected head ${expectedHead}`);
  }
  if (localHead !== remoteHead) {
    fail(
      `local HEAD ${localHead} does not match PR head ${remoteHead}; validate the pushed commit from the PR worktree`
    );
  }
}

async function ensureTrackedTreeClean(worktree) {
  const unstaged = await spawnCommand(
    "git",
    ["-C", worktree, "diff", "--quiet"]
  );
  if (unstaged.code !== 0) {
    fail(`tracked worktree has unstaged changes in ${worktree}`);
  }
  const staged = await spawnCommand(
    "git",
    ["-C", worktree, "diff", "--cached", "--quiet"]
  );
  if (staged.code !== 0) {
    fail(`tracked worktree has staged but uncommitted changes in ${worktree}`);
  }
}

async function verifyDefinitionPublicationArtifact(worktree, headSha) {
  const artifactPath = path.join(
    worktree,
    "artifacts",
    "definition-publication",
    "definition-publication.json"
  );
  let artifact;
  try {
    artifact = JSON.parse(await readFile(artifactPath, "utf8"));
  } catch (error) {
    fail(
      `could not read ${artifactPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (artifact.scenario !== "definition-publication") {
    fail(`${artifactPath} has scenario ${artifact.scenario}`);
  }
  if (artifact.sourceCommit !== headSha) {
    fail(
      `${artifactPath} recorded sourceCommit ${artifact.sourceCommit} instead of ${headSha}`
    );
  }
  const assertions = artifact.assertions;
  if (
    assertions === null ||
    typeof assertions !== "object" ||
    Array.isArray(assertions)
  ) {
    fail(`${artifactPath} does not contain an assertions object`);
  }
  const failed = Object.entries(assertions)
    .filter(([, value]) => value !== true)
    .map(([name]) => name);
  if (failed.length > 0) {
    fail(`${artifactPath} has failed assertions: ${failed.join(", ")}`);
  }
  process.stdout.write(
    `ARTIFACT: definition-publication sourceCommit=${headSha} assertions=${Object.keys(assertions).length}\n`
  );
}

async function waitForRemoteSettling(context) {
  const startedAt = Date.now();
  let lastPendingSummary = "";
  let postedTrigger = false;

  while (true) {
    const facts = await prFacts(context.worktree, context.pr);
    if (facts.headRefOid !== context.headSha) {
      fail(
        `PR head moved from ${context.headSha} to ${facts.headRefOid}; rerun validation on the new head`
      );
    }

    const reviews = await pullReviews(
      context.worktree,
      context.owner,
      context.repo,
      context.pr
    );
    const comments = await pullIssueComments(
      context.worktree,
      context.owner,
      context.repo,
      context.pr
    );

    const hasCurrentHeadCoderabbitReview = reviews.some(
      (review) =>
        isCoderabbitAuthor(review.user?.login) &&
        review.commit_id === context.headSha
    );

    if (
      !postedTrigger &&
      !hasCurrentHeadCoderabbitReview &&
      !coderabbitTriggered(comments, context.commitTime)
    ) {
      await run(
        "gh",
        ["pr", "comment", String(context.pr), "--body", "@coderabbitai review"],
        { cwd: context.worktree }
      );
      postedTrigger = true;
    }

    const coderabbitReady = hasCurrentHeadCoderabbitReview;

    const checkRuns = await pullCheckRuns(
      context.worktree,
      context.owner,
      context.repo,
      context.headSha
    );
    const { pending } = summarizeChecks(checkRuns);

    if (coderabbitReady && pending.length === 0) {
      if (postedTrigger) {
        process.stdout.write(
          `REMOTE: CodeRabbit finished for ${context.headSha}\n`
        );
      }
      return;
    }

    if (Date.now() - startedAt > context.timeoutMilliseconds) {
      const reason =
        pending.length > 0
          ? `pending checks: ${pending.map((run) => run.name).join(", ")}`
          : "CodeRabbit did not finish on the current head";
      fail(`timeout after ${context.timeoutMilliseconds / 1000}s while waiting for ${reason}`);
    }

    const pendingSummary = [
      coderabbitReady ? null : "CodeRabbit",
      ...pending.map((run) => run.name),
    ]
      .filter(Boolean)
      .join(", ");
    if (pendingSummary !== lastPendingSummary) {
      process.stdout.write(`WAIT: ${pendingSummary}\n`);
      lastPendingSummary = pendingSummary;
    }
    await sleep(context.pollMilliseconds);
  }
}

async function enforceRemoteGates(context) {
  const facts = await prFacts(context.worktree, context.pr);
  if (facts.headRefOid !== context.headSha) {
    fail(`PR head moved to ${facts.headRefOid} before final gate evaluation`);
  }
  if (facts.state !== "OPEN") {
    fail(`PR #${context.pr} is not open`);
  }
  if (facts.isDraft) {
    fail(`PR #${context.pr} is still draft`);
  }
  if (facts.reviewDecision === "CHANGES_REQUESTED") {
    fail(`PR #${context.pr} still has changes requested`);
  }
  if (
    facts.mergeStateStatus === "DIRTY" ||
    facts.mergeStateStatus === "CONFLICTING"
  ) {
    fail(`PR #${context.pr} has merge conflicts (${facts.mergeStateStatus})`);
  }

  const checkRuns = await pullCheckRuns(
    context.worktree,
    context.owner,
    context.repo,
    context.headSha
  );
  const commentBoundary = freshnessBoundary(checkRuns, context.commitTime);
  const { pending, failing } = summarizeChecks(checkRuns);
  if (pending.length > 0) {
    fail(`checks are still pending: ${pending.map((run) => run.name).join(", ")}`);
  }
  if (failing.length > 0) {
    const detail = failing
      .map((run) => `${run.name}=${run.conclusion} ${run.details_url ?? ""}`.trim())
      .join(" | ");
    fail(`failing checks on ${context.headSha}: ${detail}`);
  }

  const unresolvedThreads = summarizeThreads(
    await pullReviewThreads(
      context.worktree,
      context.owner,
      context.repo,
      context.pr
    )
  );
  if (unresolvedThreads.length > 0) {
    const detail = unresolvedThreads
      .map((thread) =>
        [thread.author, thread.path, thread.line, thread.body, thread.url]
          .filter((value) => value !== null && value !== "")
          .join(" ")
      )
      .join(" | ");
    fail(`unresolved review threads remain: ${detail}`);
  }

  const comments = await pullIssueComments(
    context.worktree,
    context.owner,
    context.repo,
    context.pr
  );
  const freshCodecov = latestFreshComment(
    comments,
    "codecov",
    commentBoundary
  );
  if (
    freshCodecov !== null &&
    String(freshCodecov.body ?? "").includes("Patch coverage is `") &&
    String(freshCodecov.body ?? "").includes(":x:")
  ) {
    fail(`Codecov reported a fresh failure comment: ${freshCodecov.html_url}`);
  }

  const freshSonar = latestFreshComment(
    comments,
    "sonarqubecloud",
    commentBoundary
  );
  if (
    freshSonar !== null &&
    String(freshSonar.body ?? "").includes("Quality Gate failed")
  ) {
    fail(`SonarCloud reported a fresh failing quality gate comment: ${freshSonar.html_url}`);
  }

  process.stdout.write(
    `READY: pr=#${context.pr} head=${context.headSha} mergeState=${facts.mergeStateStatus} reviewDecision=${facts.reviewDecision ?? "none"}\n`
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const context = await repoContext(options.worktree);
  context.pr = options.pr;
  context.worktree = options.worktree;
  context.pollMilliseconds = options.pollSeconds * 1000;
  context.timeoutMilliseconds = options.timeoutSeconds * 1000;

  const initialFacts = await prFacts(context.worktree, context.pr);
  context.headSha = initialFacts.headRefOid;
  await ensureLocalHeadMatches(
    context.worktree,
    context.headSha,
    options.expectedHead
  );
  await ensureTrackedTreeClean(context.worktree);
  context.commitTime = await commitTimestamp(
    context.worktree,
    context.owner,
    context.repo,
    context.headSha
  );

  process.stdout.write(
    `LOCAL: pr=#${context.pr} head=${context.headSha} worktree=${context.worktree}\n`
  );
  await runInherited("./e2e/run.sh", ["verify"], { cwd: context.worktree });
  await runInherited("./e2e/run.sh", ["verify-v1"], { cwd: context.worktree });
  await runInherited("./e2e/run.sh", ["verify-activation"], {
    cwd: context.worktree,
  });
  await verifyDefinitionPublicationArtifact(context.worktree, context.headSha);

  const currentFacts = await prFacts(context.worktree, context.pr);
  if (currentFacts.headRefOid !== context.headSha) {
    fail(
      `PR head moved from ${context.headSha} to ${currentFacts.headRefOid} during local verification`
    );
  }

  await runInherited(
    "gh",
    [
      "pr",
      "checks",
      String(context.pr),
      "--watch",
      "--interval",
      String(options.pollSeconds),
    ],
    { cwd: context.worktree }
  );
  await waitForRemoteSettling(context);
  await enforceRemoteGates(context);
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
