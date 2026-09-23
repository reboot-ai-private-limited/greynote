# ─────────────────────────────────────────────────────────────────────────────
# apps/api — the Express API.
#
# The build CONTEXT is the repo root, because the pnpm lockfile and workspace manifest live
# there and a frozen install is impossible without them. The resulting IMAGE contains only
# dist/ plus production dependencies — no other app's code, even once apps/web and apps/mobile
# exist alongside this one.
#
#   docker build -f apps/api/Dockerfile -t greynote-api .
# ─────────────────────────────────────────────────────────────────────────────

FROM node:22-alpine AS base
# Pinned to `packageManager` in the root package.json. An unpinned corepack would resolve a
# different pnpm on the deploy host than the lockfile was written by.
RUN corepack enable && corepack prepare pnpm@11.18.0 --activate
WORKDIR /app


# ── deps ─────────────────────────────────────────────────────────────────────
# Manifests only, copied apart from the source so editing a .ts file does not invalidate the
# install layer. Every workspace manifest, not just this app's: --frozen-lockfile validates the
# whole workspace and fails if a package named in the lockfile is missing.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json           apps/api/
COPY packages/config/package.json    packages/config/
COPY packages/contracts/package.json packages/contracts/
RUN pnpm install --frozen-lockfile


# ── build ────────────────────────────────────────────────────────────────────
FROM deps AS build
# packages/contracts is SOURCE-only (exports: "./src/index.ts") — nothing prebuilt to copy, and
# omitting it fails the build on the first @greynote/contracts import.
COPY packages/config    packages/config
COPY packages/contracts packages/contracts
COPY apps/api/tsconfig.json apps/api/.dependency-cruiser.cjs apps/api/esbuild.config.mjs apps/api/
COPY apps/api/src apps/api/src

# `build` is `tsc --noEmit && esbuild …`, so a type error fails the image rather than shipping.
RUN pnpm --filter @greynote/api build

# A production-only, real (non-symlinked) node_modules tree that can be copied into a clean
# stage. Needed because third-party runtime deps (express, mongoose, …) are left external —
# esbuild.config.mjs explains why. The @greynote/* workspace packages are bundled INTO dist/, so
# they need no entry here.
RUN pnpm --filter @greynote/api deploy --prod --legacy /prod/api


# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Ownership set on copy rather than a later `chown -R`, which would duplicate every file into a
# second layer.
COPY --from=build --chown=node:node /prod/api/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api/dist     ./dist

# Never root. Nothing here writes to disk — logs go to stdout for the container runtime.
USER node
EXPOSE 3000

# Exec form, so node is PID 1 and receives SIGTERM directly. server.ts installs its own handler
# and drains in-flight requests within SHUTDOWN_TIMEOUT_MS; a shell wrapper would swallow the
# signal and every deploy would cut live responses mid-flight.
CMD ["node", "dist/server.js"]
