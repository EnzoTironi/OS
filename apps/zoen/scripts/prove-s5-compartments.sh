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
proof="/workspace/ship/s5-compartments-proof.md"
work="$(mktemp -d)"
trap 'cleanup' EXIT
draft="${work}/proof.md"
owner_jar="${work}/owner.cookies"
reception_jar="${work}/reception.cookies"
invitee_jar="${work}/invitee.cookies"
zoend_pg_name="zoen-s5-compartments-pg-$$"
zoend_pid=""
auth_started=0
admin_token="s5-compartments-admin-token"
valid_at="2026-01-15T00:00:00Z"
valid_at_micros="1768435200000000"
digest="$(tr -d ' \n' < "$repo/testdata/dest/s5-compartments/definition.sha256")"
canon="$repo/testdata/dest/s5-compartments/definition.canonical.json"
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
  printf '# s5-compartments proof\n\n'
  printf 'Source: `apps/zoen/scripts/prove-s5-compartments.sh`\n'
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

read_src="$(cat "$repo/testdata/dest/s5-compartments/read.cedar")"
activate_src="$(cat "$repo/testdata/dest/s5-compartments/activate.cedar")"
invite_src="$(cat "$repo/testdata/dest/s5-compartments/invite.cedar")"
share_src="$(cat "$repo/testdata/dest/s5-compartments/share.cedar")"
reserve_src="$(cat "$repo/testdata/dest/s5-compartments/reserve.cedar")"
whocan_src="$(cat "$repo/testdata/dest/s5-compartments/whoCan.cedar")"
policies="${work}/policies.json"
python3 - "$policies" "$digest" "$read_src" "$activate_src" "$invite_src" "$share_src" "$reserve_src" "$whocan_src" <<'PY'
import hashlib, json, sys
path, digest, read_src, activate_src, invite_src, share_src, reserve_src, whocan_src = sys.argv[1:]
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
    entry("zoen.world.read", "policy.s5.read", read_src),
    entry("zoen.definition.activate", "policy.s5.activate", activate_src),
    entry("zoen.world.invite", "policy.s5.invite", invite_src),
    entry("zoen.world.share", "policy.s5.share", share_src),
    entry("zoen.world.reserve", "policy.s5.reserve", reserve_src),
    entry("zoen.world.whoCan", "policy.s5.whoCan", whocan_src),
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

owner_email="s5-owner-$(date +%s)@example.invalid"
signup_json="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":"Prove-s5-compartments-1","name":"s5 owner"}))' "$owner_email")"
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
record "owner Personal grant from bootstrap (no SQL SET of action ids)" \
  "psql SELECT delegation_json after clearance-only UPDATE" \
  "memberships.delegation_json" "0" "invite share reserve whoCan present"

reception_email="s5-reception-$(date +%s)@example.invalid"
signup_json="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":"Prove-s5-compartments-1","name":"s5 reception"}))' "$reception_email")"
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
record "DefinitionService/Publish" "curl Publish s5 definition" "${zoend_base}/zoen.definition.v1.DefinitionService/Publish" "$status" "$(excerpt_file "$body")"
[[ "$status" == "200" ]] || fail "publish ${status}"

published_ids="$(python3 - "$canon" <<'PY'
import json,sys
doc=json.load(open(sys.argv[1],encoding="utf-8"))
print(" ".join(action["id"] for action in doc["actions"]))
PY
)"
printf 'published_action_ids=%s\n' "$published_ids"
record "published kernel Action ids" "python definition.canonical.json actions[].id" "testdata/dest/s5-compartments/definition.canonical.json" "0" "published_action_ids=${published_ids}"
printf '%s' "$published_ids" | grep -q 'zoen.world.invite' || fail "missing invite Action"
printf '%s' "$published_ids" | grep -q 'zoen.world.share' || fail "missing share Action"
printf '%s' "$published_ids" | grep -q 'zoen.world.reserve' || fail "missing reserve Action"
printf '%s' "$published_ids" | grep -q 'zoen.world.whoCan' || fail "missing whoCan Action"

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
ref = "urn:zoen:s5-compartments:"+claim
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
      "sourceId": "source.s5compartments",
      "sourceDigest": source_digest,
      "sourceRef": ref,
    },
  },
}))' "$tenant_id" "$digest" "$claim_id" "$entity" "$relation" "$text" "$valid_at")"
  connect "$token" "/zoen.world.v1.WorldService/RecordEvidence" "$payload" "$out"
}

status="$(record_claim "$owner_token" "claim.slot.body" "entity.slot" "world.body" "agenda slot" "${work}/slot-body")"
record "RecordEvidence slot body" "curl RecordEvidence entity.slot world.body" "${zoend_base}/zoen.world.v1.WorldService/RecordEvidence" "$status" "$(excerpt_file "${work}/slot-body")"
[[ "$status" == "200" ]] || fail "slot body ${status}"

status="$(record_claim "$owner_token" "claim.slot.label" "entity.slot" "zoen.classifiedAs" "zoen.world.floor" "${work}/slot-label")"
record "RecordEvidence slot classifiedAs floor" "curl RecordEvidence entity.slot classifiedAs" "${zoend_base}/zoen.world.v1.WorldService/RecordEvidence" "$status" "$(excerpt_file "${work}/slot-label")"
[[ "$status" == "200" ]] || fail "slot label ${status}"

status="$(record_claim "$owner_token" "claim.prontuario.body" "entity.prontuario" "world.body" "reserved prontuario" "${work}/prontuario-body")"
record "RecordEvidence prontuario body" "curl RecordEvidence entity.prontuario world.body" "${zoend_base}/zoen.world.v1.WorldService/RecordEvidence" "$status" "$(excerpt_file "${work}/prontuario-body")"
[[ "$status" == "200" ]] || fail "prontuario body ${status}"

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
commit_dest_invite "$reception_account" "$reception_principal" "actor.reception" "s5-dest-reception-token" "proposal.s5-invite-reception" "operation.s5-invite-reception" "reception-invite"

reserve_inputs='[{"inputId":"token","value":{"textValue":"zoen.world.reserved"}}]'
body="${work}/propose-reserve"
status="$(propose_action "zoen.world.reserve" "entity.prontuario" "$reserve_inputs" "proposal.s5-reserve" "operation.s5-reserve" "$body")"
record "ActionService/Propose zoen.world.reserve" "curl Propose reserve" "${zoend_base}/zoen.action.v1.ActionService/Propose" "$status" "$(excerpt_file "$body")"
[[ "$status" == "200" ]] || fail "propose reserve ${status}"
reserve_hash="$(python3 -c 'import json,sys; print((json.load(open(sys.argv[1],encoding="utf-8")).get("proposal") or {}).get("previewHash") or "")' "$body")"
[[ -n "$reserve_hash" ]] || fail "reserve propose missing preview_hash"

body="${work}/commit-reserve-missing-hash"
status="$(
  connect "$owner_token" "/zoen.action.v1.ActionService/Commit" "$(python3 -c 'import json; print(json.dumps({
    "proposalId":"proposal.s5-reserve",
    "operationId":"operation.s5-reserve",
  }))')" "$body"
)"
record "ActionService/Commit reserve without preview_hash" "curl Commit reserve omit previewHash" "${zoend_base}/zoen.action.v1.ActionService/Commit" "$status" "$(excerpt_file "$body")"
python3 - "$body" "$status" <<'PY' || fail "reserve commit without preview_hash was accepted"
import json,sys
status=sys.argv[2]
doc=json.load(open(sys.argv[1],encoding="utf-8"))
text=json.dumps(doc)
if status=="200" and "COMMITTED" in str(doc.get("status") or "").upper() and doc.get("receipt"):
    raise SystemExit("committed")
if "preview" not in text.lower() and "PreviewMismatch" not in text and "PREVIEW" not in str(doc.get("status") or "").upper():
    if status.startswith("4") or status.startswith("5"):
        raise SystemExit(0)
    raise SystemExit("not refused: "+text[:400])
PY

body="${work}/commit-reserve"
status="$(
  connect "$owner_token" "/zoen.action.v1.ActionService/Commit" "$(python3 -c 'import json,sys; print(json.dumps({
    "proposalId":"proposal.s5-reserve",
    "operationId":"operation.s5-reserve",
    "previewHash":sys.argv[1],
  }))' "$reserve_hash")" "$body"
)"
record "ActionService/Commit zoen.world.reserve" "curl Commit reserve previewHash" "${zoend_base}/zoen.action.v1.ActionService/Commit" "$status" "$(excerpt_file "$body")"
[[ "$status" == "200" ]] || fail "commit reserve ${status}"

classified_query="$(python3 -c 'import json,sys; print(json.dumps({
  "tenantId":sys.argv[1],
  "definition":{"definitionId":"zoen.personal.workspace","revision":1,"digest":sys.argv[2]},
  "validAt":sys.argv[3],
  "consistency":{"strong":{}},
  "entityId":"entity.prontuario",
  "selection":{"relationId":"zoen.classifiedAs"},
}))' "$tenant_id" "$digest" "$valid_at")"

body="${work}/classified-before"
status="$(connect "$owner_token" "/zoen.world.v1.WorldService/SemanticQuery" "$classified_query" "$body")"
classified_before="$(query_text_values "$body")"
record "classifiedAs prontuario before share" "curl SemanticQuery entity.prontuario classifiedAs" "${zoend_base}/zoen.world.v1.WorldService/SemanticQuery" "$status" "classifiedAs=${classified_before}"
[[ "$status" == "200" ]] || fail "classified before ${status}"
echo " $classified_before " | grep -q " zoen.world.reserved " || fail "reserve did not write classifiedAs reserved"

share_inputs="$(python3 -c 'import json,sys; print(json.dumps([{"inputId":"with","value":{"textValue":sys.argv[1]}}]))' "$reception_principal")"
body="${work}/propose-share"
status="$(propose_action "zoen.world.share" "entity.slot" "$share_inputs" "proposal.s5-share" "operation.s5-share" "$body")"
record "ActionService/Propose zoen.world.share" "curl Propose share slot" "${zoend_base}/zoen.action.v1.ActionService/Propose" "$status" "$(excerpt_file "$body")"
[[ "$status" == "200" ]] || fail "propose share ${status}"
share_hash="$(python3 -c 'import json,sys; print((json.load(open(sys.argv[1],encoding="utf-8")).get("proposal") or {}).get("previewHash") or "")' "$body")"
[[ -n "$share_hash" ]] || fail "share propose missing preview_hash"

body="${work}/commit-share"
status="$(
  connect "$owner_token" "/zoen.action.v1.ActionService/Commit" "$(python3 -c 'import json,sys; print(json.dumps({
    "proposalId":"proposal.s5-share",
    "operationId":"operation.s5-share",
    "previewHash":sys.argv[1],
  }))' "$share_hash")" "$body"
)"
record "ActionService/Commit zoen.world.share" "curl Commit share slot" "${zoend_base}/zoen.action.v1.ActionService/Commit" "$status" "$(excerpt_file "$body")"
[[ "$status" == "200" ]] || fail "commit share ${status}"

body="${work}/classified-after"
status="$(connect "$owner_token" "/zoen.world.v1.WorldService/SemanticQuery" "$classified_query" "$body")"
classified_after="$(query_text_values "$body")"
record "classifiedAs prontuario after share" "curl SemanticQuery entity.prontuario classifiedAs" "${zoend_base}/zoen.world.v1.WorldService/SemanticQuery" "$status" "classifiedAs=${classified_after}"
[[ "$classified_before" == "$classified_after" ]] || fail "share rewrote classifiedAs before=${classified_before} after=${classified_after}"
printf 'classifiedAs_prontuario_unchanged=%s\n' "$classified_after"

type_query="$(python3 -c 'import json,sys; print(json.dumps({
  "tenantId":sys.argv[1],
  "definition":{"definitionId":"zoen.personal.workspace","revision":1,"digest":sys.argv[2]},
  "validAt":sys.argv[3],
  "consistency":{"strong":{}},
  "byType":{"typeId":"world.Note","limit":10},
}))' "$tenant_id" "$digest" "$valid_at")"

body="${work}/reception-query"
status="$(connect "$reception_token" "/zoen.world.v1.WorldService/SemanticQuery" "$type_query" "$body")"
reception_ids="$(query_entity_ids "$body")"
record "reception SemanticQuery ByType world.Note" "curl SemanticQuery reception" "${zoend_base}/zoen.world.v1.WorldService/SemanticQuery" "$status" "row_ids=${reception_ids}"
[[ "$status" == "200" ]] || fail "reception query ${status}"
echo " $reception_ids " | grep -q " entity.slot " || fail "reception missed slot"
echo " $reception_ids " | grep -q " entity.prontuario " && fail "reception saw prontuario"
printf 'reception_query_row_ids=%s\n' "$reception_ids"

body="${work}/owner-query"
status="$(connect "$owner_token" "/zoen.world.v1.WorldService/SemanticQuery" "$type_query" "$body")"
owner_ids="$(query_entity_ids "$body")"
record "owner SemanticQuery ByType world.Note" "curl SemanticQuery owner" "${zoend_base}/zoen.world.v1.WorldService/SemanticQuery" "$status" "row_ids=${owner_ids}"
[[ "$status" == "200" ]] || fail "owner query ${status}"
echo " $owner_ids " | grep -q " entity.prontuario " || fail "owner missed reserved prontuario"
echo " $owner_ids " | grep -q " entity.slot " || fail "owner missed slot"
printf 'owner_query_row_ids=%s\n' "$owner_ids"

invitee_email="s5-invitee-$(date +%s)@example.invalid"
signup_json="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":"Prove-s5-compartments-1","name":"s5 invitee"}))' "$invitee_email")"
body="${work}/invitee-signup"
status="$(
  curl -sS -o "$body" -w '%{http_code}' \
    -c "$invitee_jar" \
    -H 'content-type: application/json' \
    -H "Origin: ${base}" \
    -d "$signup_json" \
    "${base}/api/auth/sign-up/email"
)"
record "POST /api/auth/sign-up/email (invitee)" "curl sign-up invitee" "${base}/api/auth/sign-up/email" "$status" "signed_up"
[[ "$status" == "200" ]] || fail "invitee sign-up ${status}"
invitee_token="$(session_token_from_jar "$invitee_jar")"
invitee_user="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["user"]["id"])' < "$body")"

body="${work}/invitee-provisional"
status="$(
  curl -sS -o "$body" -w '%{http_code}' \
    -X POST \
    -H "Authorization: Bearer ${admin_token}" \
    -H 'content-type: application/json' \
    -d "$(python3 -c 'import json,sys; print(json.dumps({"provider":"auth_door","subjectKey":sys.argv[1]}))' "$invitee_user")" \
    "${zoend_base}/identity/admin/provisional"
)"
invitee_account="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["accountId"])' < "$body")"
record "POST /identity/admin/provisional (invitee)" "curl provisional invitee" "${zoend_base}/identity/admin/provisional" "$status" "account=${invitee_account}"
[[ "$status" == "200" ]] || fail "invitee provisional ${status}"

body="${work}/invitee-verify"
status="$(
  curl -sS -o "$body" -w '%{http_code}' \
    -X POST \
    -H "Authorization: Bearer ${admin_token}" \
    -H 'content-type: application/json' \
    -d "$(python3 -c 'import json,sys; print(json.dumps({"accountId":sys.argv[1]}))' "$invitee_account")" \
    "${zoend_base}/identity/admin/verify-binding"
)"
record "POST /identity/admin/verify-binding (invitee)" "curl verify-binding invitee" "${zoend_base}/identity/admin/verify-binding" "$status" "$(excerpt_file "$body")"
[[ "$status" == "200" ]] || fail "invitee verify ${status}"

commit_dest_invite "$invitee_account" "principal.invitee" "actor.invitee" "s5-dest-invite-token" "proposal.s5-invite" "operation.s5-invite" "invitee"

body="${work}/invitee-context"
status="$(
  curl -sS -o "$body" -w '%{http_code}' \
    -H "Authorization: Bearer ${invitee_token}" \
    "${zoend_base}/identity/admin/resolve-context?tenant=${tenant_id}"
)"
invitee_clearance="$(python3 -c 'import json,sys; print(" ".join(json.load(open(sys.argv[1],encoding="utf-8")).get("clearance") or []))' "$body")"
record "GET /identity/admin/resolve-context (invitee)" "curl resolve-context invitee" "${zoend_base}/identity/admin/resolve-context" "$status" "clearance=${invitee_clearance}"
[[ "$status" == "200" ]] || fail "invitee resolve-context ${status}"
[[ "$invitee_clearance" == "zoen.world.floor" ]] || fail "invitee clearance was ${invitee_clearance} not zoen.world.floor"
printf 'invitee_membership_clearance=%s\n' "$invitee_clearance"

stage_ids="$(python3 - <<'PY'
print(",".join(f'"membership.stage.{i:02d}"' for i in range(1, 34)))
PY
)"
body="${work}/plant-stage"
status="$(
  curl -sS -o "$body" -w '%{http_code}' \
    -X POST \
    -H "Authorization: Bearer ${admin_token}" \
    -H 'content-type: application/json' \
    -d "{\"tenantId\":\"${tenant_id}\",\"stageId\":\"stage.overcap\",\"membershipIds\":[${stage_ids}]}" \
    "${zoend_base}/conversation/stages"
)"
record "POST /conversation/stages 33 members" "curl plant ConversationStage 33" "${zoend_base}/conversation/stages" "$status" "$(excerpt_file "$body")"
[[ "$status" == "200" ]] || fail "plant stage ${status}"

body="${work}/who-can"
status="$(
  curl -sS -o "$body" -w '%{http_code}' \
    -X POST \
    -H "Authorization: Bearer ${owner_token}" \
    -H 'content-type: application/json' \
    -H "x-zoen-tenant: ${tenant_id}" \
    -d "$(python3 -c 'import json,sys; print(json.dumps({
      "tenantId":sys.argv[1],
      "stageId":"stage.overcap",
      "definitionId":"zoen.personal.workspace",
      "digest":sys.argv[2],
      "revision":1,
      "entityId":"entity.slot",
      "validAtMicros":int(sys.argv[3]),
    }))' "$tenant_id" "$digest" "$valid_at_micros")" \
    "${zoend_base}/conversation/who-can"
)"
who_can_error="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1],encoding="utf-8")).get("error") or "")' "$body")"
record "POST /conversation/who-can stage of 33" "curl who-can over cap" "${zoend_base}/conversation/who-can" "$status" "$who_can_error"
[[ "$status" != "200" ]] || fail "whoCan over 32 did not fail closed"
printf '%s' "$who_can_error" | grep -qi 'fail closed' || fail "whoCan error missing fail closed: ${who_can_error}"
printf '%s' "$who_can_error" | grep -q '32' || fail "whoCan error missing cap 32: ${who_can_error}"
printf 'whoCan_over_32_error=%s\n' "$who_can_error"

body="${work}/group-jid"
status="$(
  curl -sS -o "$body" -w '%{http_code}' \
    -H "Authorization: Bearer ${admin_token}" \
    "${zoend_base}/identity/admin/resolve-subject?provider=whatsapp&subjectKey=120363000000000000%40g.us"
)"
group_error="$(python3 -c 'import json,sys
raw=open(sys.argv[1],encoding="utf-8").read().strip()
if not raw:
    print("empty")
    raise SystemExit(0)
try:
    doc=json.loads(raw)
except json.JSONDecodeError:
    print(raw[:200])
    raise SystemExit(0)
print(doc.get("error") or raw[:200])' "$body")"
record "GET resolve-subject group JID @g.us" "curl resolve-subject whatsapp @g.us" "${zoend_base}/identity/admin/resolve-subject" "$status" "$group_error"
[[ "$status" != "200" ]] || fail "group JID was accepted as Channel.subject"
printf '%s' "$group_error" | grep -qi 'invalid external subject' || fail "group JID error was ${group_error}"
printf 'group_jid_channel_subject_error=%s\n' "$group_error"

printf 'owner_still_reads_reserved_note=%s\n' "$owner_ids"

{
  printf '## Verdict\n\n'
  printf 'pass. Four kernel Actions published. Reception reads slot, empty on prontuario. classifiedAs unchanged after share. Invitee clearance zoen.world.floor from zoend resolve-context. whoCan over 32 fail closed. Owner reads reserved note. Group JID rejected as subject.\n'
} >> "$draft"
cp "$draft" "$proof"
printf 'wrote %s\n' "$proof"
