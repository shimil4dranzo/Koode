# Koode production image.
#
# Multi-stage so the runtime image carries no build toolchain, no source and no
# dev dependencies. Node 22 LTS rather than latest: this has to keep running
# for years on grant funding, and an LTS line gets security fixes without
# surprises.

# --- deps --------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

# `npm ci` installs exactly the lockfile. The postinstall runs `prisma generate`,
# which needs the schema — hence copying prisma/ first.
RUN npm ci

# --- build -------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PHASE tells src/server/env.ts that this is a build, not a deployment, so
# it does not demand production Redis and SMS credentials from a build machine.
ENV NEXT_PHASE=phase-production-build
ENV NEXT_TELEMETRY_DISABLED=1

RUN npx prisma generate && npm run build

# --- runtime -----------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Never run as root.
RUN addgroup -g 1001 -S nodejs && adduser -S -u 1001 -G nodejs koode

# `output: 'standalone'` in next.config.ts produces a self-contained server
# with only the modules actually imported.
COPY --from=build --chown=koode:nodejs /app/.next/standalone ./
COPY --from=build --chown=koode:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=koode:nodejs /app/public ./public

# Migrations run as a separate deploy step, not on container start — see
# docs/RUNBOOK.md. A container that migrates on boot will race itself the
# moment there is more than one replica.
COPY --from=build --chown=koode:nodejs /app/prisma ./prisma
COPY --from=build --chown=koode:nodejs /app/node_modules/.prisma ./node_modules/.prisma

USER koode
EXPOSE 3000

# Checks a real database round trip including the Malayalam charset probe, not
# just that the process is listening.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
