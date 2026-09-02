1. 1. Zoen has exactly three products: Ontology, Eve, and Better Auth. Do not create a fourth product.
2. 2. Behavioral verification uses live user journeys. Do not add unit tests, mocks, fakes, stubs, or vi.mock.
3. 3. Restate runs only ZoenEffect. Eve owns conversation durability. Do not add Redis or Rivet.
4. 4. WhatsApp uses Kapso at /eve/v1/kapso. Telegram uses Eve at /eve/v1/telegram. Keep provider branches out of the generic kernel.
5. 5. This is pre-launch. Remove obsolete paths and migrate callers in the same wave. Do not add compatibility shims, dual reads, or dual writes.
6. 6. Do not use unwrap or add linter bypasses. Generated protobuf is the only stated exception.
7. 7. The approved architecture is docs/product/zoen-final-architecture.md. WorldRelease is the publication unit and Eve uses a per-turn capability.
8. 8. One writer owns each branch or worktree. Workers never rebase, run gt, force-push, deploy, delete data, close PRs, or retarget PRs.
9. 9. Behavior needs a live journey verdict. Typecheck alone cannot verify behavior.
10. 10. Browser verification must cover the authenticated web session and both authenticated Telegram accounts.
11. 11. Preserve unrelated user changes and untracked files. Do not reset or overwrite work outside the unit scope.
12. 12. Every unit reports branch, head SHA, exact commands run, verdict, deviations, and follow-up risks.
13. 13. Use gpt-5.6-sol for precise cross-cutting implementation and a different model family for judgment-heavy verification.
14. 14. Irreversible actions, production deploys, data deletion, force-pushes, and closing someone else's PR require a human gate.
15. 15. Keep prose plain. Do not use em dashes, fake certainty, helpdesk copy, or invented URLs.
16. 16. The user explicitly authorized any merge and production deploy. Merge only a current ledger-verified SHA. Deploy only the exact production-shaped artifact that passed the release journeys. This does not authorize force-push, data deletion, or third-party messages.
17. Standing order 16 supersedes the merge and deploy gates in orders 8 and 14. Workers still cannot merge or deploy. The coordinator or designated stacker may merge a verified SHA and deploy the exact verified artifact. Force-push and data deletion still require a separate gate.
18. Every PR must resolve every actionable human or automated review comment before merge. Any review-driven commit invalidates the prior SHA verdict and requires fresh checks plus the relevant live journey.
19. Warm every new isolated worktree with a reflink-aware copy of the latest compatible Cargo `target`. Never point concurrent workers at one writable target directory.
