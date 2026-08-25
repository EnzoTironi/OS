import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { OnboardingClient } from "../onboarding-client.js";

export const Route = createFileRoute("/onboarding/auth/callback")({
  component: OnboardingAuthCallback,
});

function OnboardingAuthCallback() {
  const [error, setError] = useState<string>();
  useEffect(() => {
    void finish();
    async function finish(): Promise<void> {
      try {
        const parameters = new URLSearchParams(window.location.search);
        const digest =
          parameters.get("digest") ??
          sessionStorage.getItem("zoen.onboarding.digest.v1");
        const accountId =
          parameters.get("accountId") ??
          sessionStorage.getItem("zoen.onboarding.account.v1");
        if (digest === null || accountId === null) {
          throw new Error("Missing GoalDigest resume handle");
        }
        const client = new OnboardingClient();
        const resumed = await client.resume({ digest, accountId });
        if (resumed.wording.length === 0) {
          throw new Error("Blank onboarding session after callback");
        }
        sessionStorage.setItem("zoen.onboarding.digest.v1", resumed.digest);
        window.location.replace(
          `/onboarding/?digest=${encodeURIComponent(resumed.digest)}&accountId=${encodeURIComponent(accountId)}`,
        );
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    }
  }, []);
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <span className="eyebrow">Zoen onboarding</span>
        <h1>Resuming your goal</h1>
        {error === undefined ? (
          <p role="status">Binding the auth callback to GoalDigest.</p>
        ) : (
          <p role="alert">{error}</p>
        )}
      </section>
    </main>
  );
}
