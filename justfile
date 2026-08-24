# Product local Sample Company stack.
# Rebuilds web, then compose + zoend + effect chain (provider/connector/worker/dispatcher) + web.
# Ready requires /onboarding+/packs HTTP 200 and the effect chain up.
start:
    #!/usr/bin/env bash
    set -euo pipefail
    set -a
    source e2e/activation-sample/.env
    set +a
    npm exec -- tsc -p tsconfig.json --pretty false
    node dist/e2e/activation-sample/cli.js start

stop:
    #!/usr/bin/env bash
    set -euo pipefail
    set -a
    source e2e/activation-sample/.env
    set +a
    node dist/e2e/activation-sample/cli.js stop

status:
    #!/usr/bin/env bash
    set -euo pipefail
    set -a
    source e2e/activation-sample/.env
    set +a
    node dist/e2e/activation-sample/cli.js status

doctor:
    #!/usr/bin/env bash
    set -euo pipefail
    set -a
    source e2e/activation-sample/.env
    set +a
    node dist/e2e/activation-sample/cli.js doctor

reset-sample:
    #!/usr/bin/env bash
    set -euo pipefail
    set -a
    source e2e/activation-sample/.env
    set +a
    npm exec -- tsc -p tsconfig.json --pretty false
    node dist/e2e/activation-sample/cli.js reset-sample

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

# Release drill: same as `just e2e` for the named reliability drill.
release-drill drill:
    ./e2e/run.sh release-drill {{drill}}

# V1-22 scale suite. ZOEN_SCALE=smoke|reference (default smoke).
scale phase:
    ./e2e/run.sh scale {{phase}}

# Release gate: check and build once, then every serial scenario runner.
verify:
    ./e2e/run.sh verify

# V1 release gate: aggregate typed artifacts into a signed zoen.verify.v1 bundle.
# Does not rerun KIND. Missing/stale/unsigned/wrong-commit evidence fails closed.
verify-v1:
    ./e2e/run.sh verify-v1

# Named gate-contract PASS using fixtures under e2e/verify-v1/testdata/complete.
# Not production evidence. Bundle still lands in artifacts/verify-v1/.
verify-v1-fixtures fixture="complete":
    ZOEN_VERIFY_EVIDENCE_DIR=e2e/verify-v1/testdata/{{fixture}} ./e2e/run.sh verify-v1

# Activation release gate: aggregate AD artifacts into a signed zoen.activation.v1 bundle.
# Does not rerun scenarios. Missing/stale/wrong-commit/fixture-as-production fails closed.
verify-activation:
    ./e2e/run.sh verify-activation

# Named gate-contract PASS using fixtures under e2e/verify-activation/testdata/complete.
# Not production evidence. Bundle still lands in artifacts/verify-activation/.
verify-activation-fixtures fixture="complete":
    ZOEN_VERIFY_EVIDENCE_DIR=e2e/verify-activation/testdata/{{fixture}} ./e2e/run.sh verify-activation
