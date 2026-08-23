import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { completeApproveOidcLogin } from "../auth.js";
import { loadRuntimeConfig } from "../config.js";

export const Route = createFileRoute("/approve/auth/callback")({
  component: ApproveOidcCallback,
});

function ApproveOidcCallback() {
  const [error, setError] = useState<string>();
  useEffect(() => {
    void finish();
    async function finish(): Promise<void> {
      try {
        const config = await loadRuntimeConfig();
        const controlRef = await completeApproveOidcLogin(config);
        window.location.replace(`/approve/${encodeURIComponent(controlRef)}`);
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    }
  }, []);
  return (
    <main className="auth-shell">
      <section className="auth-card" data-approve-surface="oidc-callback">
        <span className="eyebrow">Zoen approval</span>
        <h1>Completing step-up sign in</h1>
        {error === undefined ? (
          <p role="status">Binding OIDC to the opaque control ref.</p>
        ) : (
          <p role="alert">{error}</p>
        )}
      </section>
    </main>
  );
}
