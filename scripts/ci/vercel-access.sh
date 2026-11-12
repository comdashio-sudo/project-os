#!/usr/bin/env bash
# D-85: may this release deploy production itself with the Vercel CLI (step 4b of migrate-production.yml)? Writes cli=true or cli=false to the file in $1 ($GITHUB_OUTPUT).
#
# Since O-5 the Vercel project builds production from the `production` branch on its own, and step 6 moves that branch only after the migrations (2), verify-db-security
# (2b) and the release check (3) passed. So when VERCEL_TOKEN is missing, or Vercel answers 401/403 for the project (run 42738392972), the CLI path is skipped with a
# warning and the release goes on; step 6b then waits until the production address serves the pushed commit. Any OTHER answer (404 for a wrong project, 429, 5xx,
# a timeout) stops the run before anything is migrated.
# D-85b (review of #249): the decision reads the HTTP STATUS of GET /v9/projects/{id} (curl -w '%{http_code}'), not the CLI's text: a 503 whose body says "403", a
# 500 saying "401", a ".403" in a timeout or a 429 "You do not have access" were read as "no access" by a text pattern. The token goes to curl in a config file
# (mode 600, deleted at once), never on a command line, and is scrubbed from anything printed.
set -uo pipefail
out="${1:?usage: vercel-access.sh <output file>}"
api="${VERCEL_API_URL:-https://api.vercel.com}"
# prints the last lines of a command's output with the token replaced by *** (D-85b: before anything reaches the log)
scrub() {
  local text="$1"
  [ -n "${VERCEL_TOKEN:-}" ] && text="${text//"$VERCEL_TOKEN"/***}"
  printf '%s\n' "$text" | sed '/^[[:space:]]*$/d' | tail -n 5 | cut -c1-300
}
skip() {
  echo "::warning title=Production deployed by Vercel from the production branch::$1 Step 4b (the CLI deployment) is skipped; the migrations, the release check and step 6 run as usual, Vercel builds production from the branch step 6 moves, and step 6b waits until production serves it. To deploy with the CLI again, give VERCEL_TOKEN access to team ${VERCEL_ORG_ID:-?} (docs/OWNER_ACTIONS.md §16)."
  echo "cli=false" >> "$out"
  exit 0
}
stop() {
  echo "::error title=Vercel unavailable::$1, so nothing was migrated or deployed."
  [ -n "${2:-}" ] && scrub "$2"
  exit 1
}
[ -n "${VERCEL_TOKEN:-}" ] || skip "The repository secret VERCEL_TOKEN is not set."
cfg="$(mktemp)"; chmod 600 "$cfg"
cat > "$cfg" <<CFG
header = "Authorization: Bearer ${VERCEL_TOKEN}"
CFG
status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 -K "$cfg" "$api/v9/projects/${VERCEL_PROJECT_ID:-}?teamId=${VERCEL_ORG_ID:-}" 2>/dev/null)" || status="000"
rm -f "$cfg"
case "$status" in
  200) ;;
  401|403) skip "Vercel answered $status for project ${VERCEL_PROJECT_ID:-?} of team ${VERCEL_ORG_ID:-?} with this VERCEL_TOKEN." ;;
  000) stop "Vercel did not answer (timeout or network) for project ${VERCEL_PROJECT_ID:-?}" ;;
  *) stop "Vercel answered HTTP $status for project ${VERCEL_PROJECT_ID:-?} of team ${VERCEL_ORG_ID:-?} (404 is a wrong project or team, 429 a rate limit, 5xx an outage)" ;;
esac
echo "Vercel project ${VERCEL_PROJECT_ID:-?} readable with this token (HTTP 200)"
# the very command 4b starts with, in a throw-away folder deleted on every path (run 42606597331: the API can answer while the CLI cannot pull)
probe="${RUNNER_TEMP:-/tmp}/vercel-project-probe"
mkdir -p "$probe"
if ! pulled="$(vercel pull --yes --environment=production --cwd "$probe" 2>&1)"; then
  rm -rf "$probe"
  stop "vercel pull for project ${VERCEL_PROJECT_ID:-?} failed although the API answered 200" "$pulled"
fi
rm -rf "$probe"
echo "vercel pull works (discarded): production is deployed with the CLI in step 4b"
echo "cli=true" >> "$out"
