import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import {
  conversationEntryHref,
  packCatalogEntrySchema,
  type PackCatalogEntry,
} from "../pack-registry.js";

const searchSchema = z
  .object({
    entries: z.array(packCatalogEntrySchema),
  })
  .strict();

export const Route = createFileRoute("/packs/")({
  component: PacksDirectoryPage,
});

type PageState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly entries: readonly PackCatalogEntry[] }
  | { readonly kind: "unsupported"; readonly reason: string };

function PacksDirectoryPage() {
  const [state, setState] = useState<PageState>({ kind: "loading" });
  const [intent, setIntent] = useState("");

  useEffect(() => {
    void loadCatalog(setState);
  }, []);

  function onStartConversation(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const wording = intent.trim();
    window.location.assign(
      conversationEntryHref({
        intent: wording.length > 0 ? wording : undefined,
        referral: "ref.web.packs",
      }),
    );
  }

  return (
    <main className="packs-shell" data-packs-surface="directory">
      <header className="packs-header">
        <span className="eyebrow">Outcome-first Packs</span>
        <h1>Pack directory</h1>
        <p>
          Public Packs are listed by the outcome they deliver, not by crate or
          module names. Install never activates definitions by itself.
        </p>
      </header>

      <section className="packs-card" data-conversation-entry="packs-landing">
        <h2>Start from an outcome</h2>
        <p>
          Conversation entry routes into onboarding with pack, referral, and
          intent preserved. There is no fake chat backend on this page.
        </p>
        <form onSubmit={onStartConversation}>
          <label className="field" htmlFor="packs-intent">
            <span>What should Zoen take care of?</span>
            <textarea
              data-conversation-field="intent"
              id="packs-intent"
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

      {state.kind === "loading" ? (
        <p role="status">Loading public Packs from the registry.</p>
      ) : null}
      {state.kind === "unsupported" ? (
        <section className="packs-card" data-packs-state="unsupported">
          <h2>Pack directory unavailable</h2>
          <p role="alert">{state.reason}</p>
        </section>
      ) : null}
      {state.kind === "ready" ? (
        <ul className="packs-list" data-packs-list="public">
          {state.entries.map((entry) => (
            <li key={entry.packDigest}>
              <Link
                data-pack-digest={entry.packDigest}
                data-pack-outcome={entry.outcomeLabel}
                params={{ digest: entry.packDigest }}
                to="/packs/$digest"
              >
                <span className="eyebrow">{entry.categories.join(" · ") || "Pack"}</span>
                <strong>{entry.outcomeLabel}</strong>
                <span className="packs-meta">
                  Publisher <code>{entry.publisherId}</code>
                </span>
              </Link>
            </li>
          ))}
          {state.entries.length === 0 ? (
            <li data-packs-empty="true">No public Packs are listed yet.</li>
          ) : null}
        </ul>
      ) : null}
    </main>
  );
}

async function loadCatalog(
  setState: (state: PageState) => void,
): Promise<void> {
  try {
    const response = await fetch("/api/packs/search");
    const body: unknown = await response.json();
    if (!response.ok) {
      const reason =
        typeof body === "object" &&
        body !== null &&
        "error" in body &&
        typeof (body as { error: unknown }).error === "string"
          ? (body as { error: string }).error
          : "Pack registry search failed closed.";
      setState({ kind: "unsupported", reason });
      return;
    }
    const parsed = searchSchema.parse(body);
    setState({ entries: parsed.entries, kind: "ready" });
  } catch (cause: unknown) {
    setState({
      kind: "unsupported",
      reason: cause instanceof Error ? cause.message : String(cause),
    });
  }
}
