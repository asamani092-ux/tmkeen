#!/bin/sh
set -e

if [ -n "$DATABASE_URL" ]; then
  echo "Running prisma migrate deploy..."
  npx prisma migrate deploy
else
  echo "WARNING: DATABASE_URL is not set — skipping migrations"
fi

exec "$@"
