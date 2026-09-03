# W1-05 validation

## Verdict

- Unit: `W1-05`
- Implementation pull request: `#621`
- Exact implementation head: `c3e819c15e6aa4109a86a18d1b8e0915c208ceb9`
- Implementation merge: `edc5d1d172f12299a0920aabbcaca8c78c5d525b`
- Verdict: `live-ui-verified`
- Verified at: `2026-09-03T10:30:53Z`

The live ceremony used two distinct authenticated browser sessions, identified only as A and B. It recorded no message content, provider identifiers, account identifiers, binding identifiers, handles, account names, secret values, cookies, or QR data.

## Runtime boundary

| Check | Result |
| --- | --- |
| Production workload ready | `true` |
| Conversation runtime running | `true` |
| Required production secrets present | `true` |
| Secret values read or recorded | `false` |
| Telegram webhook configured and healthy | `true` |
| Telegram webhook pending updates | `0` |
| Telegram webhook last error present | `false` |
| Unsigned webhook request rejected | `true` |
| Unsigned webhook response status | `401` |

The deployed source matched the exact implementation head:

| File | SHA-256 | Runtime equals exact head |
| --- | --- | --- |
| `apps/conversation/agent/telegram-identity.ts` | `3dfff4815e2072da95bd1fa90a5b8e82145a36a6f5aaa92a6bb6f21e16e4b558` | `true` |
| `apps/conversation/agent/channels/telegram.ts` | `7430bafd5f8cd53524eed3ad88e87a991b33efaa8743e724dc94e2851f8f5dcd` | `true` |

## Live ceremony

| Observation | Observed at | Active provisional bindings | Distinct Accounts | Memberships |
| --- | --- | ---: | ---: | ---: |
| Sanitized baseline | `2026-09-03T09:53:33Z` | 0 | 0 | 0 |
| Session A initial exchange | `2026-09-03T10:25:30Z` | 1 | 1 | 0 |
| Session B initial exchange complete | `2026-09-03T10:26:56.708966Z` | 2 | 2 | 0 |
| Session B replay | `2026-09-03T10:30:01Z` | 2 | 2 | 0 |
| Session A replay and final aggregate | `2026-09-03T10:30:53Z` | 2 | 2 | 0 |

| Assertion | Result |
| --- | --- |
| Authenticated browser sessions distinct | `true` |
| Session A received its origin-bound reply | `true` |
| Session B received its origin-bound reply | `true` |
| Cross-session probe leakage observed | `false` |
| Active bindings | `2` |
| Distinct bindings | `2` |
| Distinct subjects | `2` |
| Distinct Accounts | `2` |
| All Accounts provisional | `true` |
| Each Account has exactly one binding | `true` |
| Accounts with any Membership | `0` |

## Replay proof

The ceremony sent one initial exchange from each session and then repeated one exchange from each session. Both repeats received an origin-bound reply. The aggregate remained exactly two active provisional bindings, two distinct Accounts, and zero Memberships after each replay.

No product code or configuration changed during the ceremony. No message was sent outside the configured bot test.
