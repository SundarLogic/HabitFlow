# HabitFlow API, production image (ADR-060).
#
# Used for local production-like testing (docker-compose.prod.yml) and for any container host.
# Render does NOT need it (it builds from source with render.yaml), and Vercel serves the frontend.
#
#   docker build -t habitflow-api ./backend
#   docker run --env-file prod.env -p 3000:3000 habitflow-api
#
# Two stages: "deps" installs production dependencies with a compiler toolchain available (in
# case a native module such as bcrypt has no prebuilt binary for Alpine); the final image copies
# only node_modules and the source, runs as the unprivileged "node" user, and starts with
# migrations first (never sequelize.sync()).

# ---- Stage 1: production dependencies ------------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
# --omit=dev: no test tools in the image. sequelize-cli is a runtime dependency (migrations).
RUN npm ci --omit=dev && npm cache clean --force

# ---- Stage 2: runtime ----------------------------------------------------------------------
FROM node:20-alpine
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json .sequelizerc.cjs ./
COPY src ./src
# Run as the image's built-in non-root user: a compromised process can't modify the app files.
USER node
EXPOSE 3000

# Liveness: the process answers /api/v1/health (200 even if the DB is down; the body says so).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/api/v1/health" || exit 1

# Migrate, then replace the shell with Node (exec) so Node is PID 1 and receives SIGTERM for a
# graceful shutdown.
CMD ["sh", "-c", "npm run db:migrate && exec node src/server.js"]
