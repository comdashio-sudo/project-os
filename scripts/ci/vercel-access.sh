#!/usr/bin/env bash
# D-85: may this release deploy production itself with the Vercel CLI (step 4b of migrate-production.yml)? Writes cli=true or cli=false to the file in $1 ($GITHUB_OUTPUT).
#
# Since O-5 the Vercel project builds production from the `production` branch on its own, and step 6 moves that branch only after the migrations (2), verify-db-security
# (2b) and the release check (3) passed. So when VERCEL_TOKEN is missing, or cannot use the project's team (401/403: run 42738392972), the CLI path is skipped with a
# warning and the release goes on: Vercel deploys the branch step 6 moves. Any OTHER failure (network, a Vercel outage, an unexpected answer) still stops the run before
# anything is migrated, as before. The token is read by the CLI from the environment; this script never prints it or passes it on a command line.
set -uo pipefail
out="${1:?usage: vercel-access.sh <output file>}"
# the answers that mean "this token may not do this", not "something is broken"
denied='(^|[^0-9])40[13]([^0-9]|$)|forbidden|unauthori[sz]ed|not authorized|team_unauthorized|Could not retrieve Project Settings|token is not valid|invalid token|You do not have access'
skip() {
  echo "::warning title=Production deployed by Vercel from the production branch::$1 Step 4b (the CLI deployment) is skipped; the migrations, the release check and step 6 run as usual, and Vercel builds production from the branch step 6 moves. To deploy with the CLI again, give VERCEL_TOKEN access to team ${VERCEL_ORG_ID:-?} (docs/OWNER_ACTIONS.md §16)."
  echo "cli=false" >> "$out"
  exit 0
}
stop() {
  echo "::error title=Vercel unavailable::$1, so nothing was migrated or deployed. The CLI said:"
  printf '%s\n' "$2" | grep -v '^[[:space:]]*$' | tail -n 5 | cut -c1-300
  exit 1
}
[ -n "${VERCEL_TOKEN:-}" ] || skip "The repository secret VERCEL_TOKEN is not set."
if ! who="$(vercel whoami 2>&1)"; then
  printf '%s\n' "$who" | grep -Eiq "$denied" && skip "VERCEL_TOKEN was refused (vercel whoami)."
  stop "vercel whoami failed for another reason" "$who"
fi
echo "Vercel token accepted (vercel whoami)"
# whoami only proves the token is alive; 4b needs it to READ the project (run 42606597331 passed whoami and failed in 4b). The very command 4b starts with is tried here,
# in a throw-away folder deleted on every path, before anything is migrated.
probe="${RUNNER_TEMP:-/tmp}/vercel-project-probe"
mkdir -p "$probe"
if ! pulled="$(vercel pull --yes --environment=production --cwd "$probe" 2>&1)"; then
  rm -rf "$probe"
  printf '%s\n' "$pulled" | grep -Eiq "$denied" && skip "VERCEL_TOKEN cannot read project ${VERCEL_PROJECT_ID:-?} of team ${VERCEL_ORG_ID:-?} (vercel pull answered 401/403)."
  stop "vercel pull for project ${VERCEL_PROJECT_ID:-?} failed for another reason" "$pulled"
fi
rm -rf "$probe"
echo "Vercel project ${VERCEL_PROJECT_ID:-?} readable with this token (vercel pull, discarded): production is deployed with the CLI in step 4b"
echo "cli=true" >> "$out"
