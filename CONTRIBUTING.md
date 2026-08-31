# Contributing

PRs against `main`. Direct pushes to `main` are blocked.

## Setup

You need Docker, `just`, Node 22, and Rust 1.88 (`rust-toolchain.toml`).

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
