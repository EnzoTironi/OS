import { main } from "./activation-onboarding/story.js";

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? (error.stack ?? error.message) : error,
    );
    process.exit(1);
  });
