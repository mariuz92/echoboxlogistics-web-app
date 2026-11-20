#!/bin/sh
# Generates /tmp/env-config.js from the container environment.
#
# Vite inlines import.meta.env at BUILD time, which would force one image per
# environment. Instead the app reads window.__ENV__ (see src/config/env.ts),
# which this script fills in every time the container starts. Only the
# whitelisted public keys below are exposed to the browser.
#
# Executed automatically by the nginx image entrypoint (/docker-entrypoint.d).

set -eu

OUT=/tmp/env-config.js

# Escape backslashes and double quotes so values are safe inside a JS string.
escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

{
  echo "// generated at container start"
  echo "window.__ENV__ = {"
  for key in \
    VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY \
    VITE_GOOGLE_MAPS_API_KEY \
    VITE_PUBLIC_BOOKING_SLUG \
    VITE_ENABLE_GOOGLE_AUTH \
    VITE_MARKETING_URL
  do
    eval "value=\${$key:-}"
    if [ -n "$value" ]; then
      printf '  "%s": "%s",\n' "$key" "$(escape "$value")"
    fi
  done
  echo "};"
} > "$OUT"

if [ -z "${VITE_SUPABASE_URL:-}" ] || [ -z "${VITE_SUPABASE_ANON_KEY:-}" ]; then
  echo "40-env-config.sh: WARNING - VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set; the app will show a configuration error." >&2
fi

echo "40-env-config.sh: wrote $OUT"
