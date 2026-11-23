# syntax=docker/dockerfile:1.7
# Production image for the Study Planner API.
#   docker build -t study-planner-api ./backend
# glibc (bookworm) rather than Alpine so argon2's prebuilt binary is used, not compiled.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
# The test-only MongoDB binary is not needed to build an image.
ENV MONGOMS_DISABLE_POSTINSTALL=1
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# One-off admin tasks, e.g. `docker compose run --rm admin` (see docker-compose.yml).
FROM build AS tools
COPY scripts ./scripts
CMD ["npx", "tsx", "scripts/create-admin.ts"]

FROM node:22-bookworm-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=4000
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/api/v1/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
# Node handles SIGTERM itself (graceful shutdown in src/server.ts), so it runs as PID 1 directly.
CMD ["node", "--enable-source-maps", "dist/server.js"]
