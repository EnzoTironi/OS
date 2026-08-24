# Zoen OS

Zoen is an executable semantic operating system for organizations.

Humans, agents, and software operate the same organization through the same governed capabilities: meaning, evidence, authority, actions, history, and external effects.

## Demo

Three production-shaped entry demos are documented in `docs/demos/README.md`:

1. **Five-minute company.** Sample Company walkthrough (`just e2e activation-sample`).
2. **Agent safely acts.** Real model harness and governed Action (`just e2e agent-capabilities-live`).
3. **Your messy data.** Read-only source to mapping ambiguity to Shadow recommendation (`just e2e company-bootstrap-shadow`).

A recorded 45 to 90 second product video and live conversation entry remain open on #267. Do not expect a fake chat widget or a marketing-only backend.

## Quickstart

Prerequisites: Docker, `just`, Node 22+, and a Rust toolchain (or a prebuilt `target/debug/zoend`).

```bash
git clone https://github.com/EnzoTironi/OS.git && cd OS
just build
just start                 # compose up, wait on real probes, seed Sample Company, print URLs
open http://127.0.0.1:58359 # OIDC login (web-user / web-password), at-risk stock, propose/approve
just status                # Ready | Degraded | Stopped + component lines
just doctor                # fail-closed diagnosis; never claims Ready while unhealthy
just reset-sample          # wipe sample tenant authority rows and reseed
just stop                  # tear down compose + host processes
```

Acceptance of the same path (non-interactive):

```bash
just e2e activation-sample
```

`just start` is idempotent. It waits on postgres, Keycloak OIDC discovery, zoend, web, and a Sample Company world probe. It never treats sleep as readiness. Restart/`ensure` keeps the Sample commitment operation id stable.

## Sample Company

Sample Company is the five-minute first Action path.

1. Start the stack with `just start`.
2. Sign in at the printed web URL with the sample OIDC user.
3. Open at-risk stock, propose a governed recommendation, and approve it.
4. Follow the effect path when the connector is ambiguous: local commit is not remote success, and blind retry stays forbidden.

Prove the same path without a browser:

```bash
just e2e activation-sample
```

Inspect ontology authoring and Pack creation only after this first success. Progressive depth lives in `docs/product/public-narrative.md`.

## Packs

Packs ship outcomes, not module names.

Each Pack should answer what it does for the company, who published it, which integrations or data it needs, high-level permissions, how FirstSuccess looks, and how to install or share it.

Outcome-first directory copy lives in `docs/product/pack-directory.md`. The live web directory is `/packs`. Install and share resolve through the signed Pack registry from #260 (`just e2e pack-registry`). Kitchen authoring (#264) has landed (`just e2e pack-kitchen`). Full marketplace commerce is out of scope.

## Why not LLM + tools

Zoen is not an agent bolted onto APIs, a knowledge graph, a workflow builder, or a drop-in ERP replacement.

- Evidence is not automatically truth. Belief stays explicit and attributable.
- Humans and agents use the same semantic Query and Action contracts.
- Actions are governed and revalidated before commit. Cedar and publish/activate stay on the path.
- Local commit is not remote success. External effects can stay `unknown` until reconciliation.
- History and ontology revisions are reproducible.
- Self-hosted deployment is first-class from the same signed artifacts.

LLM calls, MCP adapters, chat buttons, and transport providers stay replaceable surfaces. They must not become a second semantic authority.

## Self-host

The same OCI/Helm release can run as shared multi-tenant SaaS, dedicated Zoen-hosted deployment, or customer-controlled self-hosted infrastructure. Core operation has no mandatory Zoen Cloud dependency.

Paid chat or messaging providers stay optional for self-host. Phone, group, thread, and IdP groups are not membership. Humans authenticate at Keycloak; an Active Membership row is the source of tenant and principal for a bound account.

Deployment profiles and install reference live under `deploy/`. Release confidence still runs through `just verify-v1` with production-shaped evidence.

## Architecture

V1 is planned as the production architecture, not as a disposable MVP. Implementation is decomposed into independently verifiable vertical slices, but every slice uses the real architectural path it claims to deliver.

The semantic center remains deliberately small:

- canonical semantic model: `Type + Relation + Computation + Action`;
- business-specific meaning lives in immutable/versioned definitions, not runtime branches;
- meaningful business mutation goes through governed Actions;
- evidence, organizational belief, approval, local commit and external outcome remain distinct;
- valid time, knowledge time, provenance, authority, causal history and uncertainty are explicit;
- human, API, automation and AI agents use the same semantic Query/Action contracts;
- Rust owns semantic authority;
- PostgreSQL 18 is the transactional authority/commit backend;
- DataFusion is the V1 semantic read/compute engine over authoritative and Arrow/Parquet materialized sources;
- Cedar evaluates policy, Wasmtime executes untrusted/custom components and Restate provides durable orchestration behind Zoen-owned semantic boundaries;
- TypeScript owns ontology authoring, Company Brain/agent intelligence and experience surfaces without becoming semantic authority;
- public machine protocol uses Protobuf + Buf + ConnectRPC; semantic definition identity uses canonical JSON/JCS + SHA-256 separately;
- shared SaaS, dedicated and fully self-hosted deployment are first-class from the same signed artifacts;
- every completed V1 capability requires a production-shaped E2E proof; mocks/stubs cannot satisfy release completion.

Architecture decisions live in [`docs/adr`](docs/adr/README.md). The prescriptive V1 Wayfinder, Specs and E2E build tickets live in GitHub Issues.

### V1 deployment and scale target

The reference production architecture targets single-region HA (>=99.9%), RPO <5 minutes and RTO <30 minutes, with a validation envelope around 100M semantic records per company, millions of knowledge fragments, roughly 1,000 users per tenant and peak hundreds of Action commits per second where the domain workload permits.

### V1 enterprise scope

V1 ships versioned ontology libraries for Party, Product, Commercial, Inventory, Procurement, Manufacturing and an Accounting Foundation. Brazilian fiscal semantics remain a versioned domain extension behind replaceable provider boundaries. Live Brazil fiscal vendors stay parked until #214 and are not advertised by default.

### Research phase

The architecture was preceded by a two-day, agent-intensive research/falsification phase using disposable Python and PostgreSQL prototypes. That code is intentionally not the production foundation. Git history and closed GitHub issues/PRs preserve the experiments and counterexamples; surviving laws are condensed into ADRs and V1 conformance properties.

## V1 release gate

The official V1 release decision against production evidence is:

```text
just verify-v1
```

Named gate-contract PASS (fixtures under `e2e/verify-v1/testdata/complete`, not production evidence):

```text
ZOEN_VERIFY_EVIDENCE_DIR=e2e/verify-v1/testdata/complete just verify-v1
```

or `just verify-v1-fixtures`.

`verify-v1` is an aggregate-only gate. It consumes typed scenario evidence under `artifacts/` (or `ZOEN_VERIFY_EVIDENCE_DIR`), validates explicit scenario pass fields, source commits, scale class/size, signatures, semantic mutants, RPO/RTO targets, and any advertised live-provider slots, runs verification-layer mutants in-process, and writes a signed `zoen.verify.v1` bundle to `artifacts/verify-v1/`. It does not rerun KIND or wipe existing evidence. Missing, stale, unsigned, wrong-digest, surviving-mutant, or advertised-live-absent evidence fails closed.

Live Brazil fiscal vendors stay parked until #214 and are not advertised by default.

`just verify` remains the serial scenario runner (check + build + scenarios). It is not a substitute for `just verify-v1`.

Public-surface heading and Quickstart checks (until the coordinator registers `just e2e public-surface`):

```bash
npx tsx e2e/public-surface.ts
```

## Development rules

> Meaning in definitions. Universal laws in the kernel. Infrastructure behind replaceable boundaries. Everything else is a surface.

> Small ticket does not mean partial architecture: each V1 ticket must prove a real vertical production path E2E.
