# Zoen OS

Zoen is an executable semantic operating system for organizations.

The system models organizational meaning, evidence, authority, actions, history and external effects so humans, agents and software can operate the same organization through the same governed capabilities.

## Architecture v0

The current direction is deliberately small at the semantic center:

- canonical semantic hypothesis: `Type + Relation + Computation + Action`;
- business-specific meaning lives in versioned definitions, not runtime branches;
- meaningful business mutation goes through governed Actions;
- evidence, organizational belief, approval, local commit and external outcome remain distinct;
- time, provenance, authority, causal history and uncertainty are explicit;
- published definitions are immutable and historically reproducible;
- Rust owns semantic authority;
- PostgreSQL is the initial durable authority store;
- the intelligence and experience plane is replaceable and may use TypeScript, agent harnesses, Company Brain capabilities and generated surfaces.

Architecture decisions live in [`docs/adr`](docs/adr/README.md). Active planning, specs and implementation tickets live in GitHub Issues.

## Research phase

The architecture was preceded by a two-day, agent-intensive research and falsification phase using disposable Python and PostgreSQL prototypes. That code is intentionally not part of the production foundation. Its implementation, reviews, failures and counterexamples remain available in Git history and closed GitHub issues and pull requests; surviving laws are condensed into ADRs.

## Development rule

> Meaning in definitions. Universal laws in the kernel. Infrastructure behind replaceable boundaries. Everything else is a surface.
