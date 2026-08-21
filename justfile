# Buf, tsc, unit tests, fmt, zoen-core isolation. No Clippy, no Docker.
lint:
    ./e2e/run.sh lint

# Clippy only. CI uses a separate rust-cache key from `lint`.
clippy:
    ./e2e/run.sh clippy

# Static lint and in-process tests. No Docker.
check:
    ./e2e/run.sh check

# Produce the binaries e2e-run executes.
# Pass `durable-commit` or `all` to also build the failpoints zoend.
build scenario="":
    ./e2e/run.sh build {{scenario}}

# Scenario runner only. Requires `just build` or `just e2e` first.
e2e-run scenario:
    ./e2e/run.sh run {{scenario}}

# Ticket command: check + build + one scenario.
e2e scenario:
    ./e2e/run.sh e2e {{scenario}}

# Release gate: check and build once, then every scenario runner.
verify:
    ./e2e/run.sh verify
