# syntax=docker/dockerfile:1.7

# =============================================================================
# EchoBox Logistics web app
#
#   docker build -t echoboxlogistics-web-app .
#   docker run --rm -p 8080:8080 \
#     -e VITE_SUPABASE_URL=https://<project>.supabase.co \
#     -e VITE_SUPABASE_ANON_KEY=<anon key> \
#     echoboxlogistics-web-app
#
# The image contains no secrets and no environment-specific values: the
# configuration is injected when the container starts (see
# docker/40-env-config.sh), so the same image can be promoted from staging to
# production.
# =============================================================================

ARG NODE_VERSION=24
ARG NGINX_VERSION=1.29

# ---- 1. install dependencies (cached until package*.json changes) ----------
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

# ---- 2. type-check and build -------------------------------------------------
FROM deps AS build
WORKDIR /app
COPY . .
ARG APP_KIND=web
RUN case "$APP_KIND" in \
      web) npm run build && mv dist /app/site ;; \
      console) npm run build:console && mv dist-console /app/site ;; \
      *) echo "Unsupported APP_KIND" >&2; exit 2 ;; \
    esac

# ---- 3. runtime: unprivileged nginx serving the static bundle ----------------
FROM nginxinc/nginx-unprivileged:${NGINX_VERSION}-alpine AS runtime

LABEL org.opencontainers.image.title="echoboxlogistics-web-app" \
      org.opencontainers.image.description="EchoBox Logistics web app (static SPA served by nginx)" \
      org.opencontainers.image.source="https://github.com/mariuz92/echoboxlogistics-web-app"

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/security-headers.inc /etc/nginx/security-headers.inc
COPY --chmod=0755 docker/40-env-config.sh /docker-entrypoint.d/40-env-config.sh
COPY --from=build /app/site /usr/share/nginx/html

# Listens on 8080 as the non-root "nginx" user.
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
