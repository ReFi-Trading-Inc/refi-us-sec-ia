FROM node:22-alpine AS base

FROM base AS deps
WORKDIR /app
RUN corepack enable pnpm
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/api-clients/package.json ./packages/api-clients/
COPY packages/ui/package.json ./packages/ui/
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
RUN corepack enable pnpm
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .
# NEXT_PUBLIC_* values are inlined by `next build`, so the image is tier-specific.
# Server-only vars (REFI_ENV, secrets) are NOT baked in: they are runtime env.
ARG NEXT_PUBLIC_REFI_ENV=staging
ARG NEXT_PUBLIC_REFI_DATA_ADAPTER=live
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
ARG NEXT_PUBLIC_POSTHOG_KEY=placeholder
ARG NEXT_PUBLIC_SENTRY_DSN=https://placeholder@o0.ingest.sentry.io/0
ARG NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=placeholder
# Public (browser) Socure SDK key; empty = DI/DocV SDK not loaded. Never the server API key.
ARG NEXT_PUBLIC_SOCURE_SDK_KEY=
ENV NEXT_PUBLIC_REFI_ENV=$NEXT_PUBLIC_REFI_ENV \
    NEXT_PUBLIC_REFI_DATA_ADAPTER=$NEXT_PUBLIC_REFI_DATA_ADAPTER \
    NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL \
    NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=$NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID \
    NEXT_PUBLIC_SOCURE_SDK_KEY=$NEXT_PUBLIC_SOCURE_SDK_KEY
RUN pnpm --filter @refi/web build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME="0.0.0.0"
CMD ["node", "apps/web/server.js"]
