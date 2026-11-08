#!/usr/bin/env bash
# Reads the changed paths (one per line) on stdin and prints `deploy=true` or `deploy=false`.
# false ONLY when there is at least one path and every path is documentation or workflow (docs/, qa/, .github/, any .md).
# Never `cmd | grep -q` under pipefail here: grep -q exits at the first match, the writer gets EPIPE, pipefail turns that
# into a failed pipeline and `!` flips it, so a large CODE diff read as "nothing to ship" (D-57, run 42491210830: 209 files,
# "grep: write error: Broken pipe", deploy=false, migration 0016 never applied). grep -v below reads all of its input.
set -euo pipefail
changed="$(cat)"
code="$(printf '%s\n' "$changed" | grep -vE '^(docs/|qa/|\.github/)|\.md$' | grep -v '^$' || true)"
if [ -n "$changed" ] && [ -z "$code" ]; then echo "deploy=false"; else echo "deploy=true"; fi
