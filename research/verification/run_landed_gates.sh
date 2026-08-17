#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
RECEIPT="${RECEIPT:-/tmp/os-landed-gates-receipt.tsv}"
mkdir -p "$(dirname "$RECEIPT")"
printf 'job\tstep\tstatus\tdetail\n' > "$RECEIPT"

pass=0
fail=0
blocked=0

record() {
	local job="$1" step="$2" status="$3" detail="${4:-}"
	detail="$(printf '%s' "$detail" | tr '\t\n\r' '   ')"
	printf '%s\t%s\t%s\t%s\n' "$job" "$step" "$status" "$detail" >> "$RECEIPT"
	case "$status" in
		pass) pass=$((pass + 1)) ;;
		fail) fail=$((fail + 1)) ;;
		blocked) blocked=$((blocked + 1)) ;;
	esac
	printf '[%s] %s/%s: %s\n' "$status" "$job" "$step" "$detail"
}

run_step() {
	local job="$1" step="$2"
	shift 2
	local log rc
	log="$(mktemp)"
	set +e
	"$@" >"$log" 2>&1
	rc=$?
	set -e
	if [[ "$rc" -eq 0 ]]; then
		record "$job" "$step" pass "ok"
		rm -f "$log"
		return 0
	fi
	record "$job" "$step" fail "exit ${rc} tail=$(tail -n 20 "$log" | tr '\n' '|')"
	rm -f "$log"
	return 1
}

json_ok() {
	python3 -m json.tool "$1" >/dev/null
}

postgres_ready() {
	if [[ -z "${STORAGE39_DSN:-}" ]]; then
		return 1
	fi
	python3 - <<'PY'
import os, sys
try:
    import psycopg
    with psycopg.connect(os.environ["STORAGE39_DSN"], connect_timeout=3) as conn:
        conn.execute("SELECT 1")
except Exception:
    sys.exit(1)
PY
}

run_step ingest check python3 research/runtime/ingest/check_research.py || true
run_step ingest index json_ok research/index/issue-0045-ingest-entity-resolution.json || true

run_step transactions check python3 research/runtime/transactions/check_research.py || true
run_step transactions tests bash -lc 'cd research/runtime/transactions && python3 -m unittest -v test_reference_model.py' || true
run_step transactions index json_ok research/index/issue-0040-commit-semantics.json || true

run_step effects check python3 research/runtime/effects/check_research.py || true
run_step effects tests bash -lc 'cd research/runtime/effects && python3 -m unittest -v test_reference_model.py' || true
run_step effects index json_ok research/index/issue-0041-external-effects.json || true

run_step authorization check python3 research/runtime/authorization/check_research.py || true
run_step authorization tests bash -lc 'cd research/runtime/authorization && python3 -m unittest discover -p "test_*.py" -v' || true
run_step authorization index json_ok research/index/issue-0042-authorization-delegation.json || true
run_step authorization review-index json_ok research/index/issue-0042-authorization-delegation-review.json || true

run_step orchestration check python3 research/runtime/orchestration/check_research.py || true
run_step orchestration tests python3 -m unittest discover -s research/runtime/orchestration -p 'test_reference_model.py' -v || true
run_step orchestration index json_ok research/index/issue-0043-durable-orchestration.json || true

if [[ -f research/index/issue-0039-storage-models.json ]]; then
	run_step storage index json_ok research/index/issue-0039-storage-models.json || true
fi
if [[ -f research/runtime/storage/check_research.py ]]; then
	run_step storage check python3 research/runtime/storage/check_research.py || true
fi

run_step graph tests python3 -m unittest -v research/graph/test_graph.py || true
run_step graph build bash research/graph/build_wave_a.sh || true
if [[ -f /tmp/challenged.jsonl ]]; then rm -f /tmp/challenged.jsonl; fi
if python3 research/graph/query.py reviews challenged >/tmp/challenged.jsonl && test -s /tmp/challenged.jsonl; then
	record graph smoke pass "challenged query nonempty"
else
	record graph smoke fail "challenged query empty or failed"
fi
run_step graph schema json_ok research/graph/schema.json || true
run_step graph generated json_ok research/graph/generated/wave-a-graph.json || true

run_step verification check python3 research/verification/check_research.py || true
run_step verification registry python3 research/verification/scenario_registry.py --check || true
run_step verification registry-json bash -lc 'python3 research/verification/scenario_registry.py --json > /tmp/cross-ontology-registry.json && python3 -m json.tool /tmp/cross-ontology-registry.json >/dev/null' || true
run_step verification index json_ok research/index/issue-0046-cross-ontology-verification.json || true
run_step verification tests python3 -m unittest discover -s research/verification -p 'test_*.py' -v || true
run_step verification modelcheck python3 research/verification/modelcheck.py || true
run_step verification smt python3 research/verification/formal/authorization_z3.py || true
run_step verification reviewed-tx python3 research/runtime/transactions/test_reference_model.py || true
run_step verification reviewed-effects python3 research/runtime/effects/test_reference_model.py || true
run_step verification reviewed-orch python3 research/runtime/orchestration/test_reference_model.py || true

run_step metamodel check python3 research/synthesis/metamodel/check_research.py || true
run_step metamodel candidate json_ok research/synthesis/metamodel/candidate-metamodel.json || true
run_step metamodel index json_ok research/index/issue-0070-metamodel-synthesis.json || true
run_step metamodel tests python3 -m unittest discover -s research/synthesis/metamodel -p 'test_*.py' -v || true

run_step rulebinding check python3 research/kill/rulebinding-v2/check_research.py || true
run_step rulebinding tests python3 -m unittest discover -s research/kill/rulebinding-v2 -p 'test_*.py' -v || true

run_step occurrence check python3 research/kill/occurrence-no-bypass/check_research.py || true
run_step occurrence tests python3 -m unittest discover -s research/kill/occurrence-no-bypass -p 'test_*.py' -v || true

run_step relation check python3 research/experiments/relation-unification/check_research.py || true
run_step relation review python3 research/experiments/relation-unification/check_review.py || true
run_step relation tests python3 -m unittest discover -s research/experiments/relation-unification -p 'test_*.py' -v || true
if python3 research/experiments/relation-unification/render_samples.py > /tmp/relation-samples.md \
	&& grep -q 'property name: str' /tmp/relation-samples.md \
	&& grep -q 'link customer: Party' /tmp/relation-samples.md \
	&& grep -q 'r:line-price' /tmp/relation-samples.md \
	&& grep -q 'table available_quantity' /tmp/relation-samples.md; then
	record relation samples pass "render_samples markers present"
else
	record relation samples fail "render_samples missing expected markers"
fi

if postgres_ready; then
	run_step postgres storage python3 research/runtime/storage/experiments/postgres18/test_storage_contract.py || true
	run_step postgres occurrence python3 research/kill/occurrence-no-bypass/experiments/postgres18/test_no_bypass.py || true
else
	record postgres storage blocked "STORAGE39_DSN unset or unreachable"
	record postgres occurrence blocked "STORAGE39_DSN unset or unreachable"
fi

printf '\nreceipt %s\npass=%s fail=%s blocked=%s\n' "$RECEIPT" "$pass" "$fail" "$blocked"
if [[ "$fail" -gt 0 ]]; then
	exit 1
fi
exit 0
