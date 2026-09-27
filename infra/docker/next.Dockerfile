# Builds one Next.js app from the monorepo. Usage: --build-arg APP=mobile|admin (context: repo root).
FROM node:22-alpine AS base
RUN npm install -g pnpm@10.34.5
WORKDIR /repo

FROM base AS build
ARG APP
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile
ENV NEXT_STANDALONE=1 \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter "@bg/${APP}" build

FROM node:22-alpine AS run
ARG APP
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    APP_DIR=apps/${APP}
COPY --from=build --chown=node /repo/apps/${APP}/.next/standalone ./
COPY --from=build --chown=node /repo/apps/${APP}/.next/static ./apps/${APP}/.next/static
COPY --from=build --chown=node /repo/apps/${APP}/public ./apps/${APP}/public
USER node
CMD ["sh", "-c", "node $APP_DIR/server.js"]
