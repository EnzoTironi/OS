import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";
import {
  OnboardingClient,
  type PlanNextView,
} from "../onboarding-client.js";

export const Route = createFileRoute("/onboarding/")({
  component: OnboardingPage,
  validateSearch: (search: Record<string, unknown>) => ({
    pack: typeof search.pack === "string" ? search.pack : undefined,
    referral: typeof search.referral === "string" ? search.referral : undefined,
    intent: typeof search.intent === "string" ? search.intent : undefined,
    digest: typeof search.digest === "string" ? search.digest : undefined,
    accountId:
      typeof search.accountId === "string" ? search.accountId : undefined,
  }),
});

type PageState =
  | { readonly kind: "capture" }
  | {
      readonly kind: "ask";
      readonly digest: string;
      readonly wording: string;
      readonly accountId: string;
      readonly next: PlanNextView;
    }
  | { readonly kind: "ready"; readonly wording: string }
  | { readonly kind: "done"; readonly wording: string }
  | { readonly kind: "error"; readonly message: string };

function OnboardingPage() {
  const search = Route.useSearch();
  const entry = useMemo(
    () => ({
      intent: search.intent,
      pack: search.pack,
      referral: search.referral,
    }),
    [search.intent, search.pack, search.referral],
  );
  const [state, setState] = useState<PageState>({ kind: "capture" });
  const [wording, setWording] = useState(search.intent ?? "");
  const client = new OnboardingClient();

  async function onCapture(event: FormEvent): Promise<void> {
    event.preventDefault();
    try {
      const accountId =
        sessionStorage.getItem("zoen.onboarding.account.v1") ??
        `provisional.${crypto.randomUUID()}`;
      sessionStorage.setItem("zoen.onboarding.account.v1", accountId);
      const captured = await client.captureGoal({
        wording,
        accountId,
        workspaceClass: "enterprise",
        pack: entry.pack,
        referral: entry.referral,
        intent: entry.intent ?? wording,
      });
      sessionStorage.setItem("zoen.onboarding.digest.v1", captured.digest);
      if (captured.entry !== undefined) {
        sessionStorage.setItem(
          "zoen.onboarding.entry.v1",
          JSON.stringify(captured.entry),
        );
      }
      if (captured.next.kind === "ask") {
        setState({
          kind: "ask",
          digest: captured.digest,
          wording: captured.wording,
          accountId: captured.accountId,
          next: captured.next,
        });
        return;
      }
      if (captured.next.kind === "ready_for_outcome") {
        setState({ kind: "ready", wording: captured.wording });
        return;
      }
      if (captured.next.kind === "first_success") {
        setState({ kind: "done", wording: captured.wording });
        return;
      }
      setState({
        kind: "error",
        message: `${captured.next.reason}: ${captured.next.detail}`,
      });
    } catch (cause: unknown) {
      setState({
        kind: "error",
        message: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  async function onContinueGrant(): Promise<void> {
    if (state.kind !== "ask" || state.next.kind !== "ask") {
      return;
    }
    try {
      const begun = await client.beginGrant({
        digest: state.digest,
        accountId: state.accountId,
        missing: state.next.missing,
      });
      sessionStorage.setItem(
        "zoen.onboarding.resume-token.v1",
        begun.resumeToken,
      );
      window.location.assign(begun.redirectUrl);
    } catch (cause: unknown) {
      setState({
        kind: "error",
        message: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" data-onboarding-surface="outcome-first">
        <span className="eyebrow">Zoen onboarding</span>
        {state.kind === "capture" ? (
          <>
            <h1>What do you want Zoen to take care of?</h1>
            <p>
              Describe the outcome in your words. Zoen asks for only the next
              capability it needs.
            </p>
            {entry.pack !== undefined ||
            entry.referral !== undefined ||
            entry.intent !== undefined ? (
              <p
                data-onboarding-entry="preserved"
                data-onboarding-intent={entry.intent ?? ""}
                data-onboarding-pack={entry.pack ?? ""}
                data-onboarding-referral={entry.referral ?? ""}
              >
                Entry context preserved into onboarding
                {entry.pack !== undefined ? (
                  <>
                    {" "}
                    · pack <code>{entry.pack}</code>
                  </>
                ) : null}
                {entry.referral !== undefined ? (
                  <>
                    {" "}
                    · referral <code>{entry.referral}</code>
                  </>
                ) : null}
                {entry.intent !== undefined ? (
                  <>
                    {" "}
                    · intent <code>{entry.intent}</code>
                  </>
                ) : null}
              </p>
            ) : null}
            <form onSubmit={(event) => void onCapture(event)}>
              <label>
                Goal
                <textarea
                  data-onboarding-field="goal"
                  name="goal"
                  required
                  rows={4}
                  value={wording}
                  onChange={(event) => setWording(event.target.value)}
                  placeholder="why inventory disagrees with the warehouse"
                />
              </label>
              <button type="submit">Continue</button>
            </form>
          </>
        ) : null}
        {state.kind === "ask" && state.next.kind === "ask" ? (
          <>
            <h1>One step for your goal</h1>
            <p data-onboarding-goal={state.digest}>{state.wording}</p>
            <p data-onboarding-missing={state.next.missing.kind}>
              {state.next.missing.why}
            </p>
            <button type="button" onClick={() => void onContinueGrant()}>
              Continue
            </button>
          </>
        ) : null}
        {state.kind === "ready" ? (
          <>
            <h1>Ready for first result</h1>
            <p>{state.wording}</p>
          </>
        ) : null}
        {state.kind === "done" ? (
          <>
            <h1>First success</h1>
            <p>{state.wording}</p>
          </>
        ) : null}
        {state.kind === "error" ? (
          <>
            <h1>Onboarding blocked</h1>
            <p role="alert">{state.message}</p>
          </>
        ) : null}
      </section>
    </main>
  );
}
