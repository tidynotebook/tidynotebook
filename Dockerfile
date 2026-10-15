# syntax=docker/dockerfile:1
# The Node release of .node-version, pinned by tag and SHA-256 digest
FROM node:26.10.0-bookworm-slim@sha256:662933cf47f013bc8e4beb31a6116448427a82057ba7c42c97e4c5ba766504c2 AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g --allow-scripts=pnpm pnpm@12.3.4

FROM base AS builder
WORKDIR /app

# Copy every workspace manifest that the context keeps, so the frozen install
# compares each one with the lockfile. tools/check-versions.mjs holds the list.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .node-version .npmrc .pnpmfile.cjs ./
COPY LICENSE README.md Dockerfile ./
COPY docker ./docker
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/api-contract/package.json ./packages/api-contract/
COPY packages/core/package.json ./packages/core/
COPY packages/editor/package.json ./packages/editor/
COPY packages/logging/package.json ./packages/logging/
COPY packages/markdown/package.json ./packages/markdown/
COPY packages/note-document/package.json ./packages/note-document/
COPY packages/storage-browser/package.json ./packages/storage-browser/
COPY packages/storage-server/package.json ./packages/storage-server/
COPY packages/sync/package.json ./packages/sync/
COPY packages/ui/package.json ./packages/ui/
COPY tools/sdk-codegen/package.json ./tools/sdk-codegen/
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
# The install applies the patches that pnpm-workspace.yaml names
COPY patches ./patches

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
RUN node tools/runtime-dependencies.mjs /prod/server
RUN node tools/distribution-notices.mjs /prod/server /prod/licenses
RUN node tools/distribution-notices.mjs /usr/local/lib/node_modules/npm /prod/licenses/base-npm
RUN node tools/native-sources.mjs /prod/licenses/native-source tools/native-source-cache/native
RUN node tools/native-sources.mjs /prod/licenses/base-source tools/native-source-cache/base tools/base-sources.json
RUN cp tools/base-packages.json /prod/licenses/base-source/original-binaries.json
RUN node tools/native-sources.mjs /prod/licenses/runner-source tools/native-source-cache/runner tools/runner-sources.json
# The archive holds the preferred first-party source and the exact build inputs.
RUN tar --exclude='node_modules' --exclude='dist' --exclude='*.tsbuildinfo' \
    --exclude='tools/native-source-cache' \
    -czf /prod/licenses/core-source.tar.gz LICENSE README.md Dockerfile docker \
    package.json pnpm-lock.yaml pnpm-workspace.yaml .node-version .npmrc .pnpmfile.cjs \
    tsconfig.json tsconfig.base.json patches packages apps/server apps/web tools

FROM node:26.10.0-bookworm-slim@sha256:662933cf47f013bc8e4beb31a6116448427a82057ba7c42c97e4c5ba766504c2 AS runner
RUN apt-get update && apt-get install --no-install-recommends -y \
    libpcre2-8-0=10.42-1+deb12u2 perl-base=5.36.0-7+deb12u4 && \
    rm -rf /var/lib/apt/lists/*
RUN chmod ugo-s /usr/bin/mount /usr/bin/umount

# Build tools are unused in the runner. Original layer terms stay bundled.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

# Create non-root system group and user
RUN groupadd -g 10001 notesapp && \
    useradd -u 10001 -g notesapp -m -d /home/notesapp -s /bin/bash notesapp

# Create attachment storage directory
RUN mkdir -p /var/lib/notesapp && chown -R notesapp:notesapp /var/lib/notesapp

WORKDIR /app

# Copy production server dependencies and built web assets only.
COPY --chown=notesapp:notesapp --from=builder /prod/server /app/server
COPY --chown=notesapp:notesapp --from=builder /app/apps/web/dist /app/web/dist
COPY --chown=notesapp:notesapp --from=builder /prod/licenses /app/licenses
COPY --chown=notesapp:notesapp --from=builder /app/LICENSE /app/LICENSE
COPY --chown=notesapp:notesapp tools/runtime-dependencies.mjs /app/runtime-dependencies.mjs

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
