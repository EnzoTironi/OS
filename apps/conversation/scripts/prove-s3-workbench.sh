#!/usr/bin/env bash
set -euo pipefail

conv="$(cd "$(dirname "$0")/.." && pwd)"
repo="$(cd "$conv/../.." && pwd)"
auth="$repo/apps/auth"
cd "$auth"

if [[ -z "${DOCKER_HOST:-}" && ! -S /var/run/docker.sock ]]; then
  export DOCKER_HOST=tcp://127.0.0.1:2375
fi

base="http://127.0.0.1:58704"
ok_url="${base}/api/auth/ok"
zoend_base="http://127.0.0.1:58705"
proof="/workspace/ship/s3-workbench-proof.md"
work="$(mktemp -d)"
trap 'cleanup' EXIT
draft="${work}/proof.md"
owner_jar="${work}/owner.cookies"
reception_jar="${work}/reception.cookies"
zoend_pg_name="zoen-s3-workbench-pg-$$"
zoend_pid=""
eve_pid=""
auth_started=0
admin_token="s3-workbench-admin-token"
valid_at="2026-01-15T00:00:00Z"

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
  if [[ -n "${eve_log:-}" && -f "${eve_log:-}" ]]; then
    tail -n 80 "$eve_log" >&2 || true
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
  if [[ -n "${eve_pid}" ]] && kill -0 "$eve_pid" 2>/dev/null; then
    kill_tree "$eve_pid"
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

connect() {
  local token="$1" path="$2" body="$3" out="$4"
  local extra=()
  if [[ -n "${5:-}" ]]; then
    extra=(-H "x-zoen-tenant: $5")
  fi
  curl -sS -o "$out" -w '%{http_code}' \
    -H "Authorization: Bearer ${token}" \
    -H 'content-type: application/json' \
    -H 'connect-protocol-version: 1' \
    "${extra[@]}" \
    -d "$body" \
    "${zoend_base}${path}"
}

excerpt_file() {
  python3 - "$1" <<'PY'
import sys
raw = open(sys.argv[1], encoding="utf-8").read().strip()
print(raw.replace("\n", " ")[:400])
PY
}

mkdir -p "$(dirname "$proof")"
{
  printf '# s3-workbench proof\n\n'
  printf 'Source: `apps/conversation/scripts/prove-s3-workbench.sh`\n'
  printf 'Worktree: `%s`\n\n' "$repo"
} > "$draft"

node "$conv/scripts/check-isolate-no-commit.mjs" || fail "isolate cannot commit lock"
record "isolate cannot commit import-graph lock" \
  "node apps/conversation/scripts/check-isolate-no-commit.mjs" \
  "n/a" "pass" "isolate host runner does not call ActionService/Commit"

if [[ ! -d node_modules ]]; then
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

canon_src="${repo}/testdata/dest/s2-read/definition.canonical.json"
canon="${work}/definition.json"
digest="$(
  python3 - "$canon_src" "$canon" <<'PY'
import hashlib, sys
src, dest = sys.argv[1], sys.argv[2]
raw = open(src, "rb").read().strip()
open(dest, "wb").write(raw)
print(hashlib.sha256(raw).hexdigest())
PY
)"
read_src="$(cat "${repo}/testdata/dest/s2-read/read.cedar")"
activate_src="$(cat "${repo}/testdata/dest/s2-read/activate.cedar")"
stamp_src="$(cat "${repo}/testdata/dest/s2-read/stamp.cedar")"
policies="${work}/policies.json"
python3 - "$policies" "$digest" "$read_src" "$activate_src" "$stamp_src" <<'PY'
import hashlib, json, sys
path, digest, read_src, activate_src, stamp_src = sys.argv[1:]
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
    entry("zoen.world.read", "policy.s2.read", read_src),
    entry("zoen.definition.activate", "policy.s2.activate", activate_src),
    entry("world.stampLow", "policy.s2.stamp", stamp_src),
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
  sleep 0.25
done
[[ "$zoend_ready" -eq 1 ]] || fail "zoend /ready did not answer"

owner_email="s3-owner-$(date +%s)@example.invalid"
signup_json="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":"Prove-s3-work-1","name":"s3 owner"}))' "$owner_email")"
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
owner_user="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["user"]["id"])' < "$body")"

body="${work}/bootstrap"
status="$(
  curl -sS -o "$body" -w '%{http_code}' \
    -X POST \
    -H "Authorization: Bearer ${owner_token}" \
    "${zoend_base}/identity/admin/bootstrap-bound"
)"
tenant_id="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["tenantId"])' < "$body")"
owner_membership="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["membershipId"])' < "$body")"
record "POST /identity/admin/bootstrap-bound (owner)" "curl bootstrap-bound" "${zoend_base}/identity/admin/bootstrap-bound" "$status" "tenant=${tenant_id} membership=${owner_membership}"
[[ "$status" == "200" ]] || fail "bootstrap-bound ${status}"

updated="$(docker exec "$zoend_pg_name" psql -U postgres -d zoen -v ON_ERROR_STOP=1 -tAc \
  "UPDATE memberships
   SET clearance_json = '[\"zoen.world.floor\",\"zoen.world.reserved\",\"zoen.world.top\"]'::jsonb,
       delegation_json = '{\"grants\":[{\"actionIds\":[\"zoen.definition.activate\",\"world.stampLow\"],\"delegationId\":\"delegation.personal\",\"expiresAt\":253402300799,\"notBefore\":0,\"resourceIds\":[\"world.s2read\",\"entity.note\"],\"workloadIds\":[\"workload.personal\"]}]}'::jsonb
   WHERE membership_id = '${owner_membership}'
   RETURNING membership_id")"
updated="$(printf '%s' "$updated" | tr -d '[:space:]')"
[[ "$updated" == *"$owner_membership"* ]] || fail "owner membership update missed"

reception_email="s3-reception-$(date +%s)@example.invalid"
signup_json="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":"Prove-s3-work-1","name":"s3 reception"}))' "$reception_email")"
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
reception_user="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["user"]["id"])' < "$body")"

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
record "POST /identity/admin/provisional (reception)" "curl provisional" "${zoend_base}/identity/admin/provisional" "$status" "account=${reception_account}"
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
record "POST /identity/admin/verify-binding (reception)" "curl verify-binding" "${zoend_base}/identity/admin/verify-binding" "$status" "$(excerpt_file "$body")"
[[ "$status" == "200" ]] || fail "verify-binding ${status}"

invite_token="s3-workbench-invite-token"
body="${work}/invite"
status="$(
  curl -sS -o "$body" -w '%{http_code}' \
    -X POST \
    -H "Authorization: Bearer ${admin_token}" \
    -H 'content-type: application/json' \
    -d "$(python3 -c 'import json,sys; print(json.dumps({
      "tenantId":sys.argv[1],
      "principalId":"principal.reception",
      "token":sys.argv[2],
      "expiresAtMicros": 4102444800000000,
      "workloadId":"workload.personal",
      "actorId":"actor.reception",
      "actionIds":["zoen.definition.activate"],
      "resourceIds":["zoen.personal.workspace"],
    }))' "$tenant_id" "$invite_token")" \
    "${zoend_base}/identity/admin/invites"
)"
record "POST /identity/admin/invites" "curl invites" "${zoend_base}/identity/admin/invites" "$status" "$(excerpt_file "$body")"
[[ "$status" == "200" ]] || fail "invite ${status}"

body="${work}/accept"
status="$(
  curl -sS -o "$body" -w '%{http_code}' \
    -X POST \
    -H "Authorization: Bearer ${reception_token}" \
    -H 'content-type: application/json' \
    -d "$(python3 -c 'import json,sys; print(json.dumps({"accountId":sys.argv[1],"token":sys.argv[2]}))' "$reception_account" "$invite_token")" \
    "${zoend_base}/identity/admin/accept-invite"
)"
reception_membership="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["membershipId"])' < "$body")"
record "POST /identity/admin/accept-invite" "curl accept-invite" "${zoend_base}/identity/admin/accept-invite" "$status" "membership=${reception_membership}"
[[ "$status" == "200" ]] || fail "accept-invite ${status}"

canon_b64="$(python3 -c 'import base64,sys; print(base64.b64encode(open(sys.argv[1],"rb").read()).decode())' "$canon")"
body="${work}/publish"
status="$(
  connect "$owner_token" "/zoen.definition.v1.DefinitionService/Publish" "$(python3 -c 'import json,sys; print(json.dumps({
    "tenantId":sys.argv[1],
    "canonicalJson":sys.argv[2],
    "digest":sys.argv[3],
  }))' "$tenant_id" "$canon_b64" "$digest")" "$body"
)"
record "DefinitionService/Publish" "curl Publish" "${zoend_base}/zoen.definition.v1.DefinitionService/Publish" "$status" "$(excerpt_file "$body")"
[[ "$status" == "200" ]] || fail "publish ${status}"

body="${work}/activate"
status="$(
  connect "$owner_token" "/zoen.definition.v1.DefinitionService/ActivateRevision" "$(python3 -c 'import json,sys; print(json.dumps({
    "tenantId":sys.argv[1],
    "definitionId":"world.s2read",
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
ref = "urn:zoen:s3-workbench:"+claim
source_digest = hashlib.sha256(ref.encode()).hexdigest()
print(json.dumps({
  "tenantId": tenant,
  "operationId": "operation."+claim.replace(".","-"),
  "claim": {
    "claimId": claim,
    "definition": {"definitionId":"world.s2read","revision":"1","digest":digest},
    "entityId": entity,
    "relationId": relation,
    "value": {"textValue": text},
    "validTime": {"instant": valid},
    "provenance": {
      "sourceId": "source.s3workbench",
      "sourceDigest": source_digest,
      "sourceRef": ref,
    },
  },
}))' "$tenant_id" "$digest" "$claim_id" "$entity" "$relation" "$text" "$valid_at")"
  connect "$token" "/zoen.world.v1.WorldService/RecordEvidence" "$payload" "$out"
}

status="$(record_claim "$owner_token" "claim.public.body" "entity.note.public" "world.body" "public note" "${work}/public-body")"
record "WorldService/RecordEvidence public" "curl RecordEvidence public" "${zoend_base}/zoen.world.v1.WorldService/RecordEvidence" "$status" "$(excerpt_file "${work}/public-body")"
[[ "$status" == "200" ]] || fail "public body ${status}"
status="$(record_claim "$owner_token" "claim.public.label" "entity.note.public" "zoen.classifiedAs" "zoen.world.floor" "${work}/public-label")"
[[ "$status" == "200" ]] || fail "public label ${status}"

disks_root="${work}/disks"
mkdir -p "$disks_root"
drive_log="${work}/drive.md"
set +e
(
  cd "$conv"
  export S3_DISKS_ROOT="$disks_root"
  export S3_ZOEND="$zoend_base"
  export S3_MEMBERSHIP_A="$owner_membership"
  export S3_TOKEN_A="$owner_token"
  export S3_MEMBERSHIP_B="$reception_membership"
  export S3_TOKEN_B="$reception_token"
  export S3_TENANT="$tenant_id"
  export S3_DEFINITION_ID="world.s2read"
  export S3_DEFINITION_DIGEST="$digest"
  export S3_VALID_AT="$valid_at"
  npx --yes tsx scripts/prove-s3-workbench-drive.ts
) >"$drive_log" 2>&1
drive_exit="$?"
set -e
cat "$drive_log" >> "$draft"
record "membership workbench drive" "npx tsx scripts/prove-s3-workbench-drive.ts" "n/a" "$drive_exit" "$(tr '\n' ' ' < "$drive_log" | head -c 400)"
[[ "$drive_exit" -eq 0 ]] || fail "workbench drive failed"

propose="$(python3 -c 'import json,sys
print(json.dumps({
  "proposalId":"proposal.stamp-low",
  "operationId":"operation.stamp-low",
  "definition":{"definitionId":"world.s2read","revision":"1","digest":sys.argv[1]},
  "actionId":"world.stampLow",
  "resourceId":"entity.note.derived",
  "inputs":[
    {"inputId":"left","value":{"entityRefValue":"entity.note.public"}},
    {"inputId":"right","value":{"entityRefValue":"entity.note.public"}},
  ],
  "validAt":sys.argv[2],
  "expiresAt":"2030-01-01T00:00:00Z",
}))' "$digest" "$valid_at")"
body="${work}/propose"
status="$(connect "$owner_token" "/zoen.action.v1.ActionService/Propose" "$propose" "$body" "$tenant_id")"
decision="$(python3 -c 'import json,sys
doc=json.load(open(sys.argv[1],encoding="utf-8"))
print(doc.get("decision") or "")
print((doc.get("policy") or {}).get("determiningPolicies") or doc.get("policy") or "")
' "$body")"
record "3. ActionService/Propose world.stampLow (Cedar)" \
  "curl POST Propose world.stampLow Authorization:Bearer <owner TEC>" \
  "${zoend_base}/zoen.action.v1.ActionService/Propose" "$status" "cedar=${decision} body=$(excerpt_file "$body")"
[[ "$status" == "200" ]] || fail "propose ${status}"
preview_hash="$(python3 -c 'import json,sys; print((json.load(open(sys.argv[1],encoding="utf-8")).get("proposal") or {}).get("previewHash") or "")' "$body")"

body="${work}/commit"
status="$(
  connect "$owner_token" "/zoen.action.v1.ActionService/Commit" "$(python3 -c 'import json,sys; print(json.dumps({
    "proposalId":"proposal.stamp-low",
    "operationId":"operation.stamp-low",
    "previewHash":sys.argv[1],
  }))' "$preview_hash")" "$body" "$tenant_id"
)"
record "3b. ActionService/Commit world.stampLow (Cedar/engine)" \
  "curl POST Commit world.stampLow Authorization:Bearer <owner TEC>" \
  "${zoend_base}/zoen.action.v1.ActionService/Commit" "$status" "$(excerpt_file "$body")"
python3 - "$body" "$status" <<'PY' || fail "zoend commit was not a policy/engine decision"
import json,sys
status=sys.argv[2]
doc=json.load(open(sys.argv[1],encoding="utf-8"))
text=json.dumps(doc)
if "isolate cannot commit" in text:
    raise SystemExit("isolate deny leaked onto zoend")
if status != "200" and not status.startswith("4"):
    raise SystemExit("unexpected status "+status)
PY

if [[ ! -d "$conv/node_modules" ]]; then
  (cd "$conv" && npm ci)
fi
node "$conv/scripts/check-isolate-no-commit.mjs" || fail "lock after install"

eve_node="$(command -v node)"
if [[ -x /tmp/node24/node-v24.20.0-linux-x64/bin/node ]]; then
  eve_node="/tmp/node24/node-v24.20.0-linux-x64/bin/node"
fi
fuser -k 58706/tcp >/dev/null 2>&1 || true
build_log="${work}/eve-build.log"
(
  cd "$conv"
  export PATH="$(dirname "$eve_node"):${PATH}"
  export ZOEN_MODEL="${ZOEN_MODEL:-openai-compatible/hy3-free}"
  "$eve_node" ./node_modules/eve/bin/eve.js build
) >"$build_log" 2>&1 || {
  record "eve build workbench" "eve build" "apps/conversation" "fail" "$(tr '\n' ' ' < "$build_log" | head -c 400)"
  fail "eve build failed"
}
record "eve build workbench" "eve build" "apps/conversation" "pass" "$(tr '\n' ' ' < "$build_log" | head -c 400)"

eve_log="${work}/eve.log"
(
  cd "$conv"
  export PATH="$(dirname "$eve_node"):${PATH}"
  export ZOEN_MODEL="${ZOEN_MODEL:-openai-compatible/hy3-free}"
  export ZOEN_AUTH_BASE_URL="$base"
  export ZOEN_ZOEND_BASE_URL="$zoend_base"
  exec "$eve_node" ./node_modules/eve/bin/eve.js start --host 127.0.0.1 --port 58706
) >"$eve_log" 2>&1 &
eve_pid="$!"
eve_ok=0
for _ in $(seq 1 120); do
  if grep -qE "initialized [0-9]+ sandbox|Listening on|server listening" "$eve_log" 2>/dev/null; then
    eve_ok=1
    break
  fi
  if ! kill -0 "$eve_pid" 2>/dev/null; then
    break
  fi
  sleep 0.5
done
eve_excerpt="$(tr '\n' ' ' < "$eve_log" | head -c 400)"
if grep -qE "requires Node.js|failed to initialize sandbox template|Cannot find package" "$eve_log"; then
  record "eve start workbench backend" "eve start --port 58706" "http://127.0.0.1:58706/eve/v1/health" "fail" "$eve_excerpt"
  fail "eve start sandbox failed"
fi
if [[ "$eve_ok" -ne 1 ]]; then
  record "eve start workbench backend" "eve start --port 58706" "http://127.0.0.1:58706/eve/v1/health" "fail" "$eve_excerpt"
  fail "eve start did not initialize sandbox"
fi
health_code="000"
for _ in $(seq 1 40); do
  health_code="$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 1 --max-time 2 http://127.0.0.1:58706/eve/v1/health || true)"
  if [[ "$health_code" == "200" ]]; then
    break
  fi
  sleep 0.25
done
record "eve start workbench backend" "eve start --port 58706" "http://127.0.0.1:58706/eve/v1/health" "$health_code" "$eve_excerpt"
[[ "$health_code" == "200" ]] || fail "eve health ${health_code}"

{
  printf '## Verdict\n\n'
  printf 'pass. Membership A sandbox runs real zoen under isolate, read verb, isolate commit deny, zoend Cedar still decides, isolate network deny, membership B cannot read A VFS.\n'
} >> "$draft"
cp "$draft" "$proof"
printf 'wrote %s\n' "$proof"
