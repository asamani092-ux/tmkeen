#!/bin/sh

if [ -n "$DATABASE_URL" ]; then
  echo "Running prisma migrate deploy..."
  if npx prisma migrate deploy; then
    echo "Migrations applied successfully."
  else
    echo "WARNING: prisma migrate deploy failed — starting app anyway."
    echo "Check DATABASE_URL and that PostgreSQL is on the same Coolify project network."
  fi
else
  echo "WARNING: DATABASE_URL is not set — skipping migrations"
fi

exec "$@"
