import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  beginApproveOidcLogin,
  currentAccessToken,
} from "../auth.js";
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
      readonly sessionId: string;
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
        const opened = await openStepUp(token, controlRef);
        setState({
          config,
          kind: "ready",
          sessionId: opened.sessionId,
          summary: opened.summary,
        });
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
      const receipt = await commitStepUp(token, state.sessionId);
      setState({
        kind: "committed",
        operationId: receipt.operationId,
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

async function openStepUp(
  accessToken: string,
  controlRef: string,
): Promise<{
  readonly sessionId: string;
  readonly summary: string;
}> {
  const response = await fetch("/api/step-up/open", {
    body: JSON.stringify({ controlRef }),
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    throw new Error(errorMessage(body, "step_up_open_failed"));
  }
  const parsed = body as { sessionId?: unknown; summary?: unknown };
  if (
    typeof parsed.sessionId !== "string" ||
    parsed.sessionId.length === 0 ||
    typeof parsed.summary !== "string"
  ) {
    throw new Error("step_up_open_invalid");
  }
  return { sessionId: parsed.sessionId, summary: parsed.summary };
}

async function commitStepUp(
  accessToken: string,
  sessionId: string,
): Promise<{ readonly operationId: string }> {
  const response = await fetch("/api/step-up/commit", {
    body: JSON.stringify({ sessionId }),
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    throw new Error(errorMessage(body, "step_up_commit_failed"));
  }
  const parsed = body as { operationId?: unknown };
  if (typeof parsed.operationId !== "string" || parsed.operationId.length === 0) {
    throw new Error("step_up_commit_missing_receipt");
  }
  return { operationId: parsed.operationId };
}

function errorMessage(body: unknown, fallback: string): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as { error: unknown }).error === "string"
  ) {
    return (body as { error: string }).error;
  }
  return fallback;
}
