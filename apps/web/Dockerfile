# ─────────────────────────────────────────────────────────────────────────────
# apps/web — the Next.js admin portal (standalone output).
#
# Build CONTEXT is the repo root (the lockfile and workspace manifest live there):
#
#   docker build -f apps/web/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com/api -t greynote-web .
#
# NEXT_PUBLIC_* values are inlined into the browser bundle at BUILD time, so they are build args,
# not runtime env — changing the API URL means rebuilding the image.
# ─────────────────────────────────────────────────────────────────────────────

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.18.0 --activate
WORKDIR /app


# ── deps ─────────────────────────────────────────────────────────────────────
# Every workspace manifest, not just this app's: --frozen-lockfile validates the whole workspace.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json           apps/api/
COPY apps/fieldApp/package.json      apps/fieldApp/
COPY apps/web/package.json           apps/web/
COPY packages/config/package.json    packages/config/
COPY packages/contracts/package.json packages/contracts/
RUN pnpm install --frozen-lockfile


# ── build ────────────────────────────────────────────────────────────────────
FROM deps AS build
ARG NEXT_PUBLIC_API_BASE_URL
# Fail the build rather than ship a bundle that points at localhost.
RUN test -n "$NEXT_PUBLIC_API_BASE_URL" || (echo "NEXT_PUBLIC_API_BASE_URL build arg is required" && exit 1)
# Optional: a browser Maps JavaScript API key (referrer-restricted). Empty => the route map shows a fallback.
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ENV NEXT_TELEMETRY_DISABLED=1

COPY packages/config    packages/config
COPY packages/contracts packages/contracts
COPY apps/web           apps/web
RUN pnpm --filter @greynote/web build


# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3001

COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static     ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public           ./apps/web/public

USER node
EXPOSE 3001

# Exec form so node is PID 1 and receives SIGTERM directly.
CMD ["node", "apps/web/server.js"]
