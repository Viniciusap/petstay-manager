#!/usr/bin/env bash
# Migrates existing data from public schema to a named tenant schema.
# Run ONCE on the VPS after deploying the multi-tenant backend.
#
# Usage: SLUG=teste ./deploy/migrate-tenant.sh
# Set SLUG to the slug for the existing hotel (e.g. "teste", "hotel-abc").

set -euo pipefail

SLUG="${SLUG:?Set SLUG env var, e.g. SLUG=teste}"
DB_URL="${POSTGRES_URL:?Set POSTGRES_URL env var}"

echo "==> Migrating existing data to schema: $SLUG"
echo "    DB: $DB_URL"
echo ""

# 1. Backup first
TS=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="/tmp/pre-migration-backup-${TS}.sql"
echo "==> Creating backup at $BACKUP_FILE ..."
pg_dump --clean --if-exists -f "$BACKUP_FILE" "$DB_URL"
echo "    Backup done: $(du -sh "$BACKUP_FILE" | cut -f1)"
echo ""

# 2. Create _system schema + tenants table
echo "==> Creating _system schema and tenants table ..."
psql "$DB_URL" <<SQL
CREATE SCHEMA IF NOT EXISTS _system;
CREATE TABLE IF NOT EXISTS _system.tenants (
  slug       TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
SQL

# 3. Insert tenant record (skip if already exists)
echo "==> Inserting tenant record: slug='$SLUG' ..."
psql "$DB_URL" <<SQL
INSERT INTO _system.tenants (slug, name)
VALUES ('$SLUG', '${TENANT_NAME:-Hotel}')
ON CONFLICT (slug) DO NOTHING;
SQL

# 4. Create tenant schema
echo "==> Creating schema: \"$SLUG\" ..."
psql "$DB_URL" -c "CREATE SCHEMA IF NOT EXISTS \"$SLUG\""

# 5. Move tables from public to tenant schema
TABLES=(app_settings tutors animals services blocked_dates bookings contracts)
for tbl in "${TABLES[@]}"; do
  echo "    Moving public.$tbl -> $SLUG.$tbl ..."
  psql "$DB_URL" -c "ALTER TABLE IF EXISTS public.\"$tbl\" SET SCHEMA \"$SLUG\"" 2>/dev/null || true
done

echo ""
echo "==> Migration complete!"
echo ""
echo "Next steps:"
echo "  1. Move uploads: mv /opt/petstay/data/uploads /opt/petstay/data/$SLUG/uploads"
echo "     (adjust path if DATA_DIR differs)"
echo "  2. Rebuild and restart containers: docker compose build --no-cache && docker compose up -d"
echo "  3. Update base_url in settings to: https://petstay.aranciatech.com.br/$SLUG"
echo ""
echo "Backup saved at: $BACKUP_FILE"
