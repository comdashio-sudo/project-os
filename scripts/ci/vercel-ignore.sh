#!/usr/bin/env bash
# Vercel "Ignored Build Step" (vercel.json "ignoreCommand"). Exit 0 = SKIP this deployment, exit 1 = build it (Vercel's documented meaning).
#
# A push that changes only documentation or workflow files cannot change what runs in production, so it does not need a deployment (every deployment counts against
# the plan's daily limit). Skipped only when EVERY file changed since the last successful deployment is under docs/, qa/ or .github/, or is a Markdown file.
# At any doubt it builds: no previous deployment, a commit this clone does not have, a diff that cannot be computed, an empty diff. Nothing here can hide a code change.
set -u

previous="${VERCEL_GIT_PREVIOUS_SHA:-}"
current="${VERCEL_GIT_COMMIT_SHA:-HEAD}"

build() { echo "vercel-ignore: build ($1)"; exit 1; }
skip()  { echo "vercel-ignore: skip ($1)"; exit 0; }

[ -n "$previous" ] || build "no previous successful deployment"
git cat-file -e "${previous}^{commit}" 2>/dev/null || build "the previous deployment's commit is not in this clone"
git cat-file -e "${current}^{commit}" 2>/dev/null || build "the current commit cannot be read"

changed="$(git diff --name-only "$previous" "$current" 2>/dev/null)" || build "the diff cannot be computed"
[ -n "$changed" ] || build "no file differs from the last deployment"

while IFS= read -r file; do
  case "$file" in
    docs/*|qa/*|.github/*|*.md) ;;
    *) build "a deployable file changed: $file" ;;
  esac
done <<< "$changed"

skip "only documentation or workflow files changed ($(printf '%s\n' "$changed" | wc -l | tr -d ' ') file(s))"
