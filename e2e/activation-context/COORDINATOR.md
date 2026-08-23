# activation-context coordinator note

AD-09 / justfile owner must register this scenario after merge:

```bash
# in e2e/run.sh scenario_table, add:
"activation-context:activation-context:"
```

Then:

```bash
just e2e activation-context
```

Ports (already in `.env`): postgres `55488`, keycloak `58540`, zoend `58541`.

Until registered, prove manually:

```bash
source e2e/activation-context/.env
export ZOEN_E2E_ARTIFACTS_DIR=artifacts/activation-context
export ZOEN_E2E_GENERATED_DIR=e2e/activation-context/.generated
node e2e/activation-context/prepare-realm.mjs
docker compose --project-name zoen-activation-context --file e2e/activation-context/compose.yaml up --detach --wait
node dist/e2e/activation-context.js
docker compose --project-name zoen-activation-context --file e2e/activation-context/compose.yaml down --volumes --remove-orphans
```
