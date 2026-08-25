import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { conversationEntryHref } from "../pack-registry.js";

const detailSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("ok"),
      packDigest: z.string().min(1),
      packId: z.string().min(1),
      version: z.string().min(1),
      outcome: z.string().min(1),
      summary: z.string().min(1),
      publisher: z
        .object({
          displayName: z.string().min(1),
          publisherId: z.string().min(1),
        })
        .strict(),
      requiredIntegrations: z.array(
        z
          .object({
            requirementId: z.string().min(1),
            kind: z.string().min(1),
            scope: z.string().min(1),
            necessity: z.string().min(1),
          })
          .strict(),
      ),
      permissions: z.array(
        z
          .object({
            requirementId: z.string().min(1),
            sensitivity: z.string().min(1),
            scope: z.string().min(1),
          })
          .strict(),
      ),
      firstSuccess: z
        .object({
          contractId: z.string().min(1),
          outcome: z.record(z.string(), z.unknown()),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("unsupported"),
      reason: z.string().min(1),
    })
    .strict(),
]);

type DetailView = z.infer<typeof detailSchema>;

export const Route = createFileRoute("/packs/$digest")({
  component: PackDetailPage,
});

type PageState =
  | { readonly kind: "loading" }
  | { readonly kind: "view"; readonly view: DetailView };

function PackDetailPage() {
  const { digest } = Route.useParams();
  const [state, setState] = useState<PageState>({ kind: "loading" });

  useEffect(() => {
    void loadDetail(digest, setState);
  }, [digest]);

  if (state.kind === "loading") {
    return (
      <main className="packs-shell">
        <p role="status">Opening Pack from the registry.</p>
      </main>
    );
  }

  if (state.view.kind === "unsupported") {
    return (
      <main className="packs-shell" data-packs-state="unsupported">
        <section className="packs-card">
          <span className="eyebrow">Pack directory</span>
          <h1>Pack unavailable</h1>
          <p role="alert" data-packs-unsupported-reason={state.view.reason}>
            {state.view.reason}
          </p>
          <Link to="/packs/">Back to Pack directory</Link>
        </section>
      </main>
    );
  }

  const pack = state.view;
  const installHref = conversationEntryHref({
    intent: pack.outcome,
    pack: pack.packDigest,
    referral: "ref.web.packs.install",
  });
  const shareHref = conversationEntryHref({
    intent: pack.outcome,
    pack: pack.packDigest,
    referral: "ref.web.packs.share",
  });

  return (
    <main
      className="packs-shell"
      data-pack-digest={pack.packDigest}
      data-packs-state="ok"
    >
      <section className="packs-card">
        <span className="eyebrow">Pack · digest identity</span>
        <h1 data-pack-field="outcome">{pack.outcome}</h1>
        <p data-pack-field="summary">{pack.summary}</p>
        <dl className="packs-dl">
          <div>
            <dt>Publisher</dt>
            <dd data-pack-field="publisher">
              {pack.publisher.displayName}{" "}
              <code>{pack.publisher.publisherId}</code>
            </dd>
          </div>
          <div>
            <dt>PackDigest</dt>
            <dd>
              <code data-pack-field="digest">{pack.packDigest}</code>
            </dd>
          </div>
          <div>
            <dt>Required integrations</dt>
            <dd data-pack-field="integrations">
              {pack.requiredIntegrations.length === 0
                ? "None required"
                : pack.requiredIntegrations
                    .map((row) => `${row.scope} (${row.kind})`)
                    .join(", ")}
            </dd>
          </div>
          <div>
            <dt>High-level permissions</dt>
            <dd data-pack-field="permissions">
              {pack.permissions
                .map((row) => `${row.scope}: ${row.sensitivity}`)
                .join(", ")}
            </dd>
          </div>
          <div>
            <dt>FirstSuccess</dt>
            <dd data-pack-field="first-success">
              <code>{pack.firstSuccess.contractId}</code>
            </dd>
          </div>
        </dl>
        <div className="packs-actions">
          <a data-pack-action="install" href={installHref}>
            Install via onboarding
          </a>
          <a data-pack-action="share" href={shareHref}>
            Share entry link
          </a>
        </div>
        <p className="packs-note">
          Install and share resolve through the signed Pack registry. This page
          does not activate definitions and does not run a fake chat backend.
        </p>
        <Link to="/packs/">Back to Pack directory</Link>
      </section>
    </main>
  );
}

async function loadDetail(
  digest: string,
  setState: (state: PageState) => void,
): Promise<void> {
  try {
    const response = await fetch("/api/packs/open", {
      body: JSON.stringify({ packDigest: digest }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const body: unknown = await response.json();
    const view = detailSchema.parse(body);
    setState({ kind: "view", view });
  } catch (cause: unknown) {
    setState({
      kind: "view",
      view: {
        kind: "unsupported",
        reason: cause instanceof Error ? cause.message : String(cause),
      },
    });
  }
}
