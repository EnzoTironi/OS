# Buf, tsc, fmt, zoen-core isolation. No Clippy, no Docker.
lint:
    ./e2e/run.sh lint

# Clippy only. CI uses a separate rust-cache key from `lint`.
clippy:
    ./e2e/run.sh clippy

# Static lint and in-process tests. No Docker.
check:
    ./e2e/run.sh check

# Produce the binaries e2e-run executes.
build scenario="":
    ./e2e/run.sh build {{scenario}}

# Scenario runner only. Requires `just build` or `just e2e` first.
e2e-run scenario:
    ./e2e/run.sh run {{scenario}}

# Ticket command: check + build + one scenario.
e2e scenario:
    ./e2e/run.sh e2e {{scenario}}

# Release gate: check and build once, then every serial scenario runner.
verify:
    ./e2e/run.sh verify

# V1 release gate: aggregate typed artifacts into a signed zoen.verify.v1 bundle.
# Does not rerun scenarios. Missing/stale/wrong-commit evidence fails closed.
verify-v1:
    ./e2e/run.sh verify-v1

# Activation release gate: aggregate AD artifacts into a signed zoen.activation.v1 bundle.
# Does not rerun scenarios. Missing/stale/wrong-commit/fixture-as-production fails closed.
verify-activation:
    ./e2e/run.sh verify-activation
