import { createFileRoute } from "@tanstack/react-router";
import { createZoenBrowserClient } from "@zoen/sdk";
import {
  compileStepUpSurface,
  type SurfaceDocument,
} from "@zoen/surface";
import { useEffect, useState } from "react";
import {
  beginApproveOidcLogin,
  currentAccessToken,
} from "../auth.js";
import {
  commitAuthorityAction,
  type ActionIdentity,
} from "../authority.js";
import { loadRuntimeConfig, type RuntimeConfig } from "../config.js";

export const Route = createFileRoute("/approve/$controlRef")({
  component: ApproveStepUpPage,
});

type PageState =
  | { readonly kind: "loading" }
  | { readonly kind: "need_oidc"; readonly config: RuntimeConfig }
  | {
      readonly kind: "ready";
      readonly config: RuntimeConfig;
      readonly document: SurfaceDocument;
      readonly summary: string;
    }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "committed"; readonly operationId: string };

/**
 * One-purpose step-up mini-app under /approve/* (not /onboarding).
 * Chat cookie alone fails closed. Commit uses Action API + StateBasis path.
 */
function ApproveStepUpPage() {
  const { controlRef } = Route.useParams();
  const [state, setState] = useState<PageState>({ kind: "loading" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void bootstrap();
    async function bootstrap(): Promise<void> {
      try {
        const config = await loadRuntimeConfig();
        const token = currentAccessToken();
        if (token === undefined) {
          setState({ config, kind: "need_oidc" });
          return;
        }
        const document = compileLocalStepUp(controlRef);
        const summaryNode = document.nodes["node.decision-summary"];
        const summary =
          summaryNode !== undefined &&
          summaryNode.kind === "decision-summary"
            ? summaryNode.summary
            : "";
        setState({ config, document, kind: "ready", summary });
      } catch (cause: unknown) {
        setState({
          kind: "error",
          message: cause instanceof Error ? cause.message : String(cause),
        });
      }
    }
  }, [controlRef]);

  async function onCommit(): Promise<void> {
    if (state.kind !== "ready") {
      return;
    }
    setBusy(true);
    try {
      const token = currentAccessToken();
      if (token === undefined) {
        throw new Error("chat_cookie_insufficient");
      }
      const client = createZoenBrowserClient({
        accessToken: token,
        baseUrl: state.config.rpcBaseUrl,
      });
      const binding = state.document.actionBindings[0];
      if (binding === undefined) {
        throw new Error("step-up Surface missing ActionBinding");
      }
      const identity: ActionIdentity = {
        bindingId: binding.id,
        operationId: crypto.randomUUID(),
        proposalId: "resolved-by-server",
      };
      const response = await commitAuthorityAction(client, identity);
      setState({
        kind: "committed",
        operationId: response.receipt?.operationId ?? identity.operationId,
      });
    } catch (cause: unknown) {
      setState({
        kind: "error",
        message: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      setBusy(false);
    }
  }

  if (state.kind === "loading") {
    return (
      <main className="auth-shell">
        <section className="auth-card" data-approve-surface="step-up">
          <span className="eyebrow">Zoen approval</span>
          <h1>Loading step-up</h1>
        </section>
      </main>
    );
  }

  if (state.kind === "need_oidc") {
    return (
      <main className="auth-shell">
        <section className="auth-card" data-approve-surface="step-up">
          <span className="eyebrow">Zoen approval</span>
          <h1>Authenticate to continue</h1>
          <p>
            High-risk approval requires OIDC. Chat session cookie alone is not
            enough.
          </p>
          <button
            type="button"
            onClick={() => {
              void beginApproveOidcLogin(state.config, controlRef);
            }}
          >
            Sign in with IdP
          </button>
        </section>
      </main>
    );
  }

  if (state.kind === "error") {
    return (
      <main className="auth-shell">
        <section className="auth-card" data-approve-surface="step-up">
          <span className="eyebrow">Zoen approval</span>
          <h1>Step-up failed</h1>
          <p role="alert">{state.message}</p>
        </section>
      </main>
    );
  }

  if (state.kind === "committed") {
    return (
      <main className="auth-shell">
        <section className="auth-card" data-approve-surface="step-up">
          <span className="eyebrow">Zoen approval</span>
          <h1>Committed</h1>
          <p role="status">Operation {state.operationId}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" data-approve-surface="step-up">
        <span className="eyebrow">Zoen approval</span>
        <h1>Approve proposal</h1>
        <p data-control-ref={controlRef}>
          Opaque control ref only. Proposal id is not a URL bearer.
        </p>
        <pre>{state.summary}</pre>
        <button disabled={busy} type="button" onClick={() => void onCommit()}>
          Commit via Action API
        </button>
      </section>
    </main>
  );
}

function compileLocalStepUp(controlRef: string): SurfaceDocument {
  return compileStepUpSurface({
    actionRef: {
      actionId: "inventory.requestStock",
      definition: {
        definitionId: "inventory.governed",
        digest: "stepup.local",
        revision: "1",
      },
      resourceId: "inventory.item.1",
    },
    explanation: "Step-up approval for sealed ProposalRef via opaque control.",
    materialInputs: [{ label: "Control", value: controlRef }],
    proposalRef: "(resolved server-side from control)",
    requiredAssurance: "oidc_step_up",
    stale: false,
    subjectLabel: "inventory.item.1",
    workspaceLabel: "(from sealed tenant)",
  });
}
