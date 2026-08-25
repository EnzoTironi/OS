import { Code, ConnectError } from "@connectrpc/connect";
import { createFileRoute, Link } from "@tanstack/react-router";
import { createZoenBrowserClient, type ZoenBrowserClient } from "@zoen/sdk";
import {
  JsonRenderAdapter,
  ReferenceRenderer,
  SurfaceInteractionProvider,
  type ActionOperationView,
  type SurfaceDocument,
  type SurfaceInteraction,
  type SurfaceRuntimeData,
} from "@zoen/surface";
import {
  useEffect,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import {
  clearAdaptiveSessionId,
  loadAdaptiveSessionId,
  saveAdaptiveSessionId,
} from "../adaptive-session.js";
import {
  clearActionSession,
  createActionIdentity,
  loadActionSession,
  saveActionSession,
} from "../action-session.js";
import {
  actionErrorView,
  commitAuthorityAction,
  commitResponseOperationView,
  generatedActionIsFresh,
  loadAdaptiveAuthoritySurface,
  loadAuthoritySurface,
  operationHistory,
  proposedOperationView,
  proposeAuthorityAction,
  recoverAuthorityAction,
  refreshQueries,
  type ActionFreshness,
  type ActionIdentity,
  type LoadedAuthoritySurface,
} from "../authority.js";
import {
  beginOidcLogin,
  clearSession,
  currentAccessToken,
} from "../auth.js";
import { loadRuntimeConfig, type RuntimeConfig } from "../config.js";
import { conversationEntryHref } from "../pack-registry.js";
import { queryClient } from "../query-client.js";

type ReadyState = {
  readonly actionFreshness: ActionFreshness;
  readonly client: ZoenBrowserClient;
  readonly config: RuntimeConfig;
  readonly data: SurfaceRuntimeData;
  readonly document: SurfaceDocument;
  readonly fields: Readonly<Record<string, string | boolean>>;
  readonly surface:
    | { readonly kind: "deterministic" }
    | { readonly kind: "adaptive"; readonly sessionId: string };
};

type PageState =
  | { readonly kind: "loading" }
  | { readonly config: RuntimeConfig; readonly kind: "signed-out" }
  | {
      readonly client: ZoenBrowserClient;
      readonly config: RuntimeConfig;
      readonly kind: "question";
    }
  | { readonly kind: "generating" }
  | { readonly error: string; readonly kind: "failed" }
  | ({ readonly kind: "ready" } & ReadyState);
type SetPageState = Dispatch<SetStateAction<PageState>>;

export const Route = createFileRoute("/")({
  component: AuthorityPage,
});

function AuthorityPage() {
  const [state, setState] = useState<PageState>({ kind: "loading" });

  useEffect(() => {
    void initialize();

    async function initialize(): Promise<void> {
      try {
        const config = await loadRuntimeConfig();
        const token = currentAccessToken();
        if (token === undefined) {
          setState({ config, kind: "signed-out" });
          return;
        }
        const client = createZoenBrowserClient({
          accessToken: token,
          baseUrl: config.rpcBaseUrl,
        });
        if (config.adaptiveSurfaceEnabled) {
          const sessionId = loadAdaptiveSessionId({
            definitionId: config.definitionId,
            tenantId: client.tenantId,
          });
          if (sessionId === undefined) {
            setState({ client, config, kind: "question" });
            return;
          }
          const loaded = await loadAdaptiveAuthoritySurface(
            client,
            config,
            queryClient,
            token,
            { kind: "reload", sessionId },
          );
          await setLoadedState(client, config, loaded, setState);
          return;
        }
        const loaded = await loadAuthoritySurface(client, config, queryClient);
        await setLoadedState(client, config, loaded, setState);
      } catch (cause: unknown) {
        setState({ error: errorText(cause), kind: "failed" });
      }
    }
  }, []);

  if (state.kind === "loading") {
    return <StatusShell message="Loading semantic authority." />;
  }
  if (state.kind === "failed") {
    return <StatusShell error message={state.error} />;
  }
  if (state.kind === "generating") {
    return <StatusShell message="Generating and validating the decision." />;
  }
  if (state.kind === "signed-out") {
    return <SignedOutHome config={state.config} />;
  }
  if (state.kind === "question") {
    return <QuestionShell state={state} setState={setState} />;
  }

  const interaction: SurfaceInteraction = {
    actionAvailable: (bindingId) => actionAvailable(state, bindingId),
    commit: (bindingId) => commit(state, bindingId, setState),
    data: state.data,
    document: state.document,
    fieldValue: (bindingId, inputId) =>
      state.fields[fieldKey(bindingId, inputId)] ?? "",
    propose: (bindingId) => propose(state, bindingId, setState),
    selectEntity: (entityId) => {
      void selectEntity(state, entityId, setState);
    },
    selectedEntityId: state.document.semanticContext.entityId,
    setFieldValue: (bindingId, inputId, value) =>
      updateReady(setState, (current) => ({
        ...current,
        fields: {
          ...current.fields,
          [fieldKey(bindingId, inputId)]: value,
        },
      })),
  };

  return (
    <main
      className="app-shell"
      data-adaptive-session-id={
        state.surface.kind === "adaptive"
          ? state.surface.sessionId
          : undefined
      }
      data-compiler={state.document.attribution.compiler}
      data-entity-id={state.document.semanticContext.entityId}
      data-generated-without-llm={
        state.document.attribution.generatedWithoutLlm
      }
      data-type-id={state.document.semanticContext.typeQuery?.typeId}
    >
      <header className="app-header">
        <div>
          <span className="eyebrow">
            {state.surface.kind === "adaptive"
              ? "Adaptive Surface IR"
              : "Deterministic Surface IR"}
          </span>
          <h1>{state.document.presentation.title}</h1>
          <p>
            Definition <code>{state.document.semanticContext.definition.digest}</code>
          </p>
        </div>
        <div className="header-actions">
          {state.surface.kind === "adaptive" ? (
            <button
              className="secondary"
              onClick={() => {
                clearAdaptiveSessionId({
                  definitionId: state.config.definitionId,
                  tenantId: state.client.tenantId,
                });
                setState({
                  client: state.client,
                  config: state.config,
                  kind: "question",
                });
              }}
              type="button"
            >
              New decision
            </button>
          ) : null}
          <label className="visibility-control">
            <input
              checked={state.document.presentation.actionsVisible}
              onChange={(event) =>
                setActionsVisible(setState, event.currentTarget.checked)
              }
              type="checkbox"
            />
            Show Action controls
          </label>
          <button
            className="secondary"
            onClick={() => {
              clearSession();
              setState({ config: state.config, kind: "signed-out" });
            }}
            type="button"
          >
            Sign out
          </button>
        </div>
      </header>
      <aside className="authority-note" role="note">
        Presentation controls do not grant authority. Every proposal and commit
        returns to ActionService for enforcement.
      </aside>
      <SurfaceInteractionProvider value={interaction}>
        <div className="renderer-grid">
          <section aria-labelledby="json-render-heading" className="renderer-card">
            <header>
              <span className="renderer-tag">Production adapter</span>
              <h2 id="json-render-heading">json-render</h2>
            </header>
            <JsonRenderAdapter document={state.document} />
          </section>
          <section aria-labelledby="reference-heading" className="renderer-card">
            <header>
              <span className="renderer-tag">Reference implementation</span>
              <h2 id="reference-heading">Reference renderer</h2>
            </header>
            <ReferenceRenderer document={state.document} />
          </section>
        </div>
      </SurfaceInteractionProvider>
    </main>
  );
}

function SignedOutHome(props: { readonly config: RuntimeConfig }) {
  const [intent, setIntent] = useState("");

  function onStartConversation(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const wording = intent.trim();
    window.location.assign(
      conversationEntryHref({
        intent: wording.length > 0 ? wording : undefined,
        referral: "ref.web.home",
      }),
    );
  }

  return (
    <main className="packs-shell public-home" data-public-home="signed-out">
      <header className="packs-header">
        <span className="eyebrow">Executable semantic OS</span>
        <h1 data-comprehension="problem">
          One governed interface for meaning, evidence, authority, and action
        </h1>
        <p data-comprehension="problem-detail">
          Zoen lets humans, agents, and software operate the same organization
          through shared Query and Action contracts instead of private tool
          stacks. Evidence stays attributable. Belief is not automatic truth.
        </p>
      </header>

      <section className="packs-card" data-try-now="home">
        <h2>Try right now</h2>
        <p data-comprehension="try-now">
          Browse outcome Packs, start a conversation into onboarding, or sign
          in for Sample Company. There is no fake chat backend on this page.
        </p>
        <div className="packs-actions">
          <Link data-public-nav="packs" to="/packs/">
            Open Pack directory
          </Link>
          <button
            onClick={() => void beginOidcLogin(props.config)}
            type="button"
          >
            Sign in with OIDC
          </button>
        </div>
      </section>

      <section
        className="packs-card"
        data-conversation-entry="home-landing"
      >
        <h2>Start from an outcome</h2>
        <p>
          Conversation entry preserves pack, referral, and intent into
          onboarding as domainHints. Pack identity remains PackDigest.
        </p>
        <form onSubmit={onStartConversation}>
          <label className="field" htmlFor="home-intent">
            <span>What should Zoen take care of?</span>
            <textarea
              data-conversation-field="intent"
              id="home-intent"
              maxLength={4000}
              name="intent"
              onChange={(event) => setIntent(event.target.value)}
              placeholder="why inventory disagrees with the warehouse"
              rows={3}
              value={intent}
            />
          </label>
          <button data-conversation-action="start" type="submit">
            Continue to onboarding
          </button>
        </form>
      </section>

      <section className="packs-card">
        <h2>Not an agent bolted onto APIs</h2>
        <p data-comprehension="difference">
          Zoen is not an agent bolted onto APIs. Actions are governed and
          revalidated before commit. Cedar and publish/activate stay on the
          path. Local commit is not remote success. History and ontology
          revisions stay reproducible. Self-host keeps the same signed
          artifacts.
        </p>
      </section>

      <aside className="packs-note" data-comprehension="unsure" role="note">
        When Zoen is unsure, or an external effect is ambiguous, the outcome can
        stay unknown until reconciliation. Blind retry stays forbidden.
      </aside>
    </main>
  );
}

function QuestionShell(props: {
  readonly setState: SetPageState;
  readonly state: Extract<PageState, { readonly kind: "question" }>;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const question = new FormData(event.currentTarget)
      .get("question")
      ?.toString()
      .trim();
    if (question === undefined || question === "") {
      return;
    }
    void generateDecision(props.state, question, props.setState);
  };
  return (
    <main className="auth-shell">
      <section className="auth-card decision-question-card">
        <span className="eyebrow">Adaptive Surface IR</span>
        <h1>Ask an operational question</h1>
        <p>
          Zoen retrieves attributable Company Brain evidence, reads governed
          semantic state, and asks the configured model to compose a validated
          decision surface.
        </p>
        <form onSubmit={submit}>
          <label className="field" htmlFor="decision-question">
            <span>Question</span>
            <textarea
              defaultValue="Should operations request inventory replenishment?"
              id="decision-question"
              maxLength={16_000}
              name="question"
              required
            />
          </label>
          <button type="submit">Generate decision</button>
        </form>
      </section>
    </main>
  );
}

async function generateDecision(
  state: Extract<PageState, { readonly kind: "question" }>,
  question: string,
  setState: SetPageState,
): Promise<void> {
  const token = currentAccessToken();
  if (token === undefined) {
    setState({ config: state.config, kind: "signed-out" });
    return;
  }
  setState({ kind: "generating" });
  try {
    const loaded = await loadAdaptiveAuthoritySurface(
      state.client,
      state.config,
      queryClient,
      token,
      { kind: "generate", question },
    );
    if (loaded.kind !== "adaptive") {
      throw new Error("Adaptive endpoint returned a deterministic Surface");
    }
    saveAdaptiveSessionId({
      definitionId: state.config.definitionId,
      sessionId: loaded.sessionId,
      tenantId: state.client.tenantId,
    });
    await setLoadedState(state.client, state.config, loaded, setState);
  } catch (cause: unknown) {
    setState({ error: errorText(cause), kind: "failed" });
  }
}

async function setLoadedState(
  client: ZoenBrowserClient,
  config: RuntimeConfig,
  loaded: LoadedAuthoritySurface,
  setState: SetPageState,
): Promise<void> {
  const recovered = await recoverStoredActions(
    client,
    config,
    loaded.document,
    loaded.data,
  );
  setState({
    actionFreshness: loaded.actionFreshness,
    client,
    config,
    document: loaded.document,
    kind: "ready",
    surface:
      loaded.kind === "adaptive"
        ? { kind: "adaptive", sessionId: loaded.sessionId }
        : { kind: "deterministic" },
    ...recovered,
  });
}

async function selectEntity(
  state: ReadyState,
  entityId: string,
  setState: SetPageState,
): Promise<void> {
  if (entityId === state.document.semanticContext.entityId) {
    return;
  }
  try {
    const loaded = await loadAuthoritySurface(
      state.client,
      state.config,
      queryClient,
      { selectedEntityId: entityId },
    );
    await setLoadedState(state.client, state.config, loaded, setState);
  } catch (cause: unknown) {
    setState({ error: errorText(cause), kind: "failed" });
  }
}

async function propose(
  state: ReadyState,
  bindingId: string,
  setState: SetPageState,
): Promise<void> {
  if (!actionAvailable(state, bindingId)) {
    return;
  }
  const identity = createActionIdentity(bindingId);
  const values = fieldValues(state.fields, bindingId);
  saveActionSession({
    definitionDigest: state.document.semanticContext.definition.digest,
    identity,
    tenantId: state.client.tenantId,
    values,
  });
  updateReady(setState, (current) => ({
    ...current,
    data: withAction(current.data, bindingId, {
      kind: "proposing",
      operationId: identity.operationId,
      proposalId: identity.proposalId,
    }),
  }));
  try {
    const response = await proposeAuthorityAction({
      actionFreshness: state.actionFreshness,
      client: state.client,
      config: state.config,
      currentQueries: state.data.queries,
      document: state.document,
      identity,
      values,
    });
    const outcome = proposedOperationView(response, identity);
    if (outcome.kind === "needs_step_up") {
      const binding = state.document.actionBindings.find(
        (candidate) => candidate.id === bindingId,
      );
      if (binding === undefined) {
        throw new Error(`Unknown Action binding ${bindingId}`);
      }
      const token = currentAccessToken();
      if (token === undefined) {
        throw new Error("chat_cookie_insufficient");
      }
      const issued = await issueStepUpControl(token, {
        actionBindingId: binding.id,
        actionRef: binding.ref,
        operationId: identity.operationId,
        proposalId: identity.proposalId,
      });
      updateReady(setState, (current) => ({
        ...current,
        data: withAction(current.data, bindingId, {
          approveUrl: issued.approveUrl,
          controlRef: issued.controlRef,
          kind: "awaiting_approval",
          operationId: identity.operationId,
          proposalId: identity.proposalId,
        }),
      }));
      return;
    }
    updateReady(setState, (current) => ({
      ...current,
      data: withAction(current.data, bindingId, outcome),
    }));
    if (outcome.kind !== "proposed") {
      clearStoredActionSession(state, bindingId);
    }
  } catch (cause: unknown) {
    updateReady(setState, (current) => ({
      ...current,
      data: withAction(current.data, bindingId, actionErrorView(cause)),
    }));
    clearStoredActionSession(state, bindingId);
  }
}

async function issueStepUpControl(
  accessToken: string,
  input: {
    readonly actionBindingId: string;
    readonly actionRef: {
      readonly actionId: string;
      readonly definition: {
        readonly definitionId: string;
        readonly digest: string;
        readonly revision: string;
      };
      readonly resourceId: string;
    };
    readonly operationId: string;
    readonly proposalId: string;
  },
): Promise<{ readonly approveUrl: string; readonly controlRef: string }> {
  const response = await fetch("/api/step-up/issue", {
    body: JSON.stringify(input),
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : "step_up_issue_failed";
    throw new Error(message);
  }
  const parsed = body as { approveUrl?: unknown; controlRef?: unknown };
  if (
    typeof parsed.approveUrl !== "string" ||
    parsed.approveUrl.length === 0 ||
    typeof parsed.controlRef !== "string" ||
    parsed.controlRef.length === 0
  ) {
    throw new Error("step_up_issue_invalid");
  }
  return { approveUrl: parsed.approveUrl, controlRef: parsed.controlRef };
}

async function commit(
  state: ReadyState,
  bindingId: string,
  setState: SetPageState,
): Promise<void> {
  const proposal = state.data.actions[bindingId];
  if (proposal?.kind !== "proposed") {
    updateReady(setState, (current) => ({
      ...current,
      data: withAction(current.data, bindingId, {
        error: "The proposal identity is unavailable.",
        kind: "failed",
      }),
    }));
    return;
  }
  const identity: ActionIdentity = {
    bindingId,
    operationId: proposal.operationId,
    proposalId: proposal.proposalId,
  };
  updateReady(setState, (current) => ({
    ...current,
    data: withAction(current.data, bindingId, {
      kind: "committing",
      operationId: identity.operationId,
      proposalId: identity.proposalId,
    }),
  }));
  try {
    const response = await commitAuthorityAction(state.client, identity);
    const operation = await commitResponseOperationView(state.client, response);
    await applyOperation(state, bindingId, operation, setState);
    clearStoredActionSession(state, bindingId);
  } catch {
    updateReady(setState, (current) => ({
      ...current,
      data: withAction(current.data, bindingId, {
        kind: "recovering",
        operationId: identity.operationId,
        proposalId: identity.proposalId,
      }),
    }));
    try {
      const recovered = await recoverAuthorityAction(state.client, identity);
      const operation =
        recovered ??
        ({
          error: "The commit response was lost and no committed receipt is available.",
          kind: "failed",
        } satisfies ActionOperationView);
      await applyOperation(state, bindingId, operation, setState);
      clearStoredActionSession(state, bindingId);
    } catch (cause: unknown) {
      if (isDefinitiveRecoveryFailure(cause)) {
        updateReady(setState, (current) => ({
          ...current,
          data: withAction(current.data, bindingId, actionErrorView(cause)),
        }));
        clearStoredActionSession(state, bindingId);
      }
    }
  }
}

async function applyOperation(
  state: ReadyState,
  bindingId: string,
  operation: ActionOperationView,
  setState: SetPageState,
): Promise<void> {
  if (operation.kind !== "committed") {
    updateReady(setState, (current) => ({
      ...current,
      data: withAction(current.data, bindingId, operation),
    }));
    return;
  }
  const [queries, history] = await Promise.all([
    refreshQueries(
      state.client,
      state.config,
      state.document,
      queryClient,
      operation.commitSequence,
    ),
    operationHistory(state.client, operation.operationId),
  ]);
  updateReady(setState, (current) => ({
    ...current,
    data: {
      actions: { ...current.data.actions, [bindingId]: operation },
      history: { ...current.data.history, [bindingId]: history },
      queries,
    },
  }));
}

async function recoverStoredActions(
  client: ZoenBrowserClient,
  config: RuntimeConfig,
  document: SurfaceDocument,
  initial: SurfaceRuntimeData,
): Promise<
  Pick<ReadyState, "data" | "fields">
> {
  const actions = { ...initial.actions };
  const history = { ...initial.history };
  const fields: Record<string, string | boolean> = {};
  const committedSequences: string[] = [];
  for (const binding of document.actionBindings) {
    const session = loadActionSession({
      bindingId: binding.id,
      definitionDigest: document.semanticContext.definition.digest,
      tenantId: client.tenantId,
    });
    if (session === undefined) {
      continue;
    }
    for (const [inputId, value] of Object.entries(session.values)) {
      fields[fieldKey(binding.id, inputId)] = value;
    }
    try {
      const recovered = await recoverAuthorityAction(client, session.identity);
      if (recovered?.kind !== "committed") {
        actions[binding.id] = {
          kind: "recovering",
          operationId: session.identity.operationId,
          proposalId: session.identity.proposalId,
        };
        continue;
      }
      actions[binding.id] = recovered;
      committedSequences.push(recovered.commitSequence);
      try {
        history[binding.id] = await operationHistory(
          client,
          recovered.operationId,
        );
      } catch {
        history[binding.id] = [];
      }
      clearStoredActionSession(
        { client, document },
        binding.id,
      );
    } catch (cause: unknown) {
      if (cause instanceof ConnectError && cause.code === Code.NotFound) {
        clearStoredActionSession(
          { client, document },
          binding.id,
        );
      } else {
        actions[binding.id] = {
          kind: "recovering",
          operationId: session.identity.operationId,
          proposalId: session.identity.proposalId,
        };
      }
    }
  }
  const latestSequence = committedSequences.reduce<string | undefined>(
    (latest, sequence) =>
      latest === undefined || BigInt(sequence) > BigInt(latest)
        ? sequence
        : latest,
    undefined,
  );
  const queries =
    latestSequence === undefined
      ? initial.queries
      : await refreshQueries(
          client,
          config,
          document,
          queryClient,
          latestSequence,
        );
  return {
    data: { actions, history, queries },
    fields,
  };
}

function setActionsVisible(
  setState: SetPageState,
  actionsVisible: boolean,
): void {
  updateReady(setState, (current) => ({
    ...current,
    document: {
      ...current.document,
      presentation: {
        ...current.document.presentation,
        actionsVisible,
      },
    },
  }));
}

function updateReady(
  setState: SetPageState,
  update: (current: ReadyState & { readonly kind: "ready" }) => PageState,
): void {
  setState((current) => (current.kind === "ready" ? update(current) : current));
}

function withAction(
  data: SurfaceRuntimeData,
  bindingId: string,
  operation: ActionOperationView,
): SurfaceRuntimeData {
  return {
    ...data,
    actions: { ...data.actions, [bindingId]: operation },
  };
}

function fieldValues(
  fields: Readonly<Record<string, string | boolean>>,
  bindingId: string,
): Readonly<Record<string, string | boolean>> {
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([key]) => key.startsWith(`${bindingId}\u0000`))
      .map(([key, value]) => [key.slice(bindingId.length + 1), value]),
  );
}

function fieldKey(bindingId: string, inputId: string): string {
  return `${bindingId}\u0000${inputId}`;
}

function actionAvailable(state: ReadyState, bindingId: string): boolean {
  const kind = state.data.actions[bindingId]?.kind;
  return (
    generatedActionIsFresh(state.actionFreshness, state.data.queries) &&
    kind !== "unavailable" &&
    kind !== "awaiting_approval"
  );
}

function clearStoredActionSession(
  state: Pick<ReadyState, "client" | "document">,
  bindingId: string,
): void {
  clearActionSession({
    bindingId,
    definitionDigest: state.document.semanticContext.definition.digest,
    tenantId: state.client.tenantId,
  });
}

function isDefinitiveRecoveryFailure(cause: unknown): boolean {
  return (
    cause instanceof ConnectError &&
    cause.code !== Code.Aborted &&
    cause.code !== Code.DeadlineExceeded &&
    cause.code !== Code.Internal &&
    cause.code !== Code.Unavailable &&
    cause.code !== Code.Unknown
  );
}

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function StatusShell(props: {
  readonly error?: boolean;
  readonly message: string;
}) {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <span className="eyebrow">Zoen Surface</span>
        <h1>{props.error === true ? "Surface unavailable" : "Loading"}</h1>
        <p role={props.error === true ? "alert" : "status"}>{props.message}</p>
      </section>
    </main>
  );
}
