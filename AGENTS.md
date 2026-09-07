# Agent laws

The same law lives in `.cursor/rules/journey-tests-and-restate.mdc`.

Zoen is three products. Ontology is the CLI, the API, and MCP. Conversation is Eve in `apps/conversation`. Auth door is Better Auth. A fourth product is out of scope.

The product bar is Poke plus Palantir for every audience. Poke is the conversational bar: intimate, sharp, human, no helpdesk script. Palantir is the ontology bar: published meaning, governed Action, evidence, the same verbs for a person, a family, a clinic, or a factory. Conversation is Eve; do not name the product Poke. Poke is the voice reference only.

Do not add unit tests, mocks, fakes, stubs, or `vi.mock`. Tests are journeys that drive a product as a user would. Import-graph locks live in dependency-cruiser or eslint, not `*.test.ts`.

Do not add Redis. Restate is ontology ZoenEffect only. Conversation durability is Eve.

WhatsApp dest is Kapso at `/eve/v1/kapso`. Do not use `@chat-adapter/whatsapp`. Telegram dest is Eve first-class at `/eve/v1/telegram` (`eve/channels/telegram`). Messaging flattens structured chrome to readable text for the person. Never invent a URL. Never ship helpdesk copy. Depth lives in ontology verbs and the membership workbench, not fake dashboards in chat.

## Pre-launch evolution

Zoen has not launched and has no production users or production data. Revisit this policy before the first production deployment.

Optimize for the smallest coherent design that represents the product today: Better Auth SessionDoor, planted `zoen`, Eve membership workbench, one Fly app, canonical JSON Publish, and `zoen-effect-dispatcher`.

Remove obsolete code, schemas, APIs, configuration, aliases, dest-wrong teaching, and transitional paths directly.

Do not add backward-compatibility shims, leftover aliases, dual-read or dual-write paths, or data-preserving backfills unless Enzo explicitly asks.

Internal interfaces are not public compatibility contracts. Update callers and journeys atomically when they change.

Development and test data are disposable. Prefer recreating those databases over complicating the product to preserve local data.

Treat migration history as a replaceable development baseline, but keep the checked-in migration chain and setup workflow coherent. Do not rewrite an already-applied migration without also resetting affected development and test databases.

Preserve database invariants, transactional safety, migration idempotence, and deterministic setup. Those are correctness properties, not backward-compatibility requirements.

Consolidate the migration baseline only as an explicit coordinated change, not as incidental work in a feature branch.

Do not add `#[allow(clippy::...)]` or other linter bypasses. Generated `gen/connect` protobuf is the exception.

Do not `.unwrap()`. Return `Result` or handle the case. Clippy `unwrap_used` is deny.

## ripwire — deterministic codebase maps (on PATH as `ripwire`)
Reach for it BEFORE blind grep + whole-file reads. First call ~1s cold; after that warm, ~0.1s.
- Orient on a task: `ripwire <dir> --for="<task in words>"` — ranked, quality-annotated
  signatures. Paste symbol/file names from the issue verbatim; named mentions get anchored.
- One task: `--pack-task="<task>"`; before parallel agents: `--plan-lanes=N --task="<goal>"`, then read `lanes[].execution`.
- Have a stack trace / build error: `ripwire <dir> --from-trace=FILE` (`-` = stdin) —
  paste the error, don't paraphrase it into a query.
- Who calls X: `--callers=SYM`. "Is it safe to change X?" needs the full blast radius:
  `--impact=SYM` (transitive) plus `--uses=SYM` (every read/write/import site).
- Apply a whole-symbol edit without a whole-file Read: `--replace-symbol-body=SYM` plus `--edit-payload=FILE|-`
  (or insert-before/after); the receipt carries region, blob_sha, edit_check, tests_to_run + ONE next= — no re-read after it; `--edit-check=SYM` is for a contract question WITHOUT an edit in hand.
- Before writing a new fn/class/helper: `--exemplar="<what you're writing>"` — duplicates are born on small tasks.
- Before calling work done: `--quality-delta` (what you made worse), then `--test-gate`.
- Trust notes: counts marked counts_floor are floors, not totals; a zero means "none
  found", never "none exists".
Defaults to break (less context is measurably MORE accurate, not just cheaper — code-repair
accuracy fell 29% -> 3% as context grew 32K -> 256K tokens, LongCodeBench):
- Do NOT open a file you have not located first: rank with `--for`/`--grep`, then read what it names.
- Do NOT read a whole file to understand one symbol: `--expand=SYM` gives the body + callee sigs.
- Do NOT fan reads across several files to learn one thing: `--pack-task="<task>"` is one call.
