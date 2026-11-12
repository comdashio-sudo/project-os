#!/usr/bin/env bash
# D-85b: after step 6 advanced the production branch WITHOUT the CLI (cli=false), Vercel builds production from that branch on its own (O-5). This waits until the
# production address serves that commit — /api/readyz answers 200 with "commit" equal to the pushed sha's first 12 characters (VERCEL_GIT_COMMIT_SHA) — and fails the
# run if it does not within the time limit. Nothing is rolled back on this path: rollback is manual (docs/OWNER_ACTIONS.md §16, Instant Rollback).
# usage: wait-for-commit.sh <production url> <sha> [limit seconds, default 900] [interval seconds, default 15]
set -uo pipefail
url="${1:?production url}"; sha="${2:?sha}"; limit="${3:-900}"; interval="${4:-15}"
want="${sha:0:12}"
started=$SECONDS; last="(no answer yet)"
while :; do
  body="$(curl -sS --max-time 15 -H 'Cache-Control: no-cache' "$url/api/readyz" 2>/dev/null)" && status=0 || status=$?
  commit="$(printf '%s' "$body" | jq -r '.commit // empty' 2>/dev/null)"
  ready="$(printf '%s' "$body" | jq -r '.ready // empty' 2>/dev/null)"
  if [ "$status" -eq 0 ] && [ "$commit" = "$want" ]; then
    if [ "$ready" = "true" ]; then echo "production $url serves $want and is ready ($((SECONDS - started))s)"; exit 0; fi
    last="serves $want but /api/readyz is not ready: $(printf '%s' "$body" | cut -c1-300)"
  elif [ "$status" -ne 0 ] && [ -z "$body" ]; then last="no answer from $url/api/readyz"
  else last="serves ${commit:-an unknown commit}, not $want"
  fi
  if [ $((SECONDS - started)) -ge "$limit" ]; then
    echo "::error title=Production does not serve the release::$url $last, ${limit}s after the production branch moved to $sha. The database is migrated and the branch moved; nothing was rolled back. Check the deployment in Vercel and, if production serves a broken build, roll it back by hand (Deployments, the previous production deployment, Instant Rollback: docs/OWNER_ACTIONS.md §16)."
    exit 1
  fi
  echo "waiting: $last"
  sleep "$interval"
done
