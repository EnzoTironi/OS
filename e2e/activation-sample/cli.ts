import { pathToFileURL } from "node:url";
import {
  doctorStack,
  ensureStackReady,
  loadSampleRef,
  statusStack,
  stopStack,
} from "./stack.js";
import { resetSample } from "./seed.js";
import type { StackStatus } from "./types.js";

export async function main(argv: string[]): Promise<number> {
  const command = argv[0] ?? "help";
  switch (command) {
    case "start": {
      const { status, timing } = await ensureStackReady({
        createIfMissing: true,
        seed: true,
      });
      printStatus(status);
      console.log(
        `timing: wall=${timing.wallMs}ms budget=${timing.budgetMs}ms withinBudget=${timing.withinBudget}`,
      );
      if (status.kind === "Ready") {
        console.log(`Sample Company ready at ${status.endpoints.webOrigin}`);
        console.log(
          "Login: web-user / web-password (Keycloak realm zoen, client zoen-web)",
        );
      }
      if (!timing.withinBudget) {
        console.error(
          `activation exceeded ${timing.budgetMs}ms budget (wall=${timing.wallMs}ms)`,
        );
        return 1;
      }
      return status.kind === "Ready" ? 0 : 1;
    }
    case "stop": {
      await stopStack();
      console.log("Stopped");
      return 0;
    }
    case "status": {
      const status = await statusStack();
      printStatus(status);
      return status.kind === "Ready" ? 0 : 1;
    }
    case "doctor": {
      const report = await doctorStack();
      printStatus(report.status);
      for (const blocker of report.blockers) {
        console.error(`blocker: ${blocker}`);
      }
      for (const hint of report.hints) {
        console.error(`hint: ${hint}`);
      }
      if (report.status.kind === "Ready" && report.blockers.length === 0) {
        return 0;
      }
      return 1;
    }
    case "reset-sample": {
      const { handle, status } = await ensureStackReady({
        createIfMissing: true,
        seed: false,
      });
      if (status.kind === "Stopped") {
        console.error("stack is Stopped");
        return 1;
      }
      const result = await resetSample(handle);
      console.log(`sample ${result.outcome}`);
      console.log(
        `web bindings: definition=${result.sample.webBindings.definitionId} resource=${result.sample.webBindings.resourceId}`,
      );
      return 0;
    }
    case "prove": {
      const { handle, timing, status } = await ensureStackReady({
        createIfMissing: true,
        seed: true,
      });
      if (status.kind !== "Ready" || status.sample === undefined) {
        console.error("stack did not reach Ready with sample");
        return 1;
      }
      const sample =
        status.sample ?? (await loadSampleRef(handle));
      if (sample === undefined) {
        console.error("sample ref missing");
        return 1;
      }
      const { runActivationStory } = await import("./story.js");
      await runActivationStory(handle, sample, timing);
      return timing.withinBudget ? 0 : 1;
    }
    case "help":
    default: {
      console.log(
        "usage: node dist/e2e/activation-sample/cli.js <start|stop|status|doctor|reset-sample|prove>",
      );
      return command === "help" ? 0 : 2;
    }
  }
}

function printStatus(status: StackStatus): void {
  console.log(`status: ${status.kind}`);
  for (const component of status.components) {
    const detail = component.detail ? ` (${component.detail})` : "";
    console.log(`  ${component.name}: ${component.state}${detail}`);
  }
  if (status.kind === "Ready" || status.kind === "Degraded") {
    if (status.endpoints !== undefined) {
      console.log(`  web: ${status.endpoints.webOrigin}`);
      console.log(`  zoend: ${status.endpoints.zoendOrigin}`);
      console.log(`  oidc: ${status.endpoints.oidcIssuer}`);
    }
  }
}

const entry = process.argv[1];
if (
  entry !== undefined &&
  import.meta.url === pathToFileURL(entry).href
) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      console.error(
        error instanceof Error ? error.stack ?? error.message : error,
      );
      process.exit(1);
    });
}
