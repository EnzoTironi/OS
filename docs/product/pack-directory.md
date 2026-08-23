# Pack directory

Public Packs are listed by outcome and use case, not by internal crate or module names.

## What each Pack page shows

- Outcome: what the Pack does for the company
- Publisher attribution
- Required integrations or data sources
- High-level permissions
- FirstSuccess definition
- Install and share actions
- Link to a relevant demo when one exists

## Install and share today

Install and opaque share links come from the signed Pack registry landed in #260. `PackDigest` is the only version identity. Install never activates definitions by itself. Private and offline opens use the same verify rules as the public registry.

Prove the registry path:

```bash
just e2e pack-registry
```

## Kitchen authoring

Kitchen (#264) is the creator workflow that turns a working tenant or local use case into a candidate Pack, validates dependencies and permissions, signs or exports it, and optionally publishes a Surface. That authoring path is still in flight. Do not invent a marketplace storefront, payments, or ranking UI here.

## Out of scope

- Marketplace commerce
- Activate-on-install
- Brazil fiscal vendor packs while #214 is parked
- Linq or other paid messaging as a required Pack dependency for self-host
