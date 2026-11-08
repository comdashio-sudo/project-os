#!/usr/bin/env bash
# Reads the changed paths (one per line) on stdin and prints `deploy=true` or `deploy=false`.
# false ONLY when there is at least one path and every path is documentation or workflow (docs/, qa/, .github/, any .md).
# Never `cmd | grep -q` under pipefail here: grep -q exits at the first match, the writer gets EPIPE, pipefail turns that
# into a failed pipeline and `!` flips it, so a large CODE diff read as "nothing to ship" (D-57, run 42491210830: 209 files,
# "grep: write error: Broken pipe", deploy=false, migration 0016 never applied). grep -v below reads all of its input.
set -euo pipefail
changed="$(cat)"
# grep's exit status is read, never swallowed (D-69): 0 = code paths found, 1 = none (only docs/workflows, normal), 2 or more = grep
# itself failed, and then nothing is decided: exit 1 (fail closed) instead of reading an error as "nothing to ship". A here-string,
# not a pipe, so the status is grep's alone.
rc=0
code="$(grep -vE '^(docs/|qa/|\.github/)|\.md$|^$' <<<"$changed")" || rc=$?
if [ "$rc" -gt 1 ]; then echo "::error::release-scope: grep failed (exit $rc); refusing to decide what ships" >&2; exit 1; fi
if [ -n "$changed" ] && [ -z "$code" ]; then echo "deploy=false"; else echo "deploy=true"; fi
