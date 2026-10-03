#!/bin/bash
set -e

DB_VOLUME="/app/prisma/data/prod.db"
DB_TEMPLATE="/app/prisma/template/seed.db"

echo "[entrypoint] Starting AEGIS..."
echo "[entrypoint] DATABASE_URL=${DATABASE_URL}"

# Jika database di volume belum ada, salin dari template yang sudah di-seed saat build
if [ ! -f "$DB_VOLUME" ]; then
  echo "[entrypoint] Database belum ada — menyalin dari template yang sudah di-seed..."
  cp "$DB_TEMPLATE" "$DB_VOLUME"
  echo "[entrypoint] Database siap."
else
  echo "[entrypoint] Database sudah ada — langsung lanjut."
fi

echo "[entrypoint] Starting Next.js on port ${PORT:-3000}..."
exec node server.js
