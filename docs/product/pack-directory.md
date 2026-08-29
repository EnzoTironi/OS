# Pack directory

Public Packs are listed by outcome and use case, not by internal crate or module names.

The live web surface is `/packs` (catalog) and `/packs/:digest` (PackDigest identity). Conversation entry from that surface routes into `/onboarding` with opaque `pack`, `referral`, and `intent` query preserved into `captureGoal`. There is no Chat SDK or fake chat backend on the marketing Pack pages.

## What each Pack page shows

- Outcome: what the Pack does for the company
- Publisher attribution
- Required integrations or data sources
- High-level permissions
- FirstSuccess definition
- Install and share actions
- Link to a relevant demo when one exists

Broken or missing Pack digests fail closed with an explicit unsupported state. Secret-shaped and test credential fields never appear on the page.

## Install and share today

Install and opaque share links come from the signed Pack registry landed in #260. `PackDigest` is the only version identity. Install never activates definitions by itself. Private and offline opens use the same verify rules as the public registry.

Registry, Kitchen, and the archived web Pack directory live on [`archive/pre-modeled-erp`](https://github.com/EnzoTironi/OS/tree/archive/pre-modeled-erp). Checkout that branch for `just e2e pack-registry`, `just e2e pack-kitchen`, and the public-surface-web runner. They are not on default `main`.

## Kitchen authoring

Kitchen (#264) has landed. It is archived (optional `just e2e pack-kitchen` on `archive/pre-modeled-erp`). It is the creator workflow that turns a working tenant or local use case into a candidate Pack, validates dependencies and permissions, signs or exports it, and optionally publishes a Surface. Do not invent a marketplace storefront, payments, or ranking UI here.

## Out of scope

- Marketplace commerce
- Activate-on-install
- Brazil fiscal vendor packs while #214 is parked
- Linq or other paid messaging as a required Pack dependency for self-host
- Fake chat transcript as a Pack demo
