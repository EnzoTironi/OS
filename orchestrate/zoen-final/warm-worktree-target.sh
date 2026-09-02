#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: warm-worktree-target.sh <source-target> <worktree>" >&2
  exit 2
fi

source_target=$1
worktree=$2
destination_target="${worktree}/target"

if [[ ! -d "$source_target" ]]; then
  echo "source target does not exist: ${source_target}" >&2
  exit 1
fi
if [[ ! -d "$worktree" ]]; then
  echo "worktree does not exist: ${worktree}" >&2
  exit 1
fi
if [[ -e "$destination_target" ]]; then
  echo "destination target already exists: ${destination_target}" >&2
  exit 1
fi


if [[ "$(uname)" == "Darwin" ]]; then
  cp -a "$source_target" "$destination_target"
else
  cp -a --reflink=auto "$source_target" "$destination_target"
fi

du -sh "$destination_target"
