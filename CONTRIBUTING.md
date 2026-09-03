# Contributing

PRs against `main`. Direct pushes to `main` are blocked.

## Setup

You need Docker, `just`, Node 22, and Rust 1.98 (`rust-toolchain.toml`).

```bash
git clone https://github.com/EnzoTironi/OS.git
cd OS
just build
```

## Gates

CI runs the same gates. Do not add mocks or `vi.mock`.

```bash
just lint      # buf, tsc, JCS fixtures, rustfmt, cargo test
just clippy    # cargo clippy -D warnings
just build
just e2e <scenario>
just verify    # lint, clippy, build, every live journey
```

Journeys live in `e2e/`. Live lake JSON is `testdata/lakes/`. JCS fixtures are `testdata/jcs/`.

## Kache builds

Kache 0.16.0 is optional. Install the exact version:

```bash
cargo install --locked --version 0.16.0 kache
kache --version
```

The version command must print `kache 0.16.0`. Do not run `kache init`: Zoen
does not configure this release as a persistent Cargo wrapper.

Once installed, `just build`, `just e2e`, and `just verify` use Kache only for
their ordinary `cargo build`, unless `ZOEN_BUILD_RUSTC_WRAPPER`,
`RUSTC_WRAPPER`, or `CARGO_BUILD_RUSTC_WRAPPER` is present. Rust tests and
Clippy explicitly clear compiler wrappers; coverage does not install Kache.
These gates can still use their existing CI target caches. Tests and Clippy
routed through `e2e/run.sh` use `target/gates`, while ordinary builds use
`target`, so Cargo fingerprints produced through Kache cannot be reused by a
gate. The project configuration keeps the cache local, enables executable
caching, and sets an 8 GiB local garbage-collection target. CI uses a 6 GiB
target to leave room for its existing Rust caches. To bypass Kache for one
build:

```bash
ZOEN_BUILD_RUSTC_WRAPPER="" just build
```

Kache 0.16.0 omits `-W`, `-A`, and `--check-cfg` settings from its cache key.
Using it for lint or test gates could replay a successful compile after those
settings change. The CI rollout is therefore limited to the ordinary `build`
job and pins both Kache and its action. CI also asserts the installed version
and explicitly selects Kache for that build, so an installation failure cannot
silently turn the job into an uncached success. Release and coverage remain
unchanged.
The [upstream correction](https://github.com/kunobi-ninja/kache/pull/834) is
merged but is not part of a published release yet.

The completed clean-target comparison, acceptance criteria, and rollout
evidence are recorded in
[the Rust 1.98 and Kache report](research/2026-09-02-rust-1.98-kache.md).

## Pull requests

1. Open an issue first if the change is not a small fix.
2. Keep the diff to one concern.
3. The `verify` job named `required` must pass.
4. Resolve review comments before merge.

Use an issue template. Questions belong in [Discussions](https://github.com/EnzoTironi/OS/discussions).

## Code of Conduct

Participation is covered by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Security

Do not file public issues for vulnerabilities. See [SECURITY.md](SECURITY.md).
