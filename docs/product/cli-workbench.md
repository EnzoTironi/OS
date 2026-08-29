# CLI workbench

Zoen’s ontology door for agents and humans is a product CLI inside a bash workbench. Not a menu of native tools. Not a generated TypeScript SDK.

## Runtime (Brex)

Tools give access. Bash gives a workbench. See https://www.brex.com/journal/long-running-agents-need-bash and https://x.com/brexHQ/status/2077063945085415655.

The model-visible surface is bash plus files on a per-membership VFS. Raw query results live on disk. Pipes and `jq` reduce them. The transcript only sees the leftover. Do not add a native tool for every cell of (noun × filter).

Production execution is Wasmtime + planted `zoen` and `anydoc`. `just-bash` is not the production runtime. Eve `defineSandbox` must isolate by membership. The worker cannot commit and cannot speak.

## Command shape (Cloudflare / Wrangler)

`zoen <noun> <verb>`. Layered `--help` with copy-paste examples. Flags over prompts. `--dry-run` on mutations. JSON on stdout. Non-interactive first.

```
zoen world query
zoen world evidence
zoen action discover
zoen action propose
zoen action commit
zoen definition publish
zoen source connect
zoen source introduce
zoen source sync
zoen history explain
zoen auth login
```

Example composition:

```
zoen definition publish --file definition.canonical.json
zoen source connect google --profile drive
zoen source introduce drive --folder Laudos
zoen source sync drive
zoen world query --type world.Pedido > /tmp/q.json
jq '...' /tmp/q.json | zoen action propose --stdin
zoen action commit --proposal-id ID --dry-run
```

`source connect` writes instance config on the membership workbench. Google is a planted profile on the Zoen OAuth app. Introduce a folder, not the account. Door tokens are not ingest authority. Isolate `zoen action commit` stays denied.

## Authority

The binary does not govern. Every mutation is propose → Cedar → commit on zoend. Bearer comes from Better Auth (device login). No god token. No local world writes. CLI, HTTP, and MCP are the same verbs.

## Not the product

`zoen query <json>` in the planted isolate is a stub. `@zoen/sdk` and `@zoen/osdk` are not this door. `@zoen/ontology` and `.zoen.ts` are not the compiler. Publish canonical JSON. Do not generate a client to replace this CLI.
