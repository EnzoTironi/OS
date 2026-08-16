# Open questions

**Kind:** unresolved uncertainty  
**Decision state:** undetermined unless a row says otherwise  
**Fetched:** 2026-08-16

Do not copy answers into `docs/open-questions.md`. If a later agent updates that file, it must cite a research artifact. This file is one such artifact. Several rows stay undetermined on purpose.

## Q1. Is `Agent` a type, an interface, or a word we should stop using?

`docs/open-questions.md` §11 asks whether Agent is merely a type implementing shared interfaces. RFC-0001 already hypothesizes Actor, Principal, and SoftwareAgent as interfaces and refuses Agent as a primitive.

This folder supports the non-primitive stance (L3, E11, E21). It does not close §11. The remaining uncertainty is naming. ValueFlows, PROV, FOAF, Cedar, and OpenFGA all use Agent for different kinds. Using the same word in OS will keep colliding.

**Decision state:** undetermined for the OS name. Supported that it is not a new primitive.

## Q2. How do `as`, `on behalf of`, task authority, and service identity differ?

§11 asks this directly. The candidate split is in `model.md`. L4 is supported as a distinction. The OS vocabulary for the three modes is still a hypothesis.

**Decision state:** distinction supported. Encoding undetermined until a synthesis pass.

## Q3. Does an automation have identity independent from the human who triggered it?

§11 asks this. E17 says yes. A scheduled run with no human must still resolve to a named automation principal. A human-triggered run may use `on_behalf_of` that human without becoming that human.

**Decision state:** hypothesis with ObjectStack and SPIFFE support. Not written into `docs/open-questions.md`.

## Q4. How is workload or process identity represented and audited?

§11 asks this. L2 says it is not a Party. The invocation record in `model.md` is a hypothesis for where it lives. Whether OS reuses SPIFFE IDs or only the distinction is undetermined.

**Decision state:** distinction supported. Representation undetermined. Wave B runtime choice.

## Q5. Is a task grant a Principal or a context attribute?

OpenFGA makes `task` a principal. Cedar would keep the person or service as principal and put purpose, time, and counts in context.

**Decision state:** undetermined. A5 through A7 work either way if the grant is a fact the checker can see.

## Q6. Are monetary limits a grant field or a derived fact?

E22. OpenFGA and Cedar can compare integers. Concurrent spends need a remaining-budget fact or the limit is a suggestion.

**Decision state:** undetermined.

## Q7. Must `impersonate` exist at all?

RFC 8693 needs it for token exchange. Hardy says the deputy must name which authority it uses. If OS forbids impersonation, some admin and break-glass flows need another encoding.

**Decision state:** undetermined. The folder's bias is to keep the mode and make it explicit, not to delete it.

## Q8. Who is the second pair of eyes when the first is an agent?

L9 says a different Actor. It does not say whether that Actor must be a Person, or may be a second SoftwareAgent acting for a different Party.

**Decision state:** undetermined.

## Q9. Is the runtime an Actor or an instrument?

PROV would allow SoftwareAgent. Schema.org would put the runtime in `instrument` and keep Person or Organization as `agent`.

**Decision state:** undetermined. Record both on the invocation until a provenance issue settles it. Do not invent a PROV-O commitment here.

## Q10. Can Organization be an Actor?

§11 says Organization may implement Actor. ValueFlows treats Organization as an Agent with its own agency. Cedar principals are often users and services. Palantir submission criteria name user ids and group ids.

**Decision state:** undetermined. Nothing fetched this session forbids an organization-level Actor. Nothing shows how SoD works when the Actor is a group.

## Q11. How does provenance join this chain?

`docs/open-questions.md` §8 asks whether provenance participates in policy. E11 shows `actedOnBehalfOf` as a provenance relation. L10 puts the chain on the invocation. Whether historical policy replay must re-evaluate the same grant is a question for the provenance and revision tracks, not answered here.

**Decision state:** undetermined. Cross-link only.

## Q12. What happens to connector tokens when a grant dies?

A9. RFC 8693 exchange does not bind lifetimes. Whether OS must mint one-time connector credentials per grant is Wave B.

**Decision state:** undetermined.

## Q13. Is fail-closed on missing identity always right?

L1 and L7 say yes. ObjectStack needed a staged flip because boot and seed runs had no principal. A greenfield OS can require an explicit system grant from day one. That is still a runtime design, not a closed semantic law.

**Decision state:** hypothesis for the semantic rule. Undetermined for boot mechanics.

## Questions this folder refuses to answer

These live in `docs/open-questions.md` and stay there.

- What the smallest semantic core is (§2).
- Whether Policy is a primitive or a function (§9).
- What an agent may propose versus commit (§10). This folder only says the commit has an Actor and a grant.
- Storage, compiler, and packages (§17, §18, §16).

If a sentence in this folder sounds like an answer to those, read it as a hypothesis about principals only.
