import { command } from "./runtime/runtime-config.js";
import { allocateCommand } from "./runtime/runtime-allocation.js";
import { aggregateCommand } from "./runtime/runtime-publication.js";
import {
  cleanupCommand,
  markPreparedCommand,
  markResultCommand,
  reconcileCommand,
  resolvePointerCommand,
  shellEnvironmentCommand,
  writeComposeOverrideCommand,
  writePointerCommand,
} from "./runtime/runtime-commands.js";
import { releaseRuntimeBootstrapReaderIfRequested } from "./runtime/runtime-registry.js";

let commandFailure: unknown;
try {
  await main(command);
} catch (error) {
  commandFailure = error;
}
let readerReleaseFailure: unknown;
try {
  await releaseRuntimeBootstrapReaderIfRequested();
} catch (error) {
  readerReleaseFailure = error;
}
if (commandFailure !== undefined || readerReleaseFailure !== undefined) {
  throw new AggregateError(
    [commandFailure, readerReleaseFailure].filter(
      (error) => error !== undefined,
    ),
    "journey runtime command failed",
  );
}

async function main(selectedCommand: string): Promise<void> {
  switch (selectedCommand) {
    case "allocate":
      await allocateCommand();
      return;
    case "aggregate":
      await aggregateCommand();
      return;
    case "cleanup":
      await cleanupCommand();
      return;
    case "mark-prepared":
      await markPreparedCommand();
      return;
    case "mark-result":
      await markResultCommand();
      return;
    case "reconcile":
      await reconcileCommand();
      return;
    case "resolve-pointer":
      await resolvePointerCommand();
      return;
    case "shell-env":
      await shellEnvironmentCommand();
      return;
    case "write-compose-override":
      await writeComposeOverrideCommand();
      return;
    case "write-pointer":
      await writePointerCommand();
      return;
    default:
      throw new Error(`unknown journey-runtime command ${JSON.stringify(selectedCommand)}`);
  }
}
