#!/usr/bin/env bash
# Starts the built image and checks the things that matter in production:
# health probe, runtime configuration injection, SPA fallback, caching and security headers,
# non-root user, read-only filesystem.
#
#   docker build -t echoboxlogistics-web-app .
#   ./scripts/docker-smoke-test.sh [image]            # default image: echoboxlogistics-web-app:latest
#
# Port 18080 on 127.0.0.1 is used (override with SMOKE_PORT).

set -euo pipefail

# Git Bash on Windows rewrites arguments such as /tmp into Windows paths; no effect on Linux/macOS.
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL="*"

IMAGE="${1:-echoboxlogistics-web-app:latest}"
PORT="${SMOKE_PORT:-18080}"
NAME="echobox-smoke-$$"
BASE="http://127.0.0.1:${PORT}"

cleanup() {
  docker logs "$NAME" 2>&1 | tail -n 20 || true
  docker rm -f "$NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
ok()   { echo "ok:   $*"; }

docker run -d --name "$NAME" -p "127.0.0.1:${PORT}:8080" \
  --read-only --tmpfs /tmp --tmpfs /var/cache/nginx \
  --cap-drop ALL --security-opt no-new-privileges:true \
  -e VITE_SUPABASE_URL="https://example-project.supabase.co" \
  -e VITE_SUPABASE_ANON_KEY='anon"key\with-special-chars' \
  -e VITE_APP_MODE=app \
  "$IMAGE" >/dev/null

for _ in $(seq 1 30); do
  if curl -fsS "$BASE/healthz" >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS "$BASE/healthz" | grep -q '^ok' || fail "/healthz did not answer 'ok'"
ok "/healthz"

# runtime configuration is injected, and values are escaped safely
CONFIG="$(curl -fsS "$BASE/env-config.js")"
grep -q '"VITE_SUPABASE_URL": "https://example-project.supabase.co"' <<<"$CONFIG" || fail "env-config.js misses VITE_SUPABASE_URL"
grep -q '"VITE_SUPABASE_ANON_KEY": "anon\\"key\\\\with-special-chars"' <<<"$CONFIG" || fail "env-config.js did not escape the anon key"
if grep -q "VITE_GOOGLE_MAPS_API_KEY" <<<"$CONFIG"; then fail "unset variables must not appear in env-config.js"; fi
ok "runtime config injected and escaped"

# the config is never cached; the entry point is revalidated; hashed assets are immutable
curl -sI "$BASE/env-config.js" | grep -qi '^cache-control: no-store' || fail "env-config.js must be no-store"
curl -sI "$BASE/" | grep -qi '^cache-control: no-cache' || fail "index.html must be no-cache"
ASSET="$(curl -fsS "$BASE/" | grep -o '/assets/[^"]*\.js' | head -n 1)"
[ -n "$ASSET" ] || fail "no JS asset referenced by index.html"
curl -sI "$BASE$ASSET" | grep -qi '^cache-control: public, max-age=31536000, immutable' || fail "assets must be immutable"
ok "cache headers"

# client-side routes fall back to index.html; missing assets are real 404s
[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/dashboard")" = "200" ] || fail "SPA fallback broken"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/assets/does-not-exist.js")" = "404" ] || fail "missing asset must be 404"
ok "routing"

# security headers on the entry point
HEADERS="$(curl -sI "$BASE/")"
for header in 'x-frame-options: DENY' 'x-content-type-options: nosniff' 'referrer-policy:' 'permissions-policy:' 'content-security-policy: frame-ancestors'; do
  grep -qi "^${header}" <<<"$HEADERS" || fail "missing header: ${header}"
done
ok "security headers"

# hardening
[ "$(docker exec "$NAME" id -u)" != "0" ] || fail "container runs as root"
if docker exec "$NAME" sh -c 'touch /usr/share/nginx/html/x' 2>/dev/null; then fail "filesystem is writable"; fi
ok "non-root, read-only filesystem"

echo "All smoke tests passed for $IMAGE"
