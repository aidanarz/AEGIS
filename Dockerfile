# =====================================================================
# Stage 1: deps — install all dependencies
# =====================================================================
FROM ubuntu:24.04 AS deps

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma/schema.prisma ./prisma/schema.prisma

RUN npm ci

# =====================================================================
# Stage 2: builder — seed DB + compile Next.js
# =====================================================================
FROM deps AS builder

WORKDIR /app

# Copy full source (needed for seed.ts dan lib/)
COPY . .

# DATABASE_URL for build-time: seed dijalankan di sini, hasilnya dibawa ke runner
ENV DATABASE_URL="file:/app/prisma/seed.db"

# 1. Push schema ke SQLite
# 2. Seed database (seed.ts bisa akses lib/ karena source lengkap ada di sini)
# 3. Build Next.js
RUN npm run prebuild && npm run build

# =====================================================================
# Stage 3: runner — minimal production image
# =====================================================================
FROM ubuntu:24.04 AS runner

ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Non-root user
RUN groupadd --gid 1001 nodejs \
    && useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home nextjs

WORKDIR /app

# Next.js standalone output
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Prisma generated client
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# DB yang sudah di-seed saat build — disimpan sebagai "template"
# Saat container pertama kali start, entrypoint akan menyalinnya ke volume
RUN mkdir -p /app/prisma/template && chown -R nextjs:nodejs /app/prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma/seed.db ./prisma/template/seed.db

# Buat direktori volume dengan ownership yang benar
RUN mkdir -p /app/prisma/data && chown -R nextjs:nodejs /app/prisma/data

# Entrypoint
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

VOLUME ["/app/prisma/data"]

USER nextjs

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
