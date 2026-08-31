#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
repo="$(cd "$root/../.." && pwd)"
cd "$root"

if [[ -z "${DOCKER_HOST:-}" && ! -S /var/run/docker.sock ]]; then
  export DOCKER_HOST=tcp://127.0.0.1:2375
fi

base="http://127.0.0.1:58704"
ok_url="${base}/api/auth/ok"
zoend_base="http://127.0.0.1:58705"
proof="/workspace/ship/s2-read-proof.md"
work="$(mktemp -d)"
trap 'cleanup' EXIT
draft="${work}/proof.md"
owner_jar="${work}/owner.cookies"
reception_jar="${work}/reception.cookies"
zoend_pg_name="zoen-s2-read-pg-$$"
zoend_pid=""
auth_started=0
admin_token="s2-read-admin-token"
valid_at="2026-01-15T00:00:00Z"
wasm="${repo}/e2e/wasm-code-mode/fixtures/program.component.wasm"
wasm_digest="6c27f55314e7fa14be0115043e1ef08602a2702e21edcd5aa2bcec8935838d84"

stamp() {
  TZ=America/Sao_Paulo date '+%Y-%m-%d %H:%M:%S %Z'
}

fail() {
  printf '%s\n' "$1" >&2
  if [[ -n "${body:-}" && -f "${body:-}" ]]; then
    cp "$body" /workspace/ship/s2-read-last-body.json 2>/dev/null || true
    cat "$body" >&2 || true
  fi
  if [[ -n "${zoend_log:-}" && -f "${zoend_log:-}" ]]; then
    cp "$zoend_log" /workspace/ship/s2-read-zoend.log 2>/dev/null || true
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
      for _ in $(seq 1 50); do
        if ! kill -0 "$recorded" 2>/dev/null; then
          break
        fi
        sleep 0.1
      done
    fi
    rm -f .auth.pid
  fi
  rm -rf "$work"
}

record() {
  local heading="$1" command="$2" url="$3" status="$4" excerpt="$5" ts="$6"
  {
    printf '## %s\n\n' "$heading"
    printf 'command: %s\n' "$command"
    printf 'url: %s\n' "$url"
    printf 'status: %s\n' "$status"
    printf 'excerpt: %s\n' "$excerpt"
    printf 'timestamp: %s\n\n' "$ts"
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
import json, sys
raw = open(sys.argv[1], encoding="utf-8").read().strip()
print(raw.replace("\n", " ")[:400])
PY
}

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
    for _ in $(seq 1 50); do
      if ! kill -0 "$recorded" 2>/dev/null; then
        break
      fi
      sleep 0.1
    done
  fi
  rm -f .auth.pid
fi

fuser -k 58704/tcp >/dev/null 2>&1 || true
for _ in $(seq 1 50); do
  if ! curl -sf --connect-timeout 1 "$ok_url" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done
for _ in $(seq 1 50); do
  if ! ss -ltn 2>/dev/null | grep -q ':58704'; then
    break
  fi
  fuser -k 58704/tcp >/dev/null 2>&1 || true
  sleep 0.1
done

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
if [[ "$ready" -ne 1 ]]; then
  cat .auth.log >&2
  fail "auth door did not become ready"
fi

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

{
  printf '# s2-read proof\n\n'
  printf 'Source: `apps/auth/scripts/prove-s2-read.sh`\n'
  printf 'Auth host: `%s`\n' "$base"
  printf 'zoend host: `%s`\n' "$zoend_base"
  printf 'definition digest: `%s`\n\n' "$digest"
} > "$draft"

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
[[ -x "$zoend_bin" ]] || fail "zoend binary missing after build"

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

owner_email="s2-read-owner-$(date +%s)@example.invalid"
signup_json="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":"Prove-s2-read-1","name":"s2 owner"}))' "$owner_email")"
url="${base}/api/auth/sign-up/email"
body="${work}/owner-signup"
status="$(
  curl -sS -o "$body" -w '%{http_code}' \
    -c "$owner_jar" \
    -H 'content-type: application/json' \
    -H "Origin: ${base}" \
    -d "$signup_json" \
    "$url"
)"
record "POST /api/auth/sign-up/email (owner)" \
  "curl -sS -c owner.jar -H content-type:application/json -H Origin:${base} -d {email,password,name} ${url}" \
  "$url" "$status" "signed_up_status=${status}" "$(stamp)"
[[ "$status" == "200" ]] || fail "owner sign-up status ${status}"
owner_token="$(session_token_from_jar "$owner_jar")"
owner_user="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["user"]["id"])' < "$body")"

url="${zoend_base}/identity/admin/bootstrap-bound"
body="${work}/bootstrap"
status="$(
  curl -sS -o "$body" -w '%{http_code}' \
    -X POST \
    -H "Authorization: Bearer ${owner_token}" \
    "$url"
)"
tenant_id="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["tenantId"])' < "$body")"
owner_membership="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["membershipId"])' < "$body")"
owner_account="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["accountId"])' < "$body")"
record "POST /identity/admin/bootstrap-bound (owner Personal)" \
  "curl -sS -X POST -H Authorization:Bearer <owner-session> ${url}" \
  "$url" "$status" "tenant=${tenant_id} membership=${owner_membership}" "$(stamp)"
[[ "$status" == "200" ]] || fail "bootstrap-bound status ${status}"

updated="$(docker exec "$zoend_pg_name" psql -U postgres -d zoen -v ON_ERROR_STOP=1 -tAc \
  "UPDATE memberships
   SET clearance_json = '[\"zoen.world.floor\",\"zoen.world.reserved\",\"zoen.world.top\"]'::jsonb,
       delegation_json = '{\"grants\":[{\"actionIds\":[\"zoen.definition.activate\",\"world.stampLow\"],\"delegationId\":\"delegation.personal\",\"expiresAt\":253402300799,\"notBefore\":0,\"resourceIds\":[\"world.s2read\",\"entity.note\"],\"workloadIds\":[\"workload.personal\"]}]}'::jsonb
   WHERE membership_id = '${owner_membership}'
   RETURNING membership_id")"
updated="$(printf '%s' "$updated" | tr -d '[:space:]')"
[[ "$updated" == *"$owner_membership"* ]] || fail "owner membership update missed id=${owner_membership} updated=${updated}"

reception_email="s2-read-reception-$(date +%s)@example.invalid"
signup_json="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":"Prove-s2-read-1","name":"s2 reception"}))' "$reception_email")"
url="${base}/api/auth/sign-up/email"
body="${work}/reception-signup"
status="$(
  curl -sS -o "$body" -w '%{http_code}' \
    -c "$reception_jar" \
    -H 'content-type: application/json' \
    -H "Origin: ${base}" \
    -d "$signup_json" \
    "$url"
)"
record "POST /api/auth/sign-up/email (reception)" \
  "curl -sS -c reception.jar -H content-type:application/json -d {email,password,name} ${url}" \
  "$url" "$status" "signed_up_status=${status}" "$(stamp)"
[[ "$status" == "200" ]] || fail "reception sign-up status ${status}"
reception_token="$(session_token_from_jar "$reception_jar")"
reception_user="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["user"]["id"])' < "$body")"

url="${zoend_base}/identity/admin/provisional"
body="${work}/provisional"
status="$(
  curl -sS -o "$body" -w '%{http_code}' \
    -X POST \
    -H "Authorization: Bearer ${admin_token}" \
    -H 'content-type: application/json' \
    -d "$(python3 -c 'import json,sys; print(json.dumps({"provider":"auth_door","subjectKey":sys.argv[1]}))' "$reception_user")" \
    "$url"
)"
reception_account="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["accountId"])' < "$body")"
record "POST /identity/admin/provisional (reception AuthDoor)" \
  "curl -sS -X POST -H Authorization:Bearer <admin> ${url}" \
  "$url" "$status" "account=${reception_account}" "$(stamp)"
[[ "$status" == "200" ]] || fail "provisional status ${status}"

url="${zoend_base}/identity/admin/verify-binding"
body="${work}/verify"
status="$(
  curl -sS -o "$body" -w '%{http_code}' \
    -X POST \
    -H "Authorization: Bearer ${admin_token}" \
    -H 'content-type: application/json' \
    -d "$(python3 -c 'import json,sys; print(json.dumps({"accountId":sys.argv[1]}))' "$reception_account")" \
    "$url"
)"
record "POST /identity/admin/verify-binding (reception)" \
  "curl -sS -X POST -H Authorization:Bearer <admin> ${url}" \
  "$url" "$status" "$(excerpt_file "$body")" "$(stamp)"
[[ "$status" == "200" ]] || fail "verify-binding status ${status}"

invite_token="s2-read-invite-token"
url="${zoend_base}/identity/admin/invites"
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
    "$url"
)"
record "POST /identity/admin/invites (reception into owner tenant)" \
  "curl -sS -X POST -H Authorization:Bearer <admin> ${url}" \
  "$url" "$status" "$(excerpt_file "$body")" "$(stamp)"
[[ "$status" == "200" ]] || fail "create invite status ${status}"

url="${zoend_base}/identity/admin/accept-invite"
body="${work}/accept"
status="$(
  curl -sS -o "$body" -w '%{http_code}' \
    -X POST \
    -H "Authorization: Bearer ${reception_token}" \
    -H 'content-type: application/json' \
    -d "$(python3 -c 'import json,sys; print(json.dumps({"accountId":sys.argv[1],"token":sys.argv[2]}))' "$reception_account" "$invite_token")" \
    "$url"
)"
reception_membership="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["membershipId"])' < "$body")"
record "POST /identity/admin/accept-invite (reception Door)" \
  "curl -sS -X POST -H Authorization:Bearer <reception-session> ${url}" \
  "$url" "$status" "membership=${reception_membership}" "$(stamp)"
[[ "$status" == "200" ]] || fail "accept-invite status ${status}"

memberships="$(docker exec "$zoend_pg_name" psql -U postgres -d zoen -tAc "SELECT count(*) FROM memberships WHERE tenant_id = '${tenant_id}' AND status = 'active'")"
[[ "$memberships" == "2" ]] || fail "want 2 active memberships, got ${memberships}"

canon_b64="$(python3 -c 'import base64,sys; print(base64.b64encode(open(sys.argv[1],"rb").read()).decode())' "$canon")"
url="/zoen.definition.v1.DefinitionService/Publish"
body="${work}/publish"
status="$(
  connect "$owner_token" "$url" "$(python3 -c 'import json,sys; print(json.dumps({
    "tenantId":sys.argv[1],
    "canonicalJson":sys.argv[2],
    "digest":sys.argv[3],
  }))' "$tenant_id" "$canon_b64" "$digest")" "$body"
)"
record "DefinitionService/Publish" \
  "curl POST ${zoend_base}${url} Authorization:Bearer <owner>" \
  "${zoend_base}${url}" "$status" "$(excerpt_file "$body")" "$(stamp)"
[[ "$status" == "200" ]] || { cat "$zoend_log" >&2; fail "publish status ${status}"; }

url="/zoen.definition.v1.DefinitionService/ActivateRevision"
body="${work}/activate"
status="$(
  connect "$owner_token" "$url" "$(python3 -c 'import json,sys; print(json.dumps({
    "tenantId":sys.argv[1],
    "definitionId":"world.s2read",
    "digest":sys.argv[2],
    "expectNoActiveRevision": True,
  }))' "$tenant_id" "$digest")" "$body"
)"
record "DefinitionService/ActivateRevision" \
  "curl POST ${zoend_base}${url} Authorization:Bearer <owner>" \
  "${zoend_base}${url}" "$status" "$(excerpt_file "$body")" "$(stamp)"
[[ "$status" == "200" ]] || { cat "$zoend_log" >&2; fail "activate status ${status}"; }

record_claim() {
  local token="$1" claim_id="$2" entity="$3" relation="$4" text="$5" out="$6"
  local payload
  payload="$(python3 -c 'import hashlib,json,sys
tenant, digest, claim, entity, relation, text, valid = sys.argv[1:]
ref = "urn:zoen:s2-read:"+claim
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
      "sourceId": "source.s2read",
      "sourceDigest": source_digest,
      "sourceRef": ref,
    },
  },
}))' "$tenant_id" "$digest" "$claim_id" "$entity" "$relation" "$text" "$valid_at")"
  connect "$token" "/zoen.world.v1.WorldService/RecordEvidence" "$payload" "$out"
}

status="$(record_claim "$owner_token" "claim.public.body" "entity.note.public" "world.body" "public note" "${work}/public-body")"
record "WorldService/RecordEvidence public body" \
  "curl POST RecordEvidence public" \
  "${zoend_base}/zoen.world.v1.WorldService/RecordEvidence" "$status" "$(excerpt_file "${work}/public-body")" "$(stamp)"
[[ "$status" == "200" ]] || fail "public body ${status}"

status="$(record_claim "$owner_token" "claim.public.label" "entity.note.public" "zoen.classifiedAs" "zoen.world.floor" "${work}/public-label")"
record "WorldService/RecordEvidence public classifiedAs floor" \
  "curl POST RecordEvidence public label" \
  "${zoend_base}/zoen.world.v1.WorldService/RecordEvidence" "$status" "$(excerpt_file "${work}/public-label")" "$(stamp)"
[[ "$status" == "200" ]] || fail "public label ${status}"

status="$(record_claim "$owner_token" "claim.reserved.body" "entity.note.reserved" "world.body" "reserved note" "${work}/reserved-body")"
record "WorldService/RecordEvidence reserved body" \
  "curl POST RecordEvidence reserved" \
  "${zoend_base}/zoen.world.v1.WorldService/RecordEvidence" "$status" "$(excerpt_file "${work}/reserved-body")" "$(stamp)"
[[ "$status" == "200" ]] || fail "reserved body ${status}"

status="$(record_claim "$owner_token" "claim.reserved.label" "entity.note.reserved" "zoen.classifiedAs" "zoen.world.reserved" "${work}/reserved-label")"
record "WorldService/RecordEvidence reserved classifiedAs reserved" \
  "curl POST RecordEvidence reserved label" \
  "${zoend_base}/zoen.world.v1.WorldService/RecordEvidence" "$status" "$(excerpt_file "${work}/reserved-label")" "$(stamp)"
[[ "$status" == "200" ]] || fail "reserved label ${status}"

query_body="$(python3 -c 'import json,sys; print(json.dumps({
  "tenantId":sys.argv[1],
  "definition":{"definitionId":"world.s2read","revision":"1","digest":sys.argv[2]},
  "validAt":sys.argv[3],
  "consistency":{"strong":{}},
  "byType":{"typeId":"world.Note","limit":10},
}))' "$tenant_id" "$digest" "$valid_at")"

url="/zoen.world.v1.WorldService/SemanticQuery"
body="${work}/owner-query"
status="$(connect "$owner_token" "$url" "$query_body" "$body")"
owner_ids="$(python3 -c 'import json,sys
doc=json.load(open(sys.argv[1],encoding="utf-8"))
ids=[]
for value in doc.get("values",[]):
    v=value.get("value") or {}
    if "entityRefValue" in v:
        ids.append(v["entityRefValue"])
print(" ".join(ids))' "$body")"
record "WorldService/SemanticQuery owner ByType world.Note" \
  "curl POST SemanticQuery Authorization:Bearer <owner>" \
  "${zoend_base}${url}" "$status" "row_ids=${owner_ids}" "$(stamp)"
[[ "$status" == "200" ]] || fail "owner query ${status}"
echo " $owner_ids " | grep -q " entity.note.reserved " || fail "owner did not see reserved row"

body="${work}/reception-query"
status="$(connect "$reception_token" "$url" "$query_body" "$body")"
reception_ids="$(python3 -c 'import json,sys
doc=json.load(open(sys.argv[1],encoding="utf-8"))
ids=[]
for value in doc.get("values",[]):
    v=value.get("value") or {}
    if "entityRefValue" in v:
        ids.append(v["entityRefValue"])
print(" ".join(ids))' "$body")"
record "WorldService/SemanticQuery reception ByType world.Note" \
  "curl POST SemanticQuery Authorization:Bearer <reception>" \
  "${zoend_base}${url}" "$status" "row_ids=${reception_ids}" "$(stamp)"
[[ "$status" == "200" ]] || fail "reception query ${status}"
echo " $reception_ids " | grep -q " entity.note.reserved " && fail "reception saw reserved row"
echo " $reception_ids " | grep -q " entity.note.public " || fail "reception missed public row"

wasm_b64="$(python3 -c 'import base64,sys; print(base64.b64encode(open(sys.argv[1],"rb").read()).decode())' "$wasm")"
url="/zoen.computation.v1.ComputationService/PublishComponent"
body="${work}/publish-wasm"
status="$(
  connect "$owner_token" "$url" "$(python3 -c 'import json,sys; print(json.dumps({
    "component":sys.argv[1],
    "claimedDigest":sys.argv[2],
    "componentInterface":"zoen:code-mode/computation@1.0.0",
  }))' "$wasm_b64" "$wasm_digest")" "$body" "$tenant_id"
)"
record "ComputationService/PublishComponent" \
  "curl POST PublishComponent Authorization:Bearer <owner>" \
  "${zoend_base}${url}" "$status" "$(excerpt_file "$body")" "$(stamp)"
[[ "$status" == "200" ]] || fail "publish component ${status}"

exec_body="$(python3 -c 'import json,sys
tenant, digest, valid, wasm = sys.argv[1:]
defn={"definitionId":"world.s2read","revision":"1","digest":digest}
def query_cap(cap_id, entity):
    return {"query":{
        "capabilityId": cap_id,
        "definition": defn,
        "entityId": entity,
        "selection": {"relationId":"world.body"},
        "validAt": valid,
    }}
print(json.dumps({
  "executionId":"execution.s2host",
  "componentDigest":wasm,
  "input": __import__("base64").b64encode(b"pure").decode(),
  "manifest":{
    "componentInterface":"zoen:code-mode/computation@1.0.0",
    "capabilities":[
      query_cap("query.public","entity.note.public"),
      query_cap("query.reserved","entity.note.reserved"),
    ],
  },
  "limits":{
    "fuel":"5000000",
    "memoryBytes":"8388608",
    "tableElements":"1024",
    "instances":"4",
    "tables":"2",
    "memories":"2",
    "deadlineMillis":"2000",
  },
}))' "$tenant_id" "$digest" "$valid_at" "$wasm_digest")"

url="/zoen.computation.v1.ComputationService/Execute"
body="${work}/owner-host"
status="$(connect "$owner_token" "$url" "$exec_body" "$body" "$tenant_id")"
record "ComputationService/Execute owner pinned public+reserved" \
  "curl POST Execute Authorization:Bearer <owner> manifest pins both notes" \
  "${zoend_base}${url}" "$status" "$(excerpt_file "$body")" "$(stamp)"
[[ "$status" == "200" ]] || fail "owner host ${status}"

body="${work}/reception-host"
status="$(connect "$reception_token" "$url" "$exec_body" "$body" "$tenant_id")"
host_status="$(python3 -c 'import json,sys
doc=json.load(open(sys.argv[1],encoding="utf-8"))
print(doc.get("status") or doc.get("code") or "")
print(doc.get("deniedCapability") or doc.get("message") or "")' "$body")"
record "ComputationService/Execute reception pinned public+reserved" \
  "curl POST Execute Authorization:Bearer <reception> manifest pins both notes" \
  "${zoend_base}${url}" "$status" "$(excerpt_file "$body")" "$(stamp)"
python3 - "$body" <<'PY' || fail "reception host was not fail closed"
import json,sys
doc=json.load(open(sys.argv[1],encoding="utf-8"))
text=json.dumps(doc)
if "entity.note.public" in text and "entity.note.reserved" not in text and "CAPABILITY_DENIED" not in text.upper() and "denied" not in text.lower() and "failed_precondition" not in text.lower() and doc.get("status") not in (
    "EXECUTION_STATUS_CAPABILITY_DENIED",
    "CAPABILITY_DENIED",
    2,
):
    raise SystemExit("public-only result")
status=str(doc.get("status") or "")
code=str(doc.get("code") or "")
if "DENIED" not in status.upper() and "denied" not in text.lower() and "failed_precondition" not in code.lower() and "FailedPrecondition" not in text:
    if doc.get("deniedCapability"):
        raise SystemExit(0)
    raise SystemExit("not fail closed: "+text[:300])
PY

url="/zoen.history.v1.HistoryService/Explain"
body="${work}/explain"
status="$(
  connect "$reception_token" "$url" '{"target":{"claimId":"claim.reserved.body"}}' "$body" "$tenant_id"
)"
record "HistoryService/Explain reserved claim as reception" \
  "curl POST Explain claim.reserved.body Authorization:Bearer <reception>" \
  "${zoend_base}${url}" "$status" "$(excerpt_file "$body")" "$(stamp)"
[[ "$status" == "200" ]] || fail "explain ${status}"
python3 - "$body" <<'PY' || fail "reception explain was Full"
import json,sys
doc=json.load(open(sys.argv[1],encoding="utf-8"))
exp=doc.get("explanation") or {}
complete=exp.get("complete")
payload=((exp.get("subject") or {}).get("claim") or {}).get("claim") or {}
if complete is True and "value" in json.dumps(payload):
    raise SystemExit("Full")
if complete is True and not exp.get("gaps"):
    raise SystemExit("complete without gaps")
PY

propose="$(python3 -c 'import json,sys
print(json.dumps({
  "proposalId":"proposal.stamp-low",
  "operationId":"operation.stamp-low",
  "definition":{"definitionId":"world.s2read","revision":"1","digest":sys.argv[1]},
  "actionId":"world.stampLow",
  "resourceId":"entity.note.derived",
  "inputs":[
    {"inputId":"left","value":{"entityRefValue":"entity.note.reserved"}},
    {"inputId":"right","value":{"entityRefValue":"entity.note.public"}},
  ],
  "validAt":sys.argv[2],
  "expiresAt":"2030-01-01T00:00:00Z",
}))' "$digest" "$valid_at")"
url="/zoen.action.v1.ActionService/Propose"
body="${work}/propose"
status="$(connect "$owner_token" "$url" "$propose" "$body" "$tenant_id")"
record "ActionService/Propose stampLow below join" \
  "curl POST Propose world.stampLow Authorization:Bearer <owner>" \
  "${zoend_base}${url}" "$status" "$(excerpt_file "$body")" "$(stamp)"
[[ "$status" == "200" ]] || fail "propose ${status}"
preview_hash="$(python3 -c 'import json,sys; print((json.load(open(sys.argv[1],encoding="utf-8")).get("proposal") or {}).get("previewHash") or "")' "$body")"

url="/zoen.action.v1.ActionService/Commit"
body="${work}/commit"
status="$(
  connect "$owner_token" "$url" "$(python3 -c 'import json,sys; print(json.dumps({
    "proposalId":"proposal.stamp-low",
    "operationId":"operation.stamp-low",
    "previewHash":sys.argv[1],
  }))' "$preview_hash")" "$body" "$tenant_id"
)"
record "ActionService/Commit stampLow labeled below join" \
  "curl POST Commit world.stampLow Authorization:Bearer <owner>" \
  "${zoend_base}${url}" "$status" "$(excerpt_file "$body")" "$(stamp)"
python3 - "$body" "$status" <<'PY' || fail "join write was not refused"
import json,sys
status=sys.argv[2]
doc=json.load(open(sys.argv[1],encoding="utf-8"))
text=json.dumps(doc)+" status="+status
if status=="200" and str(doc.get("status") or "").upper().find("COMMITTED")>=0 and "receipt" in doc and doc.get("receipt"):
    raise SystemExit("committed")
if "does not dominate join" not in text and "FailedPrecondition" not in text and status=="200" and "EVALUATION_ERROR" not in str(doc.get("status") or "").upper():
    if status.startswith("4") or status.startswith("5"):
        raise SystemExit(0)
    raise SystemExit("not refused: "+text[:400])
PY

mkdir -p "$(dirname "$proof")"
cp "$draft" "$proof"
printf 'wrote %s\n' "$proof"
