#!/usr/bin/env bash
# The public Supabase config the release reads (D-35, D-69). Usage: bash scripts/ci/public-config-check.sh [config/supabase.public.json]
# Prints `has_key=true` or `has_key=false` on stdout (for $GITHUB_OUTPUT) and exits 0, or prints ::error and exits 1.
#   url            required, https://<ref>.supabase.co
#   publishableKey optional: "" is accepted (has_key=false: the release check then runs without the sign-in step, D-69);
#                  a non-empty key must be an sb_publishable_ key. Anything else (sb_secret_, service_role, any JWT) is refused.
# Never prints the key or any part of it.
set -euo pipefail
cfg="${1:-config/supabase.public.json}"
[ -f "$cfg" ] || { echo "::error::$cfg is missing" >&2; exit 1; }
url="$(jq -r '.url // ""' "$cfg")" || { echo "::error::$cfg is not valid JSON" >&2; exit 1; }
key="$(jq -r '.publishableKey // ""' "$cfg")"
[[ "$url" =~ ^https://[a-z0-9]+\.supabase\.co$ ]] || { echo "::error::$cfg has no https://<ref>.supabase.co url" >&2; exit 1; }
case "$key" in
  "") echo "has_key=false" ;;
  sb_secret_*|*service_role*|eyJ*) echo "::error::$cfg publishableKey holds a SECRET or a JWT; only the public sb_publishable_ key belongs there. Rotate that key in Supabase now." >&2; exit 1 ;;
  *)
    [[ "$key" =~ ^sb_publishable_[A-Za-z0-9_-]{10,}$ ]] || { echo "::error::$cfg publishableKey is not an sb_publishable_ key; only the public key belongs there (never sb_secret_ or service_role)" >&2; exit 1; }
    echo "has_key=true" ;;
esac
