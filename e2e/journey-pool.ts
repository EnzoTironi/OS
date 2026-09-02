import { PoolInterrupted, formatError } from "./runtime/pool-control.js";
import { runPool } from "./runtime/pool-scheduler.js";

try {
  await runPool();
} catch (error) {
  if (error instanceof PoolInterrupted) {
    process.exitCode = error.signal === "SIGINT" ? 130 : 143;
  } else {
    process.stderr.write(`${formatError(error)}\n`);
    process.exitCode = 1;
  }
}
