#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/../../.." && pwd)"
auth="$repo/apps/auth"
cd "$auth"

if [[ -z "${DOCKER_HOST:-}" && ! -S /var/run/docker.sock ]]; then
  export DOCKER_HOST=tcp://127.0.0.1:2375
fi

base="http://127.0.0.1:58704"
ok_url="${base}/api/auth/ok"
zoend_base="http://127.0.0.1:58705"
proof="/workspace/ship/s6-scenario-proof.md"
work="$(mktemp -d)"
trap 'cleanup' EXIT
draft="${work}/proof.md"
owner_jar="${work}/owner.cookies"
reception_jar="${work}/reception.cookies"
zoend_pg_name="s6-scenario-pg-$$"
zoend_pid=""
auth_started=0
admin_token="s6-scenario-admin-token"
valid_at="2026-01-15T00:00:00Z"
valid_at_micros="1768435200000000"
digest="$(tr -d ' \n' < "$repo/testdata/dest/s6-scenario/definition.sha256")"
canon="$repo/testdata/dest/s6-scenario/definition.canonical.json"
definition_id="zoen.personal.workspace"

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

excerpt_file() {
  python3 - "$1" <<'PY'
import sys
print(open(sys.argv[1], encoding="utf-8").read().replace("\n", " ")[:400])
PY
}

connect() {
  local token="$1" path="$2" body="$3" out="$4"
  curl -sS -o "$out" -w '%{http_code}' \
    -H "Authorization: Bearer ${token}" \
    -H 'content-type: application/json' \
    -H 'connect-protocol-version: 1' \
    -H "x-zoen-tenant: ${tenant_id}" \
    -d "$body" \
    "${zoend_base}${path}"
}

query_entity_ids() {
  python3 - "$1" <<'PY'
import json, sys
doc = json.load(open(sys.argv[1], encoding="utf-8"))
ids = []
for value in doc.get("values", []):
    v = value.get("value") or {}
    if "entityRefValue" in v:
        ids.append(v["entityRefValue"])
print(" ".join(ids))
PY
}

query_text_values() {
  python3 - "$1" <<'PY'
import json, sys
doc = json.load(open(sys.argv[1], encoding="utf-8"))
tokens = []
for value in doc.get("values", []):
    v = value.get("value") or {}
    if "textValue" in v:
        tokens.append(v["textValue"])
print(" ".join(tokens))
PY
}

mkdir -p "$(dirname "$proof")"
{
  printf '# s6-scenario proof\n\n'
  printf 'Source: `apps/zoen/scripts/prove-s6-scenario.sh`\n'
  printf 'Worktree: `%s`\n\n' "$repo"
} > "$draft"

node "$repo/apps/conversation/scripts/check-no-has-permission.mjs" \
  || fail "BA hasPermission import-graph lock"
record "no BA hasPermission" \
  "node apps/conversation/scripts/check-no-has-permission.mjs" \
  "apps/conversation apps/zoend crates/zoen-core crates/zoen-engine" \
  "0" "no BA hasPermission lock ok"

if [[ ! -d "$auth/node_modules" ]]; then
  npm ci
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

read_src="$(cat "$repo/testdata/dest/s6-scenario/read.cedar")"
activate_src="$(cat "$repo/testdata/dest/s6-scenario/activate.cedar")"
invite_src="$(cat "$repo/testdata/dest/s6-scenario/invite.cedar")"
share_src="$(cat "$repo/testdata/dest/s6-scenario/share.cedar")"
reserve_src="$(cat "$repo/testdata/dest/s6-scenario/reserve.cedar")"
whocan_src="$(cat "$repo/testdata/dest/s6-scenario/whoCan.cedar")"
writenote_src="$(cat "$repo/testdata/dest/s6-scenario/writeNote.cedar")"
policies="${work}/policies.json"
python3 - "$policies" "$digest" "$read_src" "$activate_src" "$invite_src" "$share_src" "$reserve_src" "$whocan_src" "$writenote_src" <<'PY'
import hashlib, json, sys
path, digest, read_src, activate_src, invite_src, share_src, reserve_src, whocan_src, writenote_src = sys.argv[1:]
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
    entry("zoen.world.read", "policy.s6.read", read_src),
    entry("zoen.definition.activate", "policy.s6.activate", activate_src),
    entry("zoen.world.invite", "policy.s6.invite", invite_src),
    entry("zoen.world.share", "policy.s6.share", share_src),
    entry("zoen.world.reserve", "policy.s6.reserve", reserve_src),
    entry("zoen.world.whoCan", "policy.s6.whoCan", whocan_src),
    entry("world.writeNote", "policy.s6.writeNote", writenote_src),
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

zoend_bin="${repo}/target/debug/zoen"
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
  if ! kill -0 "$zoend_pid" 2>/dev/null; then
    cat "$zoend_log" >&2
    fail "zoend exited before ready"
  fi
  sleep 0.25
done
[[ "$zoend_ready" -eq 1 ]] || fail "zoend /ready did not answer"
record "zoend ready" "curl ${zoend_base}/ready" "${zoend_base}/ready" "200" "ready"

owner_email="s6-owner-$(date +%s)@example.invalid"
signup_json="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":"Prove-s6-scenario-1","name":"s6 owner"}))' "$owner_email")"
body="${work}/owner-signup"
status="$(
  curl -sS -o "$body" -w '%{http_code}' \
    -c "$owner_jar" \
    -H 'content-type: application/json' \
    -H "Origin: ${base}" \
    -d "$signup_json" \
    "${base}/api/auth/sign-up/email"
)"
record "POST /api/auth/sign-up/email (owner)" "curl sign-up owner" "${base}/api/auth/sign-up/email" "$status" "signed_up"
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
owner_account="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["accountId"])' < "$body")"
record "POST /identity/admin/bootstrap-bound" "curl bootstrap-bound" "${zoend_base}/identity/admin/bootstrap-bound" "$status" "tenant=${tenant_id} membership=${owner_membership}"
[[ "$status" == "200" ]] || fail "bootstrap-bound ${status}"

updated="$(docker exec "$zoend_pg_name" psql -U postgres -d zoen -v ON_ERROR_STOP=1 -tAc \
  "UPDATE memberships
   SET clearance_json = '[\"zoen.world.floor\",\"zoen.world.reserved\",\"zoen.world.top\"]'::jsonb
   WHERE membership_id = '${owner_membership}'
   RETURNING membership_id")"
updated="$(printf '%s' "$updated" | tr -d '[:space:]')"
[[ "$updated" == *"$owner_membership"* ]] || fail "owner clearance update missed"
owner_actions="$(docker exec "$zoend_pg_name" psql -U postgres -d zoen -v ON_ERROR_STOP=1 -tAc \
  "SELECT delegation_json::text FROM memberships WHERE membership_id = '${owner_membership}'")"
printf '%s' "$owner_actions" | grep -q 'zoen.world.invite' || fail "F3 personal grant missing zoen.world.invite"
printf '%s' "$owner_actions" | grep -q 'zoen.world.share' || fail "F3 personal grant missing zoen.world.share"
printf '%s' "$owner_actions" | grep -q 'zoen.world.reserve' || fail "F3 personal grant missing zoen.world.reserve"
printf '%s' "$owner_actions" | grep -q 'zoen.world.whoCan' || fail "F3 personal grant missing zoen.world.whoCan"
record "owner Personal grant from bootstrap (no SQL SET of dest action ids)" \
  "psql SELECT delegation_json after clearance-only UPDATE" \
  "memberships.delegation_json" "0" "invite share reserve whoCan present"

docker exec "$zoend_pg_name" psql -U postgres -d zoen -v ON_ERROR_STOP=1 -c \
  "UPDATE memberships
   SET delegation_json = jsonb_set(
     delegation_json,
     '{grants,0,actionIds}',
     (COALESCE(delegation_json->'grants'->0->'actionIds','[]'::jsonb) || '[\"world.writeNote\"]'::jsonb)
   )
   WHERE membership_id = '${owner_membership}'" >/dev/null \
  || fail "owner writeNote grant plant failed"
owner_actions="$(docker exec "$zoend_pg_name" psql -U postgres -d zoen -v ON_ERROR_STOP=1 -tAc \
  "SELECT delegation_json::text FROM memberships WHERE membership_id = '${owner_membership}'")"
printf '%s' "$owner_actions" | grep -q 'world.writeNote' || fail "owner writeNote grant missing"
record "plant owner writeNote grant" \
  "psql UPDATE memberships delegation_json += world.writeNote" \
  "memberships.delegation_json" "0" "world.writeNote granted"

reception_email="s6-reception-$(date +%s)@example.invalid"
signup_json="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":"Prove-s6-scenario-1","name":"s6 reception"}))' "$reception_email")"
body="${work}/reception-signup"
status="$(
  curl -sS -o "$body" -w '%{http_code}' \
    -c "$reception_jar" \
    -H 'content-type: application/json' \
    -H "Origin: ${base}" \
    -d "$signup_json" \
    "${base}/api/auth/sign-up/email"
)"
record "POST /api/auth/sign-up/email (reception)" "curl sign-up reception" "${base}/api/auth/sign-up/email" "$status" "signed_up"
[[ "$status" == "200" ]] || fail "reception sign-up ${status}"
reception_token="$(session_token_from_jar "$reception_jar")"
reception_user="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["user"]["id"])' < "${work}/reception-signup")"

body="${work}/provisional"
status="$(
  curl -sS -o "$body" -w '%{http_code}' \
    -X POST \
    -H "Authorization: Bearer ${admin_token}" \
    -H 'content-type: application/json' \
    -d "$(python3 -c 'import json,sys; print(json.dumps({"provider":"auth_door","subjectKey":sys.argv[1]}))' "$reception_user")" \
    "${zoend_base}/identity/admin/provisional"
)"
reception_account="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["accountId"])' < "$body")"
record "POST /identity/admin/provisional (reception)" "curl provisional reception" "${zoend_base}/identity/admin/provisional" "$status" "account=${reception_account}"
[[ "$status" == "200" ]] || fail "provisional ${status}"

body="${work}/verify"
status="$(
  curl -sS -o "$body" -w '%{http_code}' \
    -X POST \
    -H "Authorization: Bearer ${admin_token}" \
    -H 'content-type: application/json' \
    -d "$(python3 -c 'import json,sys; print(json.dumps({"accountId":sys.argv[1]}))' "$reception_account")" \
    "${zoend_base}/identity/admin/verify-binding"
)"
record "POST /identity/admin/verify-binding (reception)" "curl verify-binding reception" "${zoend_base}/identity/admin/verify-binding" "$status" "$(excerpt_file "$body")"
[[ "$status" == "200" ]] || fail "verify-binding ${status}"

canon_b64="$(python3 -c 'import base64,sys; print(base64.b64encode(open(sys.argv[1],"rb").read()).decode())' "$canon")"
body="${work}/publish"
status="$(
  connect "$owner_token" "/zoen.definition.v1.DefinitionService/Publish" "$(python3 -c 'import json,sys; print(json.dumps({
    "tenantId":sys.argv[1],
    "canonicalJson":sys.argv[2],
    "digest":sys.argv[3],
  }))' "$tenant_id" "$canon_b64" "$digest")" "$body"
)"
record "DefinitionService/Publish" "curl Publish s6 definition" "${zoend_base}/zoen.definition.v1.DefinitionService/Publish" "$status" "$(excerpt_file "$body")"
[[ "$status" == "200" ]] || fail "publish ${status}"

published_ids="$(python3 - "$canon" <<'PY'
import json,sys
doc=json.load(open(sys.argv[1],encoding="utf-8"))
print(" ".join(action["id"] for action in doc["actions"]))
PY
)"
printf 'published_action_ids=%s\n' "$published_ids"
record "published kernel Action ids" "python definition.canonical.json actions[].id" "testdata/dest/s6-scenario/definition.canonical.json" "0" "published_action_ids=${published_ids}"
printf '%s' "$published_ids" | grep -q 'zoen.world.invite' || fail "missing invite Action"
printf '%s' "$published_ids" | grep -q 'zoen.world.reserve' || fail "missing reserve Action"
printf '%s' "$published_ids" | grep -q 'world.writeNote' || fail "missing writeNote Action"

body="${work}/activate"
status="$(
  connect "$owner_token" "/zoen.definition.v1.DefinitionService/ActivateRevision" "$(python3 -c 'import json,sys; print(json.dumps({
    "tenantId":sys.argv[1],
    "definitionId":"zoen.personal.workspace",
    "digest":sys.argv[2],
    "expectNoActiveRevision": True,
  }))' "$tenant_id" "$digest")" "$body"
)"
record "DefinitionService/ActivateRevision" "curl ActivateRevision" "${zoend_base}/zoen.definition.v1.DefinitionService/ActivateRevision" "$status" "$(excerpt_file "$body")"
[[ "$status" == "200" ]] || fail "activate ${status}"

record_claim() {
  local token="$1" claim_id="$2" entity="$3" relation="$4" text="$5" out="$6"
  local payload
  payload="$(python3 -c 'import hashlib,json,sys
tenant, digest, claim, entity, relation, text, valid = sys.argv[1:]
ref = "urn:zoen:s6-scenario:"+claim
source_digest = hashlib.sha256(ref.encode()).hexdigest()
print(json.dumps({
  "tenantId": tenant,
  "operationId": "operation."+claim.replace(".","-"),
  "claim": {
    "claimId": claim,
    "definition": {"definitionId":"zoen.personal.workspace","revision":1,"digest":digest},
    "entityId": entity,
    "relationId": relation,
    "value": {"textValue": text},
    "validTime": {"instant": valid},
    "provenance": {
      "sourceId": "source.s6scenario",
      "sourceDigest": source_digest,
      "sourceRef": ref,
    },
  },
}))' "$tenant_id" "$digest" "$claim_id" "$entity" "$relation" "$text" "$valid_at")"
  connect "$token" "/zoen.world.v1.WorldService/RecordEvidence" "$payload" "$out"
}

status="$(record_claim "$owner_token" "claim.note-public.body" "entity.note-public" "world.body" "public note" "${work}/note-body")"
record "RecordEvidence public note body" "curl RecordEvidence entity.note-public world.body" "${zoend_base}/zoen.world.v1.WorldService/RecordEvidence" "$status" "$(excerpt_file "${work}/note-body")"
[[ "$status" == "200" ]] || fail "note body ${status}"

status="$(record_claim "$owner_token" "claim.note-public.label" "entity.note-public" "zoen.classifiedAs" "zoen.world.floor" "${work}/note-label")"
record "RecordEvidence public note classifiedAs floor" "curl RecordEvidence entity.note-public classifiedAs" "${zoend_base}/zoen.world.v1.WorldService/RecordEvidence" "$status" "$(excerpt_file "${work}/note-label")"
[[ "$status" == "200" ]] || fail "note label ${status}"

propose_action() {
  local action_id="$1" resource_id="$2" inputs_json="$3" proposal_id="$4" operation_id="$5" out="$6"
  local payload
  payload="$(python3 -c 'import json,sys
digest, valid, action, resource, inputs, proposal, operation = sys.argv[1:]
print(json.dumps({
  "proposalId": proposal,
  "operationId": operation,
  "definition": {"definitionId":"zoen.personal.workspace","revision":1,"digest":digest},
  "actionId": action,
  "resourceId": resource,
  "inputs": json.loads(inputs),
  "validAt": valid,
  "expiresAt": "2030-01-01T00:00:00Z",
}))' "$digest" "$valid_at" "$action_id" "$resource_id" "$inputs_json" "$proposal_id" "$operation_id")"
  connect "$owner_token" "/zoen.action.v1.ActionService/Propose" "$payload" "$out"
}

commit_dest_invite() {
  local account_id="$1" principal_id="$2" actor_id="$3" token="$4" proposal_id="$5" operation_id="$6" out_prefix="$7"
  local inputs
  inputs="$(python3 -c 'import json,sys; print(json.dumps([
    {"inputId":"accountId","value":{"textValue":sys.argv[1]}},
    {"inputId":"actorId","value":{"textValue":sys.argv[2]}},
    {"inputId":"principalId","value":{"textValue":sys.argv[3]}},
    {"inputId":"token","value":{"textValue":sys.argv[4]}},
    {"inputId":"workloadId","value":{"textValue":"workload.personal"}},
  ]))' "$account_id" "$actor_id" "$principal_id" "$token")"
  local body="${work}/${out_prefix}-propose"
  local status
  status="$(propose_action "zoen.world.invite" "zoen.personal.workspace" "$inputs" "$proposal_id" "$operation_id" "$body")"
  record "ActionService/Propose zoen.world.invite (${out_prefix})" "curl Propose invite ${out_prefix}" "${zoend_base}/zoen.action.v1.ActionService/Propose" "$status" "$(excerpt_file "$body")"
  [[ "$status" == "200" ]] || fail "propose invite ${out_prefix} ${status}"
  local preview
  preview="$(python3 -c 'import json,sys; print((json.load(open(sys.argv[1],encoding="utf-8")).get("proposal") or {}).get("previewHash") or "")' "$body")"
  [[ -n "$preview" ]] || fail "invite ${out_prefix} missing preview_hash"
  body="${work}/${out_prefix}-commit"
  status="$(
    connect "$owner_token" "/zoen.action.v1.ActionService/Commit" "$(python3 -c 'import json,sys; print(json.dumps({
      "proposalId":sys.argv[1],
      "operationId":sys.argv[2],
      "previewHash":sys.argv[3],
    }))' "$proposal_id" "$operation_id" "$preview")" "$body"
  )"
  record "ActionService/Commit zoen.world.invite (${out_prefix})" "curl Commit invite ${out_prefix}" "${zoend_base}/zoen.action.v1.ActionService/Commit" "$status" "$(excerpt_file "$body")"
  [[ "$status" == "200" ]] || fail "commit invite ${out_prefix} ${status}"
}

reception_principal="principal.reception"
commit_dest_invite "$reception_account" "$reception_principal" "actor.reception" "s6-dest-reception-token" "proposal.s6-invite-reception" "operation.s6-invite-reception" "reception-invite"

reception_membership="$(docker exec "$zoend_pg_name" psql -U postgres -d zoen -v ON_ERROR_STOP=1 -tAc \
  "SELECT membership_id FROM memberships WHERE tenant_id = '${tenant_id}' AND principal_id = '${reception_principal}' AND ended_at IS NULL LIMIT 1")"
reception_membership="$(printf '%s' "$reception_membership" | tr -d '[:space:]')"
[[ -n "$reception_membership" ]] || fail "reception membership missing"

docker exec "$zoend_pg_name" psql -U postgres -d zoen -v ON_ERROR_STOP=1 -c \
  "UPDATE memberships
   SET delegation_json = jsonb_set(
     delegation_json,
     '{grants,0,actionIds}',
     (COALESCE(delegation_json->'grants'->0->'actionIds','[]'::jsonb) || '[\"zoen.world.reserve\"]'::jsonb)
   )
   WHERE membership_id = '${reception_membership}'" >/dev/null \
  || fail "reception reserve grant plant failed"
clearance="$(docker exec "$zoend_pg_name" psql -U postgres -d zoen -v ON_ERROR_STOP=1 -tAc \
  "SELECT clearance_json::text FROM memberships WHERE membership_id = '${reception_membership}'")"
printf '%s' "$clearance" | grep -q 'zoen.world.floor' || fail "reception clearance missing floor"
if printf '%s' "$clearance" | grep -q 'zoen.world.reserved'; then
  fail "reception clearance must stay floor-only"
fi
record "plant reception reserve grant with floor clearance" \
  "psql UPDATE memberships delegation_json += zoen.world.reserve" \
  "memberships.delegation_json" "0" "reserve granted; clearance floor"

zoen_bin="${repo}/target/debug/zoen"
[[ -x "$zoen_bin" ]] || fail "planted zoen CLI missing at ${zoen_bin}"

export ZOEN_ZOEND="$zoend_base"
export ZOEN_TENANT="$tenant_id"
export ZOEN_DEFINITION_ID="zoen.personal.workspace"
export ZOEN_DEFINITION_DIGEST="$digest"
export ZOEN_VALID_AT="$valid_at"

run_zoen() {
  local bearer="$1"; shift
  env ZOEN_BEARER="$bearer" "$zoen_bin" "$@"
}

out="${work}/create-s.txt"
set +e
run_zoen "$owner_token" world scenario create --name S >"$out" 2>"${out}.err"
status=$?
set -e
record "owner zoen world scenario create --name S" "zoen world scenario create --name S" "WorldService/CreateScenario" "$status" "$(excerpt_file "$out")"
[[ "$status" -eq 0 ]] || fail "create S failed $(cat "${out}.err" "$out")"

out="${work}/head-after-create.txt"
set +e
run_zoen "$owner_token" world query --type world.Note >"$out" 2>"${out}.err"
status=$?
set -e
record "head query after create S" "zoen world query --type world.Note" "WorldService/SemanticQuery" "$status" "$(excerpt_file "$out")"
[[ "$status" -eq 0 ]] || fail "head query after create failed"
head_ids="$(query_entity_ids "$out")"
echo " $head_ids " | grep -q " entity.note-public " || fail "head missing public note after create"
if echo " $head_ids " | grep -q " entity.delta-note "; then
  fail "delta leaked onto head after create"
fi
printf 'head_after_create_ids=%s\n' "$head_ids"

out="${work}/propose-public.txt"
set +e
run_zoen "$owner_token" action propose \
  --proposal-id proposal.s6-public \
  --operation-id operation.s6-public \
  --action-id world.writeNote \
  --resource-id entity.delta-note \
  --scenario S \
  --input body=scenario-delta \
  --input token=zoen.world.floor >"$out" 2>"${out}.err"
status=$?
set -e
record "owner propose writeNote into S" "zoen action propose ... --scenario S" "ActionService/Propose" "$status" "$(excerpt_file "$out")"
[[ "$status" -eq 0 ]] || fail "propose into S failed $(cat "${out}.err" "$out")"

out="${work}/scenario-s-query.txt"
set +e
run_zoen "$owner_token" world query --type world.Note --scenario S >"$out" 2>"${out}.err"
status=$?
set -e
record "scenario S query" "zoen world query --type world.Note --scenario S" "WorldService/SemanticQuery" "$status" "$(excerpt_file "$out")"
[[ "$status" -eq 0 ]] || fail "scenario S query failed"
s_ids="$(query_entity_ids "$out")"
echo " $s_ids " | grep -q " entity.note-public " || fail "scenario S missing base note"
echo " $s_ids " | grep -q " entity.delta-note " || fail "scenario S missing delta"
printf 'scenario_S_ids=%s\n' "$s_ids"

out="${work}/head-before-apply.txt"
set +e
run_zoen "$owner_token" world query --type world.Note >"$out" 2>"${out}.err"
status=$?
set -e
[[ "$status" -eq 0 ]] || fail "head query before apply failed"
head_ids="$(query_entity_ids "$out")"
if echo " $head_ids " | grep -q " entity.delta-note "; then
  fail "delta on head before apply"
fi
record "head query before apply" "zoen world query --type world.Note" "WorldService/SemanticQuery" "$status" "head_ids=${head_ids}"

out="${work}/apply-s.txt"
set +e
run_zoen "$owner_token" world scenario apply --name S >"$out" 2>"${out}.err"
status=$?
set -e
record "owner apply S" "zoen world scenario apply --name S" "WorldService/ApplyScenario" "$status" "$(excerpt_file "$out")"
[[ "$status" -eq 0 ]] || fail "apply S failed $(cat "${out}.err" "$out")"
python3 - "$out" <<'PY'
import json,sys
doc=json.load(open(sys.argv[1],encoding="utf-8"))
seq=doc.get("commitSequence") or doc.get("commit_sequence")
assert seq and int(seq) > 0, doc
decision=str(doc.get("decision") or "")
assert "Deny" not in decision, doc
print(seq)
PY
apply_commit="$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1],encoding="utf-8")); print(d.get("commitSequence") or d.get("commit_sequence") or "")' "$out")"
printf 'apply_S_commit=%s\n' "$apply_commit"

out="${work}/head-after-apply.txt"
set +e
run_zoen "$owner_token" world query --type world.Note >"$out" 2>"${out}.err"
status=$?
set -e
[[ "$status" -eq 0 ]] || fail "head query after apply failed"
head_ids="$(query_entity_ids "$out")"
echo " $head_ids " | grep -q " entity.delta-note " || fail "delta missing from head after apply"
record "head query after apply S" "zoen world query --type world.Note" "WorldService/SemanticQuery" "$status" "head_ids=${head_ids}"

out="${work}/create-t.txt"
set +e
run_zoen "$owner_token" world scenario create --name T >"$out" 2>"${out}.err"
status=$?
set -e
[[ "$status" -eq 0 ]] || fail "create T failed"
record "create scenario T" "zoen world scenario create --name T" "WorldService/CreateScenario" "$status" "$(excerpt_file "$out")"

out="${work}/reception-propose-reserve.txt"
set +e
run_zoen "$reception_token" action propose \
  --proposal-id proposal.s6-reserve \
  --operation-id operation.s6-reserve \
  --action-id zoen.world.reserve \
  --resource-id entity.note-public \
  --scenario T \
  --input token=zoen.world.reserved >"$out" 2>"${out}.err"
status=$?
set -e
record "reception propose reserve into T" "zoen action propose reserve --scenario T" "ActionService/Propose" "$status" "$(excerpt_file "$out")"
[[ "$status" -eq 0 ]] || fail "reception propose reserve failed $(cat "${out}.err" "$out")"

out="${work}/reception-apply-t.txt"
set +e
run_zoen "$reception_token" world scenario apply --name T >"$out" 2>"${out}.err"
status=$?
set -e
record "reception apply T Deny" "zoen world scenario apply --name T" "WorldService/ApplyScenario" "$status" "$(excerpt_file "$out")"
[[ "$status" -eq 0 ]] || fail "apply T call failed"
python3 - "$out" <<'PY'
import json,sys
doc=json.load(open(sys.argv[1],encoding="utf-8"))
text=json.dumps(doc)
assert "Deny" in text, doc
assert "zoen.mac.dominates" in text, doc
print(text[:400])
PY

out="${work}/head-after-deny.txt"
set +e
run_zoen "$owner_token" world query --type world.Note >"$out" 2>"${out}.err"
status=$?
set -e
head_ids="$(query_entity_ids "$out")"
record "head unchanged after T deny" "zoen world query --type world.Note" "WorldService/SemanticQuery" "$status" "head_ids=${head_ids}"

out="${work}/create-u.txt"
set +e
run_zoen "$owner_token" world scenario create --name U >"$out" 2>"${out}.err"
status=$?
set -e
[[ "$status" -eq 0 ]] || fail "create U failed"

out="${work}/propose-u.txt"
set +e
run_zoen "$owner_token" action propose \
  --proposal-id proposal.s6-u \
  --operation-id operation.s6-u \
  --action-id world.writeNote \
  --resource-id entity.u-note \
  --scenario U \
  --input body=discard-me \
  --input token=zoen.world.floor >"$out" 2>"${out}.err"
status=$?
set -e
[[ "$status" -eq 0 ]] || fail "propose into U failed $(cat "${out}.err" "$out")"

out="${work}/discard-u.txt"
set +e
run_zoen "$owner_token" world scenario discard --name U >"$out" 2>"${out}.err"
status=$?
set -e
record "discard U" "zoen world scenario discard --name U" "WorldService/DiscardScenario" "$status" "$(excerpt_file "$out")"
[[ "$status" -eq 0 ]] || fail "discard U failed"

out="${work}/query-u.txt"
set +e
run_zoen "$owner_token" world query --type world.Note --scenario U >"$out" 2>"${out}.err"
status=$?
set -e
if [[ "$status" -eq 0 ]]; then
  u_ids="$(query_entity_ids "$out")"
  if echo " $u_ids " | grep -q " entity.u-note "; then
    fail "overlay still present after discard"
  fi
fi
record "query discarded U" "zoen world query --type world.Note --scenario U" "WorldService/SemanticQuery" "$status" "$(excerpt_file "$out") $(excerpt_file "${out}.err")"

out="${work}/head-after-discard.txt"
set +e
run_zoen "$owner_token" world query --type world.Note >"$out" 2>"${out}.err"
status=$?
set -e
head_ids="$(query_entity_ids "$out")"
if echo " $head_ids " | grep -q " entity.u-note "; then
  fail "discard leaked onto head"
fi
record "head after discard U" "zoen world query --type world.Note" "WorldService/SemanticQuery" "$status" "head_ids=${head_ids}"

rg_out="${work}/rg-scenario-family.txt"
set +e
rg -n 'DefinitionFamily::Scenario|family Scenario|enum .*Scenario' "$repo/crates/zoen-core" "$repo/crates/zoen-engine/src/admission" >"$rg_out" 2>&1
rg_status=$?
set -e
[[ "$rg_status" -eq 1 ]] || fail "Scenario family leak: $(cat "$rg_out")"
record "rg no Scenario family" "rg DefinitionFamily::Scenario ..." "crates/zoen-core crates/zoen-engine/src/admission" "1" "empty"

cp "$draft" "$proof"
printf 'proof written to %s\n' "$proof"
