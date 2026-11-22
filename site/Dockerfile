# =============================================================================
# AubeSonore Backend — built by CI (site.yml, job publish), pulled by the server
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: install all workspace deps
# -----------------------------------------------------------------------------
FROM node:22.23.4-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d AS deps
RUN corepack enable pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json ./apps/backend/
COPY packages/shared-types/package.json ./packages/shared-types/

RUN pnpm install --frozen-lockfile

# -----------------------------------------------------------------------------
# Stage 2: build shared packages
# -----------------------------------------------------------------------------
FROM deps AS builder

COPY packages/shared-types ./packages/shared-types
COPY apps/backend ./apps/backend
COPY tsconfig.base.json ./

RUN pnpm --filter @aubesonore/shared-types build

# -----------------------------------------------------------------------------
# Stage 3: minimal runtime
# -----------------------------------------------------------------------------
FROM oven/bun:1.4.2-slim@sha256:cb3bbbb08e13a4a2ff400f24c7a2a1d5efa83f6ef8544d52d95a519631e2fc61 AS runner

RUN groupadd --system --gid 1001 bunjs && \
    useradd --system --uid 1001 --gid bunjs bunjs

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/backend ./apps/backend

RUN chown -R bunjs:bunjs /app
# The cover store's mount point (compose.yaml, cover_store), the backend's to write.
RUN mkdir -p /srv/cover-store && chown bunjs:bunjs /srv/cover-store

USER bunjs

WORKDIR /app/apps/backend

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# The commit CI builds from (site.yml, IMAGE_BUILD_ARGS), which /health reports; empty elsewhere,
# where the backend says `local`. Last, so a new commit invalidates no layer above.
ARG GIT_SHA=""
ENV GIT_SHA=$GIT_SHA

CMD ["bun", "run", "src/index.ts"]
