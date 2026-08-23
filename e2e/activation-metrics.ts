import { runActivationMetricsScenario } from "./activation-metrics/scenario.js";

runActivationMetricsScenario()
  .then((evidence) => {
    console.log(
      JSON.stringify(
        {
          ok: true,
          mutantsKilled: evidence.mutantsKilled,
          assertionCount: Object.keys(evidence.assertions).length,
        },
        null,
        2,
      ),
    );
  })
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? (error.stack ?? error.message) : error,
    );
    process.exit(1);
  });
