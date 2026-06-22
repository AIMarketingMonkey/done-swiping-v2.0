# syntax=docker/dockerfile:1
# Build context: repo root (so we can access the pnpm workspace)
FROM node:22-slim

# Enable corepack for pnpm
RUN corepack enable

WORKDIR /app

# Copy workspace manifests first so Docker caches the install layer
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc tsconfig.base.json ./

# Package manifests for the packages we actually need
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/api/package.json ./apps/api/package.json

# Install all deps (including devDeps so tsx is available at runtime)
# --filter @done-swiping/api... means: api + its workspace deps (shared)
RUN pnpm install --no-frozen-lockfile --filter @done-swiping/api...

# Copy source — shared first, then api
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

ENV NODE_ENV=production

EXPOSE 8787

# Run via tsx so @done-swiping/shared (TypeScript source) resolves correctly
CMD ["pnpm", "--filter", "@done-swiping/api", "exec", "tsx", "src/index.ts"]
