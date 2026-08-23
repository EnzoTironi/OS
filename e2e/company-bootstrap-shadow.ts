import { main } from "./company-bootstrap-shadow/story.js";

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
