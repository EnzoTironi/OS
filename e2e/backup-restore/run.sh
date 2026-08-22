#!/usr/bin/env bash
set -euo pipefail

exec e2e/reliability/run.sh backup-restore
