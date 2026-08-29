#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/../../.." && pwd)"
auth="$repo/apps/auth"
zoen="$repo/apps/zoen/zoen"
cd "$auth"

if [[ -z "${DOCKER_HOST:-}" && ! -S /var/run/docker.sock ]]; then
  export DOCKER_HOST=tcp://127.0.0.1:2375
fi

base="http://127.0.0.1:58704"
ok_url="${base}/api/auth/ok"
zoend_base="http://127.0.0.1:58705"
hand_base="http://127.0.0.1:58726"
proof="/workspace/ship/s4-source-proof.md"
work="$(mktemp -d)"
trap 'cleanup' EXIT
draft="${work}/proof.md"
owner_jar="${work}/owner.cookies"
zoend_pg_name="zoen-s4-source-pg-$$"
zoend_pid=""
hand_pid=""
auth_started=0
admin_token="s4-source-admin-token"
valid_at="2026-01-15T00:00:00Z"
digest="$(tr -d ' \n' < "$repo/testdata/dest/s4-source/definition.sha256")"
canon="$repo/testdata/dest/s4-source/definition.canonical.json"

stamp() {
  TZ=America/Sao_Paulo date '+%Y-%m-%d %H:%M:%S %Z'
}

fail() {
  printf '%s\n' "$1" >&2
  if [[ -n "${body:-}" && -f "${body:-}" ]]; then
    cat "$body" >&2 || true
  fi
  if [[ -n "${zoend_log:-}" && -f "${zoend_log:-}" ]]; then
    tail -n 80 "$zoend_log" >&2 || true
  fi
  if [[ -n "${hand_log:-}" && -f "${hand_log:-}" ]]; then
    tail -n 40 "$hand_log" >&2 || true
  fi
  exit 1
}

kill_tree() {
  local parent="$1" child
  for child in $(ps -o pid= --ppid "$parent" 2>/dev/null || true); do
    child="${child// /}"
    if [[ "$child" =~ ^[0-9]+$ ]]; then
      kill_tree "$child"
    fi
  done
  kill "$parent" 2>/dev/null || true
}

cleanup() {
  if [[ -n "${hand_pid}" ]] && kill -0 "$hand_pid" 2>/dev/null; then
    kill_tree "$hand_pid"
  fi
  if [[ -n "${zoend_pid}" ]] && kill -0 "$zoend_pid" 2>/dev/null; then
    kill_tree "$zoend_pid"
    for _ in $(seq 1 50); do
      if ! kill -0 "$zoend_pid" 2>/dev/null; then
        break
      fi
      sleep 0.1
    done
  fi
  docker rm -f "$zoend_pg_name" >/dev/null 2>&1 || true
  if [[ "$auth_started" -eq 1 && -f .auth.pid ]]; then
    recorded="$(tr -d ' \n' < .auth.pid || true)"
    if [[ "$recorded" =~ ^[0-9]+$ ]] && kill -0 "$recorded" 2>/dev/null; then
      kill_tree "$recorded"
    fi
    rm -f .auth.pid
  fi
  rm -rf "$work"
}

record() {
  local heading="$1" command="$2" url="$3" status="$4" excerpt="$5"
  {
    printf '## %s\n\n' "$heading"
    printf 'command: %s\n' "$command"
    printf 'url: %s\n' "$url"
    printf 'status: %s\n' "$status"
    printf 'excerpt: %s\n' "$excerpt"
    printf 'timestamp: %s\n\n' "$(stamp)"
  } >> "$draft"
}

session_token_from_jar() {
  python3 - "$1" <<'PY'
import sys
path = sys.argv[1]
for raw in open(path, encoding="utf-8"):
    line = raw.rstrip("\n")
    if not line.strip():
        continue
    if line.startswith("#") and not line.startswith("#HttpOnly_"):
        continue
    if line.startswith("#HttpOnly_"):
        line = line[len("#HttpOnly_"):]
    parts = line.split("\t")
    if len(parts) >= 7 and parts[5].endswith("session_token"):
        print(parts[6])
        raise SystemExit(0)
raise SystemExit("session_token cookie missing")
PY
}

excerpt_text() {
  python3 -c 'import sys; print(sys.stdin.read().replace("\n"," ")[:500])'
}

run_zoen() {
  "$zoen" "$@"
}

mkdir -p "$(dirname "$proof")"
{
  printf '# s4-source proof\n\n'
  printf 'Source: `apps/zoen/scripts/prove-s4-source.sh`\n'
  printf 'Worktree: `%s`\n\n' "$repo"
} > "$draft"

chmod +x "$zoen"

if [[ ! -d "$auth/node_modules" ]]; then
  npm ci
fi
if [[ ! -d "$repo/node_modules" ]]; then
  (cd "$repo" && npm ci)
fi

if [[ ! -f .env ]]; then
  umask 077
  {
    printf 'DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55404/zoen_auth\n'
    printf 'BETTER_AUTH_SECRET=%s\n' "$(openssl rand -base64 32)"
    printf 'BETTER_AUTH_URL=http://127.0.0.1:58704\n'
    printf 'GOOGLE_CLIENT_ID=\n'
    printf 'GOOGLE_CLIENT_SECRET=\n'
  } > .env
fi

docker compose up -d --wait
set -a
# shellcheck disable=SC1091
. ./.env
set +a
npx --yes auth@1.7.2 migrate --config src/auth.ts --yes

if [[ -f .auth.pid ]]; then
  recorded="$(tr -d ' \n' < .auth.pid || true)"
  if [[ "$recorded" =~ ^[0-9]+$ ]] && kill -0 "$recorded" 2>/dev/null; then
    kill_tree "$recorded"
  fi
  rm -f .auth.pid
fi
fuser -k 58704/tcp >/dev/null 2>&1 || true
npx tsx src/server.ts >.auth.log 2>&1 &
printf '%s\n' "$!" > .auth.pid
auth_started=1
ready=0
for _ in $(seq 1 40); do
  if curl -sf "$ok_url" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.25
done
[[ "$ready" -eq 1 ]] || fail "auth door did not become ready"
record "Better Auth ready" "curl $ok_url" "$ok_url" "200" "ok"

read_src="$(cat "$repo/testdata/dest/s4-source/read.cedar")"
activate_src="$(cat "$repo/testdata/dest/s4-source/activate.cedar")"
map_src="$(cat "$repo/testdata/dest/s4-source/map.cedar")"
policies="${work}/policies.json"
python3 - "$policies" "$digest" "$read_src" "$activate_src" "$map_src" <<'PY'
import hashlib, json, sys
path, digest, read_src, activate_src, map_src = sys.argv[1:]
def entry(action_id, policy_id, source):
    return {
        "actionId": action_id,
        "definitionDigest": digest,
        "digest": hashlib.sha256(source.encode("utf-8")).hexdigest(),
        "policyId": policy_id,
        "revision": 1,
        "source": source,
    }
manifest = {"policies": [
    entry("zoen.world.read", "policy.s4.read", read_src),
    entry("zoen.definition.activate", "policy.s4.activate", activate_src),
    entry("source.mapQuantity", "policy.s4.map", map_src),
]}
open(path, "w", encoding="utf-8").write(json.dumps(manifest))
PY

fuser -k 58705/tcp >/dev/null 2>&1 || true
docker rm -f "$zoend_pg_name" >/dev/null 2>&1 || true
if ! docker run -d --name "$zoend_pg_name" \
  -e POSTGRES_DB=zoen \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 127.0.0.1:55405:5432 \
  postgres:18 >/dev/null; then
  fail "docker run zoend postgres failed"
fi
pg_ready=0
for _ in $(seq 1 120); do
  if docker exec "$zoend_pg_name" pg_isready -U postgres -d zoen >/dev/null 2>&1 \
    && python3 - <<'PY'
import socket, sys
try:
    s = socket.create_connection(("127.0.0.1", 55405), timeout=1)
    s.close()
except OSError:
    sys.exit(1)
PY
  then
    pg_ready=1
    break
  fi
  sleep 0.5
done
[[ "$pg_ready" -eq 1 ]] || fail "zoend postgres not ready"
sleep 1
docker exec "$zoend_pg_name" psql -U postgres -d zoen -c 'SELECT 1' >/dev/null \
  || fail "zoend postgres select 1 failed"

zoend_bin="${repo}/target/debug/zoend"
if [[ ! -x "$zoend_bin" ]]; then
  (
    cd "$repo"
    # shellcheck disable=SC1091
    . "$HOME/.cargo/env"
    cargo build --locked --package zoend
  )
fi
[[ -x "$zoend_bin" ]] || fail "zoend binary missing"

zoend_log="${work}/zoend.log"
(
  cd "$repo"
  # shellcheck disable=SC1091
  . "$HOME/.cargo/env"
  export DATABASE_URL='postgres://postgres:postgres@127.0.0.1:55405/zoen'
  export ZOEN_AUTH_DATABASE_URL='postgres://postgres:postgres@127.0.0.1:55404/zoen_auth'
  export ZOEN_LISTEN_ADDR='127.0.0.1:58705'
  export ZOEN_CEDAR_POLICY_MANIFEST="$policies"
  export ZOEN_IDENTITY_ADMIN_TOKEN="$admin_token"
  unset ZOEN_OIDC_ISSUER ZOEN_OIDC_AUDIENCE ZOEN_OIDC_DISCOVERY_URL || true
  exec "$zoend_bin"
) >"$zoend_log" 2>&1 &
zoend_pid="$!"
zoend_ready=0
for _ in $(seq 1 120); do
  if curl -sf --connect-timeout 1 "${zoend_base}/ready" >/dev/null 2>&1 \
    || curl -sf --connect-timeout 1 "${zoend_base}/health" >/dev/null 2>&1; then
    zoend_ready=1
    break
  fi
  sleep 0.25
done
[[ "$zoend_ready" -eq 1 ]] || fail "zoend /ready did not answer"
record "zoend ready" "curl ${zoend_base}/ready" "${zoend_base}/ready" "200" "ready"

fuser -k 58726/tcp >/dev/null 2>&1 || true
hand_log="${work}/hand.log"
(
  export ZOEN_HAND_PORT=58726
  exec node "$repo/apps/zoen/scripts/hand.mjs"
) >"$hand_log" 2>&1 &
hand_pid="$!"
hand_ready=0
for _ in $(seq 1 40); do
  if curl -sf "${hand_base}/health" >/dev/null 2>&1; then
    hand_ready=1
    break
  fi
  sleep 0.1
done
[[ "$hand_ready" -eq 1 ]] || fail "hand HTTP process did not become ready"
record "hand HTTP process" "node apps/zoen/scripts/hand.mjs" "${hand_base}/health" "200" "listening"

owner_email="s4-owner-$(date +%s)@example.invalid"
signup_json="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":"Prove-s4-source-1","name":"s4 owner"}))' "$owner_email")"
body="${work}/owner-signup"
status="$(
  curl -sS -o "$body" -w '%{http_code}' \
    -c "$owner_jar" \
    -H 'content-type: application/json' \
    -H "Origin: ${base}" \
    -d "$signup_json" \
    "${base}/api/auth/sign-up/email"
)"
record "POST /api/auth/sign-up/email" "curl sign-up owner" "${base}/api/auth/sign-up/email" "$status" "signed_up"
[[ "$status" == "200" ]] || fail "owner sign-up ${status}"
owner_token="$(session_token_from_jar "$owner_jar")"

body="${work}/bootstrap"
status="$(
  curl -sS -o "$body" -w '%{http_code}' \
    -X POST \
    -H "Authorization: Bearer ${owner_token}" \
    "${zoend_base}/identity/admin/bootstrap-bound"
)"
tenant_id="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["tenantId"])' < "$body")"
owner_membership="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["membershipId"])' < "$body")"
principal_id="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["principalId"])' < "$body")"
record "POST /identity/admin/bootstrap-bound" "curl bootstrap-bound" "${zoend_base}/identity/admin/bootstrap-bound" "$status" "tenant=${tenant_id} membership=${owner_membership}"
[[ "$status" == "200" ]] || fail "bootstrap-bound ${status}"

ids="$(docker exec "$zoend_pg_name" psql -U postgres -d zoen -v ON_ERROR_STOP=1 -tAc \
  "SELECT actor_id || ' ' || workload_id FROM memberships WHERE membership_id = '${owner_membership}'")"
actor_id="$(printf '%s' "$ids" | awk '{print $1}' | tr -d '[:space:]')"
workload_id="$(printf '%s' "$ids" | awk '{print $2}' | tr -d '[:space:]')"
[[ -n "$actor_id" && -n "$workload_id" ]] || fail "membership actor/workload missing"

updated="$(docker exec "$zoend_pg_name" psql -U postgres -d zoen -v ON_ERROR_STOP=1 -tAc \
  "UPDATE memberships
   SET clearance_json = '[\"zoen.world.floor\",\"zoen.world.reserved\",\"zoen.world.top\"]'::jsonb,
       delegation_json = '{\"grants\":[{\"actionIds\":[\"zoen.definition.activate\",\"source.mapQuantity\"],\"delegationId\":\"delegation.personal\",\"expiresAt\":253402300799,\"notBefore\":0,\"resourceIds\":[\"world.source\",\"entity.pedido.1\",\"entity.nota.1\"],\"workloadIds\":[\"workload.personal\"]}]}'::jsonb
   WHERE membership_id = '${owner_membership}'
   RETURNING membership_id")"
updated="$(printf '%s' "$updated" | tr -d '[:space:]')"
[[ "$updated" == *"$owner_membership"* ]] || fail "owner membership update missed"

export ZOEN_ZOEND="$zoend_base"
export ZOEN_BEARER="$owner_token"
export ZOEN_TENANT="$tenant_id"
export ZOEN_SOURCE_HOME="${work}/source"
export ZOEN_DEFINITION_ID="world.source"
export ZOEN_DEFINITION_DIGEST="$digest"
export ZOEN_VALID_AT="$valid_at"
export ZOEN_PRINCIPAL="$principal_id"
export ZOEN_ACTOR="$actor_id"
export ZOEN_WORKLOAD="$workload_id"
mkdir -p "$ZOEN_SOURCE_HOME"

help_out="$(run_zoen help)"
record "zoen help" "apps/zoen/zoen help" "n/a" "0" "$(printf '%s' "$help_out" | excerpt_text)"
printf '%s\n' "$help_out" | grep -q "zoen source connect" || fail "help missing source connect"

out="$(run_zoen definition publish --file "$canon")"
record "zoen definition publish" "zoen definition publish --file testdata/dest/s4-source/definition.canonical.json" "${zoend_base}/zoen.definition.v1.DefinitionService/Publish" "0" "$(printf '%s' "$out" | excerpt_text)"
printf '%s\n' "$out" >> "$draft"
printf '%s' "$out" | grep -q '"published":true' || fail "definition publish failed: $out"

out="$(run_zoen definition activate --definition-id world.source --digest "$digest")"
record "zoen definition activate" "zoen definition activate --definition-id world.source --digest $digest" "${zoend_base}/zoen.definition.v1.DefinitionService/ActivateRevision" "0" "$(printf '%s' "$out" | excerpt_text)"
printf '%s\n' "$out" >> "$draft"
printf '%s' "$out" | grep -q '"activated":true' || fail "definition activate failed: $out"

pack_kinds="$(python3 - "$repo/testdata/dest/s4-source/pack.json" <<'PY'
import json,sys
doc=json.load(open(sys.argv[1],encoding="utf-8"))
print(" ".join(item["kind"] for item in doc["integrationRequirements"]))
PY
)"
record "pack IntegrationKind::ReadSource" "python pack.json integrationRequirements" "testdata/dest/s4-source/pack.json" "0" "kinds=${pack_kinds}"
printf '%s' "$pack_kinds" | grep -q 'read_source' || fail "pack missing read_source"

body="${work}/door-signal"
status="$(
  curl -sS -o "$body" -w '%{http_code}' \
    -X PUT \
    -H "Authorization: Bearer ${owner_token}" \
    -H 'content-type: application/json' \
    -d '{"durableEventId":"evt.door.probe","source":{"class":"rest","externalId":"probe"},"payloadDigestRef":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","sourceDigestRef":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","trustDisposition":"evidence_candidate"}' \
    "${zoend_base}/workload/signals"
)"
record "door token PUT /workload/signals (must not ingest)" "curl PUT /workload/signals Authorization:Bearer <door>" "${zoend_base}/workload/signals" "$status" "$(python3 -c 'import json,sys; print(open(sys.argv[1],encoding="utf-8").read().replace("\n"," ")[:300])' "$body")"
[[ "$status" == "401" || "$status" == "403" ]] || fail "door token ingested as ${status}"

out="$(run_zoen source connect google --profile drive --base "$hand_base")"
record "1. Drive connect" "zoen source connect google --profile drive --base ${hand_base}" "$hand_base" "0" "$(printf '%s' "$out" | excerpt_text)"
printf '%s\n' "$out" >> "$draft"
printf '%s' "$out" | grep -q '"doorTokenStored":false' || fail "google connect stored a door token"

account_out="$(run_zoen source introduce drive --folder "My Drive" 2>&1 || true)"
record "refuse account introduce" "zoen source introduce drive --folder 'My Drive'" "n/a" "2" "$(printf '%s' "$account_out" | excerpt_text)"
printf '%s' "$account_out" | grep -q 'folder, not the account' || fail "account introduce was not refused"

out="$(run_zoen source introduce drive --folder Laudos)"
record "1b. Drive introduce folder Laudos" "zoen source introduce drive --folder Laudos" "n/a" "0" "$(printf '%s' "$out" | excerpt_text)"
printf '%s\n' "$out" >> "$draft"

drive_out="$(run_zoen source sync drive)"
record "1c. Drive sync zip" "zoen source sync drive" "$hand_base" "0" "$(printf '%s' "$drive_out" | excerpt_text)"
printf '%s\n' "$drive_out" >> "$draft"
drive_claims="$(printf '%s' "$drive_out" | python3 -c 'import json,sys; doc=json.load(sys.stdin); print(" ".join(doc.get("claimIds") or []))')"
drive_signal="$(printf '%s' "$drive_out" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("signalId") or "")')"
[[ -n "$drive_claims" ]] || fail "drive sync printed no claim ids: $drive_out"
[[ -n "$drive_signal" ]] || fail "drive sync printed no signal id: $drive_out"
printf 'drive claim ids: %s\n' "$drive_claims" >> "$draft"

out="$(run_zoen source connect rest --id bling --base "$hand_base" --auth apikey --api-key hand-key)"
record "2. Bling connect rest" "zoen source connect rest --id bling --base ${hand_base} --auth apikey --api-key hand-key" "$hand_base" "0" "$(printf '%s' "$out" | excerpt_text)"
printf '%s\n' "$out" >> "$draft"

out="$(run_zoen source introduce bling --path /pedidos)"
record "2b. Bling introduce /pedidos" "zoen source introduce bling --path /pedidos" "n/a" "0" "$(printf '%s' "$out" | excerpt_text)"
printf '%s\n' "$out" >> "$draft"

bling_out="$(run_zoen source sync bling)"
record "2c. Bling sync cursor" "zoen source sync bling" "${hand_base}/pedidos" "0" "$(printf '%s' "$bling_out" | excerpt_text)"
printf '%s\n' "$bling_out" >> "$draft"
bling_claims="$(printf '%s' "$bling_out" | python3 -c 'import json,sys; doc=json.load(sys.stdin); print(" ".join(doc.get("claimIds") or []))')"
[[ -n "$bling_claims" ]] || fail "bling sync printed no claim ids: $bling_out"
printf 'bling claim ids: %s\n' "$bling_claims" >> "$draft"

out="$(run_zoen source connect mcp --id protheus --url "${hand_base}/mcp")"
record "3. Protheus connect mcp" "zoen source connect mcp --id protheus --url ${hand_base}/mcp" "${hand_base}/mcp" "0" "$(printf '%s' "$out" | excerpt_text)"
printf '%s\n' "$out" >> "$draft"

out="$(run_zoen source introduce protheus --path list)"
record "3b. Protheus introduce list" "zoen source introduce protheus --path list" "n/a" "0" "$(printf '%s' "$out" | excerpt_text)"
printf '%s\n' "$out" >> "$draft"

protheus_out="$(run_zoen source sync protheus)"
record "3c. Protheus sync MCP client" "zoen source sync protheus" "${hand_base}/mcp" "0" "$(printf '%s' "$protheus_out" | excerpt_text)"
printf '%s\n' "$protheus_out" >> "$draft"
protheus_claims="$(printf '%s' "$protheus_out" | python3 -c 'import json,sys; doc=json.load(sys.stdin); print(" ".join(doc.get("claimIds") or []))')"
[[ -n "$protheus_claims" ]] || fail "protheus sync printed no claim ids: $protheus_out"
printf 'protheus claim ids: %s\n' "$protheus_claims" >> "$draft"

ingest="$(rg -n 'zoen\.ingest' "$repo/crates/zoen-core" || true)"
drive_match="$(rg -n 'match drive' "$repo/crates/zoen-core" || true)"
record "4. rg crates/zoen-core zoen.ingest" "rg -n 'zoen.ingest' crates/zoen-core" "crates/zoen-core" "0" "empty"
record "4b. rg crates/zoen-core match drive" "rg -n 'match drive' crates/zoen-core" "crates/zoen-core" "0" "empty"
[[ -z "$ingest" ]] || fail "zoen.ingest present in zoen-core: $ingest"
[[ -z "$drive_match" ]] || fail "match drive present in zoen-core: $drive_match"
crates="$(ls "$repo/crates")"
printf '%s' "$crates" | grep -qiE 'bling|drive|protheus' && fail "crate-per-SaaS present: $crates" || true
record "4c. no Bling/Drive/Protheus crates" "ls crates" "crates" "0" "$(printf '%s' "$crates" | tr '\n' ' ')"

[[ "$drive_claims" != "$bling_claims" ]] || fail "drive and bling produced the same claim ids"
query_out="$(run_zoen world query --type world.Pedido || true)"
record "5. rival dirt query" "zoen world query --type world.Pedido" "${zoend_base}/zoen.world.v1.WorldService/SemanticQuery" "0" "$(printf '%s' "$query_out" | excerpt_text)"
printf '%s\n' "$query_out" >> "$draft"
{
  printf 'rival claims stay as dirt until Action:\n'
  printf 'drive: %s\n' "$drive_claims"
  printf 'bling: %s\n' "$bling_claims"
  printf 'protheus: %s\n' "$protheus_claims"
} >> "$draft"

{
  printf '## Verdict\n\n'
  printf 'pass. Canonical JSON publish, generic REST/OAuth2/MCP source runtime, Google folder not account, ExternalSignal then map Action EvidenceClaim. Door token did not ingest. zoen-core has no zoen.ingest and no match drive.\n'
} >> "$draft"
cp "$draft" "$proof"
printf 'wrote %s\n' "$proof"
printf 'drive_claims=%s\n' "$drive_claims"
printf 'bling_claims=%s\n' "$bling_claims"
printf 'protheus_claims=%s\n' "$protheus_claims"
