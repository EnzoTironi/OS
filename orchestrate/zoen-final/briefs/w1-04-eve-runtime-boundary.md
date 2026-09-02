# W1-04 Eve runtime boundary

## Goal

Make Eve use the real internal Ontology URL in the one-Fly runtime and delete the obsolete channel gateway and `conversation_stage` product paths. Eve remains the only conversation product; Ontology retains no parallel conversation source of truth.

## Queue and ownership

- Prepared branch: `codex/w1-04-eve-runtime-paths`.
- Prepared worktree: `/Users/enzotironi/Codex/zoen-w1-04-eve-runtime`.
- State stays queued until W1-02 lands. Rebase onto the merged W1-02 head before editing shared deploy topology.
- W1-04 owns internal Eve-to-Ontology URL configuration, removal of legacy `/channels/*`, removal of `conversation_stage`, obsolete conversation storage, and the corresponding J5/J8 proof.
- W3 owns `TurnCapability`, ambient credential deletion, fixed operation IDs, and the `unbound` workbench removal. W5 owns real channel binding and cross-channel continuity. Do not pull that work forward.

## Required design

1. Use one canonical internal Ontology URL, `ZOEN_ZOEND`, throughout Eve. Remove `ZOEN_ZOEND_BASE_URL` rather than keeping an alias. `zoen-start-eve` must require a non-empty canonical URL. Production has no fallback to the test-only `:58705` address.
2. Preserve `ZOEN_AUTH_BASE_URL` for the Better Auth door. Normalize trailing slashes at the boundary and never invent a public or local URL.
3. Delete the zoend `messaging_ingress` router and all four `/channels/whatsapp|telegram/advertise|inbound` routes. Canonical destinations remain Eve-owned `/eve/v1/kapso` and `/eve/v1/telegram` through `eve_proxy`.
4. Delete the in-memory `conversation_stage` router, its `/conversation/stages` and `/conversation/who-can` routes, the Eve `who_can` tool, the `ConversationStage` domain types, and the special `zoen.world.whoCan` action/delegation path. Do not leave an alias or replacement endpoint.
5. Delete orphaned zoend webhook HMAC/replay code. Move the still-required constant-time machine-token comparison into the identity boundary without preserving the ingress module.
6. Delete the obsolete `PostgresIngressReplayStore` adapter and use the next migration after W1-02 to drop `interaction_records`, `conversation_pending`, `conversation_turns`, `turn_attempts`, `conversation_arms`, `delivery_intents`, `delivery_observations`, `delivery_send_claims`, `reply_ledger`, and `ingress_replay`. They have no runtime callers and violate Eve ownership. Keep historical migrations immutable and update state classification atomically.
7. Remove dependencies, imports, fixtures, and source-string proofs made dead by those deletions. Do not preserve compatibility routes or data. Development and test data are disposable.
8. Do not modify the buffered Eve proxy into a streaming proxy in this unit. Do not send real Telegram or Kapso messages; W1-05 records the browser identities first.

## Likely files

- `apps/conversation/agent/channels/eve.ts`
- `apps/conversation/agent/sandbox/workbench.ts`
- `apps/conversation/agent/tools/who_can.ts` (delete)
- `apps/conversation/scripts/prove-s3-workbench.sh`
- `deploy/fly/zoen-start-eve`
- `deploy/fly/fly.toml`
- `apps/zoend/src/main.rs`
- `apps/zoend/src/messaging_ingress.rs` (delete)
- `apps/zoend/src/conversation_stage.rs` (delete)
- `apps/zoend/src/ingress_hmac.rs` (delete after retaining the identity comparison)
- `apps/zoend/src/identity_admin_auth.rs`
- `apps/zoend/Cargo.toml`
- `crates/zoen-core/src/conversation.rs` (delete)
- `crates/zoen-core/src/lib.rs`
- `crates/zoen-engine/src/action.rs` and `scenario.rs`
- `crates/zoen-adapters/src/ingress_replay_store.rs` (delete)
- `crates/zoen-adapters/src/lib.rs`
- New post-W1-02 removal migration
- `apps/zoend/state-classification.yaml`
- `e2e/messaging-boundary.ts` and obsolete helper deletion

## Journey acceptance

Use live product paths, not unit tests or a source-only proxy.

- The local Eve workbench journey authenticates through Better Auth, resolves Membership through canonical `ZOEN_ZOEND`, and reaches the actual zoend address. Absence of `ZOEN_ZOEND` fails startup instead of falling back.
- Through the public zoend listener, actual Eve health is reachable at `/eve/v1/health`; unsigned Kapso reaches the Eve-owned `/eve/v1/kapso` boundary and is rejected by that adapter.
- `/channels/whatsapp/*`, `/channels/telegram/*`, `/conversation/stages`, and `/conversation/who-can` all return not found and have no alternate alias.
- The removed Postgres conversation and ingress tables are absent after migrations; `/ready` still passes authority integrity.
- The `messaging-boundary` journey retains Account, ChannelBinding, Membership, tenant separation, unresolved-subject denial, and import-graph assertions while deleting the mock legacy-gateway proof.
- Full verification proves no consumer still imports the removed domain or adapter surface.

No new unit tests, mocks, fakes, stubs, or `vi.mock` are allowed. Remove touched local unit-test-only legacy modules rather than porting them.

## Verification

- Conversation typecheck and Eve build
- `apps/conversation/scripts/prove-s3-workbench.sh`
- `./e2e/run.sh messaging-boundary`
- `./e2e/run.sh activation-identity`
- Full `./e2e/run.sh verify`
- Rust format, compile, and Clippy
- Local release image/process inspection after rebasing W1-02
- Repository search proving removed routes, config alias, product types, adapter, and tables have no surviving runtime reference
- `git diff --check`
- Independent exact-head code review before ledger entry

## Exclusions

No channel linking, browser account action, Telegram/Kapso send, `TurnCapability`, unbound-workbench deletion, ambient tool credential migration, fixed-ID redesign, streaming proxy rewrite, Redis, Restate in Eve, or compatibility alias.

