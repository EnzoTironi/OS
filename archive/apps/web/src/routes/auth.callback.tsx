import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { completeOidcLogin } from "../auth.js";
import { loadRuntimeConfig } from "../config.js";

export const Route = createFileRoute("/auth/callback")({
  component: OidcCallback,
});

function OidcCallback() {
  const [error, setError] = useState<string>();
  useEffect(() => {
    void finish();
    async function finish(): Promise<void> {
      try {
        const config = await loadRuntimeConfig();
        await completeOidcLogin(config);
        window.location.replace("/");
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    }
  }, []);
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <span className="eyebrow">Zoen identity</span>
        <h1>Completing sign in</h1>
        {error === undefined ? (
          <p role="status">Validating the OIDC session.</p>
        ) : (
          <p role="alert">{error}</p>
        )}
      </section>
    </main>
  );
}
