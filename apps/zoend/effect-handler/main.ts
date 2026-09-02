import {
  createServer,
  type Http2Server,
  type Http2ServerResponse,
} from "node:http2";
import { pathToFileURL } from "node:url";
import {
  createEndpointHandler,
  handlers,
  type ObjectContext,
  object,
  TerminalError,
} from "@restatedev/restate-sdk";
import { z } from "zod";
import {
  type EffectHandlerArtifact,
  effectHandlerMetadata,
  loadEffectHandlerArtifact,
  ZOEN_EFFECT_HANDLER_NAME,
  ZOEN_EFFECT_OWNER,
  ZOEN_EFFECT_SERVICE_NAME,
} from "./artifact.js";
import {
  type EffectHandlerConfig,
  effectRequestIdSchema,
  loadEffectHandlerConfig,
  tenantIdSchema,
} from "./config.js";
import {
  ConnectorClient,
  type ConnectorOutcome,
  ConnectorRetryableError,
} from "./connector-client.js";
import {
  type AttemptClaim,
  EffectServiceClient,
} from "./effect-service-client.js";
import { RegistrationLease } from "./registration-lease.js";

const dispatchInputSchema = z
  .object({
    dispatchVersion: z.number().int().safe().positive(),
    effectRequestId: effectRequestIdSchema,
    tenantId: tenantIdSchema,
  })
  .strict();

export type EffectDispatchInput = z.infer<typeof dispatchInputSchema>;
export const EFFECT_HANDLER_ARTIFACT_PATH = "/zoen/artifact";

export function createZoenEffect(
  config: EffectHandlerConfig,
  artifact: EffectHandlerArtifact
) {
  const effectService = new EffectServiceClient(config);
  const connector = new ConnectorClient(config);
  const registrationLease = new RegistrationLease(config);
  const metadata = effectHandlerMetadata(artifact);
  const execute = handlers.object.exclusive(
    { metadata },
    async (context: ObjectContext, input: unknown) => {
      const command = parseDispatchInput(input);
      if (command.tenantId !== config.identity.tenantId) {
        throw new TerminalError(
          "effect invocation tenant does not match the worker credential"
        );
      }
      const expectedKey = `${command.tenantId}:${command.effectRequestId}:${command.dispatchVersion}`;
      if (context.key !== expectedKey) {
        throw new TerminalError(
          "effect invocation key does not match its dispatch identity"
        );
      }

      const inspection = await context.run(
        "inspect effect payload class",
        async () => {
          await registrationLease.requireCurrent(artifact.revision);
          return effectService.inspectEffect(command.effectRequestId);
        }
      );
      if (inspection.knowledgeCommitSequence !== command.dispatchVersion) {
        throw new TerminalError(
          "effect dispatch version does not match current knowledge"
        );
      }
      if (inspection.kind === "human") {
        throw new TerminalError(
          "human-executor effect cannot run through the generic connector"
        );
      }

      const claim = await context.run("claim effect attempt", async () => {
        await registrationLease.requireCurrent(artifact.revision);
        return effectService.claimAttempt(
          command.effectRequestId,
          context.request().id,
          command.dispatchVersion
        );
      });
      const outcome = await invokeConnectorDurably(
        context,
        registrationLease,
        artifact.revision,
        effectService,
        connector,
        claim
      );
      await context.run("record effect attempt", async () => {
        await effectService.recordAttempt(claim, outcome);
        return { recorded: true };
      });

      return {
        attemptId: claim.attemptId,
        outcome: outcome.kind,
      };
    }
  );

  return object({
    handlers: { [ZOEN_EFFECT_HANDLER_NAME]: execute },
    metadata,
    name: ZOEN_EFFECT_SERVICE_NAME,
  });
}

function invokeConnectorDurably(
  context: ObjectContext,
  registrationLease: RegistrationLease,
  artifactRevision: string,
  effectService: EffectServiceClient,
  connector: ConnectorClient,
  claim: AttemptClaim
): Promise<ConnectorOutcome> {
  return invokeConnectorAttempt({
    artifactRevision,
    attemptNumber: 1,
    claim,
    connector,
    context,
    effectService,
    registrationLease,
  });
}

async function invokeConnectorAttempt(input: {
  artifactRevision: string;
  attemptNumber: number;
  claim: AttemptClaim;
  connector: ConnectorClient;
  context: ObjectContext;
  effectService: EffectServiceClient;
  registrationLease: RegistrationLease;
}): Promise<ConnectorOutcome> {
  const attempt = await input.context.run(
    `invoke external connector attempt ${input.attemptNumber}`,
    async () => {
      await input.registrationLease.requireCurrent(input.artifactRevision);
      await input.effectService.requireCurrentWorkerAuthentication();
      try {
        return {
          kind: "completed" as const,
          outcome: await input.connector.invoke(input.claim),
        };
      } catch (error: unknown) {
        if (!(error instanceof ConnectorRetryableError)) {
          throw error;
        }
        return { kind: "retryable_failure" as const };
      }
    }
  );
  if (attempt.kind === "completed") {
    return attempt.outcome;
  }
  const maximumAttempts = 3;
  if (input.attemptNumber >= maximumAttempts) {
    throw new TerminalError("effect connector retry budget exhausted");
  }
  const delayMillis = 100 * 2 ** (input.attemptNumber - 1);
  await input.context.sleep(
    delayMillis,
    `external connector retry ${input.attemptNumber}`
  );
  return invokeConnectorAttempt({
    ...input,
    attemptNumber: input.attemptNumber + 1,
  });
}

export async function startEffectHandler(): Promise<Http2Server> {
  const config = loadEffectHandlerConfig();
  const artifact = loadEffectHandlerArtifact();
  const service = createZoenEffect(config, artifact);
  const endpointHandler = createEndpointHandler({ services: [service] });
  const server = createServer((request, response) => {
    if (
      request.method === "GET" &&
      request.url === EFFECT_HANDLER_ARTIFACT_PATH
    ) {
      writeArtifactIdentity(response, artifact);
      return;
    }
    endpointHandler(request, response);
  });
  await listen(server, config);
  installShutdownHandlers(server);
  return server;
}

function writeArtifactIdentity(
  response: Http2ServerResponse,
  artifact: EffectHandlerArtifact
): void {
  response.writeHead(200, {
    "cache-control": "no-store",
    "content-type": "application/json",
  });
  response.end(
    JSON.stringify({
      artifact: artifact.revision,
      handler: ZOEN_EFFECT_HANDLER_NAME,
      owner: ZOEN_EFFECT_OWNER,
      service: ZOEN_EFFECT_SERVICE_NAME,
    })
  );
}

function parseDispatchInput(input: unknown): EffectDispatchInput {
  const parsed = dispatchInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new TerminalError("effect dispatch input is malformed");
  }
  return parsed.data;
}

async function listen(
  server: Http2Server,
  config: EffectHandlerConfig
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(config.listen.port, config.listen.host);
  });
}

function installShutdownHandlers(server: Http2Server): void {
  const shutdown = () => {
    server.close((error) => {
      if (error !== undefined) {
        process.stderr.write(
          `effect handler shutdown failed: ${error.message}\n`
        );
        process.exitCode = 1;
      }
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

const [, entrypoint] = process.argv;
if (
  entrypoint !== undefined &&
  import.meta.url === pathToFileURL(entrypoint).href
) {
  await startEffectHandler();
}
