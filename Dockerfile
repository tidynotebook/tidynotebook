# syntax=docker/dockerfile:1
# Pinned Node.js base image by SHA-256 digest
FROM node:26-bookworm-slim@sha256:662933cf47f013bc8e4beb31a6116448427a82057ba7c42c97e4c5ba766504c2 AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g --allow-scripts=pnpm pnpm@12.3.4

FROM base AS builder
WORKDIR /app

# Copy dependency manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .node-version .npmrc ./
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/api-contract/package.json ./packages/api-contract/
COPY packages/core/package.json ./packages/core/
COPY packages/editor/package.json ./packages/editor/
COPY packages/markdown/package.json ./packages/markdown/
COPY packages/storage-browser/package.json ./packages/storage-browser/
COPY packages/storage-server/package.json ./packages/storage-server/
COPY packages/sync/package.json ./packages/sync/
COPY packages/ui/package.json ./packages/ui/
COPY tools/sdk-codegen/package.json ./tools/sdk-codegen/
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/

# Install all dependencies including build tooling
RUN pnpm install --frozen-lockfile

# Copy full application source
COPY tsconfig.base.json tsconfig.json ./
COPY packages ./packages
COPY tools ./tools
COPY apps ./apps

# Build contracts, libraries, web client, and server
RUN pnpm build
RUN pnpm --filter @notesapp/server deploy --prod /prod/server

FROM node:26-bookworm-slim@sha256:662933cf47f013bc8e4beb31a6116448427a82057ba7c42c97e4c5ba766504c2 AS runner
# Create non-root system group and user
RUN groupadd -g 10001 notesapp && \
    useradd -u 10001 -g notesapp -m -d /home/notesapp -s /bin/bash notesapp

# Create attachment storage directory
RUN mkdir -p /var/lib/notesapp && chown -R notesapp:notesapp /var/lib/notesapp

WORKDIR /app

# Copy production server dependencies and built web assets only.
COPY --chown=notesapp:notesapp --from=builder /prod/server /app/server
COPY --chown=notesapp:notesapp --from=builder /app/apps/web/dist /app/web/dist

# Migrate-then-serve entry point and the readiness health check.
COPY --chown=notesapp:notesapp --chmod=755 docker/entrypoint.sh /app/entrypoint.sh
COPY --chown=notesapp:notesapp docker/healthcheck.mjs /app/healthcheck.mjs

USER notesapp:notesapp

ENV NODE_ENV=production
ENV NOTESAPP_HOST=0.0.0.0
ENV NOTESAPP_PORT=3000
ENV NOTESAPP_STORAGE_ROOT=/var/lib/notesapp

EXPOSE 3000

CMD ["/app/entrypoint.sh"]
