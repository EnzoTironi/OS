#!/usr/bin/env node

import { commandAfterSeparator } from "./runtime-bootstrap/command-line.mjs";
import { proveContextConfinementCommand } from "./runtime-bootstrap/context-confinement-proof.mjs";
import {
  publishJourneyProcessAuthority,
  runJourneyCleaner,
  runJourneyWorker,
} from "./runtime-bootstrap/journey-authority.mjs";
import { runJourneyController } from "./runtime-bootstrap/journey-controller.mjs";
import {
  runController,
  runWorker,
} from "./runtime-bootstrap/preparation-authority.mjs";
import {
  createRuntimeProofRootCommand,
  holdProofReaderCommand,
  provePreparationCrashRecoveryCommand,
} from "./runtime-bootstrap/preparation-proof.mjs";
import { runGuardian } from "./runtime-bootstrap/process-authority.mjs";
import {
  acquireBootstrapReaderCommand,
  releaseBootstrapReaderCommand,
} from "./runtime-bootstrap/runtime-registry.mjs";

const mode = process.argv[2] ?? "";

if (mode === "run") {
  await runController(commandAfterSeparator());
} else if (mode === "worker") {
  await runWorker(commandAfterSeparator());
} else if (mode === "guardian") {
  await runGuardian();
} else if (mode === "reader-acquire") {
  await acquireBootstrapReaderCommand();
} else if (mode === "reader-release") {
  await releaseBootstrapReaderCommand();
} else if (mode === "proof-crash-recovery") {
  await provePreparationCrashRecoveryCommand();
} else if (mode === "proof-context-confinement") {
  await proveContextConfinementCommand();
} else if (mode === "proof-reader-hold") {
  await holdProofReaderCommand();
} else if (mode === "create-runtime-proof-root") {
  await createRuntimeProofRootCommand();
} else if (mode === "journey-run") {
  await runJourneyController();
} else if (mode === "journey-worker") {
  await runJourneyWorker();
} else if (mode === "journey-publish") {
  await publishJourneyProcessAuthority();
} else if (mode === "journey-cleaner") {
  await runJourneyCleaner();
} else {
  throw new Error(`unknown preparation command ${JSON.stringify(mode)}`);
}
