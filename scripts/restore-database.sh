#!/usr/bin/env bash
set -euo pipefail

ROOT_INPUT="${1:-}"
if [[ -z "$ROOT_INPUT" || ! -d "$ROOT_INPUT" ]]; then
  echo "Usage: RESTORE_TARGET_PROJECT_REF=<target-ref> RESTORE_TARGET_DB_URL=<session-pooler-uri> RESTORE_CONFIRMATION=RESTORE-DATABASE-TO:<target-ref> $0 <verified-extracted-backup-directory>" >&2
  exit 2
fi
: "${RESTORE_TARGET_PROJECT_REF:?Set the replacement Supabase project ref.}"
: "${RESTORE_TARGET_DB_URL:?Set the target PostgreSQL session-pooler connection URI.}"
: "${RESTORE_CONFIRMATION:?Explicit target confirmation is required.}"
if [[ "$RESTORE_CONFIRMATION" != "RESTORE-DATABASE-TO:$RESTORE_TARGET_PROJECT_REF" ]]; then
  echo "Restore confirmation does not match the target project ref." >&2
  exit 1
fi
if [[ ! "$RESTORE_TARGET_PROJECT_REF" =~ ^[a-z0-9]{20}$ ]]; then
  echo "Invalid target project ref." >&2
  exit 1
fi
if [[ ! "$RESTORE_TARGET_DB_URL" =~ ^postgres(ql)?:// ]]; then
  echo "RESTORE_TARGET_DB_URL must be a PostgreSQL connection URI." >&2
  exit 1
fi

ROOT="$(cd "$ROOT_INPUT" && pwd)"
node scripts/verify-system-backup.mjs "$ROOT"
SOURCE_REF="$(node -e 'const m=require(process.argv[1]); process.stdout.write(m.project_ref)' "$ROOT/manifest.json")"
if [[ "$RESTORE_TARGET_PROJECT_REF" == "$SOURCE_REF" && "${RESTORE_ALLOW_SOURCE_OVERWRITE:-}" != "I_UNDERSTAND_THIS_OVERWRITES_PRODUCTION" ]]; then
  echo "Refusing to overwrite the source project. Restore to a replacement project first. For an explicitly approved in-place recovery, set RESTORE_ALLOW_SOURCE_OVERWRITE=I_UNDERSTAND_THIS_OVERWRITES_PRODUCTION." >&2
  exit 1
fi
POSTGRES_MAJOR="$(node -e 'const m=require(process.argv[1]); process.stdout.write(String(m.database.postgresMajor))' "$ROOT/manifest.json")"
if [[ ! "$POSTGRES_MAJOR" =~ ^(14|15|16|17|18|19)$ ]]; then
  echo "Unsupported PostgreSQL major version in backup manifest: $POSTGRES_MAJOR" >&2
  exit 1
fi

echo "Checking target database version before any changes..."
TARGET_VERSION="$(docker run --rm -e TARGET_DB_URL="$RESTORE_TARGET_DB_URL" postgres:"$POSTGRES_MAJOR"-alpine sh -c 'psql "$TARGET_DB_URL" -Atqc "SHOW server_version_num"')"
TARGET_MAJOR="$((TARGET_VERSION / 10000))"
if [[ "$TARGET_MAJOR" != "$POSTGRES_MAJOR" ]]; then
  echo "Target PostgreSQL major version ($TARGET_MAJOR) does not match backup version ($POSTGRES_MAJOR)." >&2
  exit 1
fi

echo "Restoring database to target project $RESTORE_TARGET_PROJECT_REF."
echo "This operation replaces target database objects. Use a new project unless an in-place recovery has been explicitly approved."
docker run --rm \
  -e TARGET_DB_URL="$RESTORE_TARGET_DB_URL" \
  -v "$ROOT/database:/backup:ro" \
  postgres:"$POSTGRES_MAJOR"-alpine \
  pg_restore --clean --if-exists --no-owner --exit-on-error --single-transaction \
  --dbname "$RESTORE_TARGET_DB_URL" /backup/project-database.dump

echo "Checking restored Auth, Storage and migration tables..."
docker run --rm -e TARGET_DB_URL="$RESTORE_TARGET_DB_URL" postgres:"$POSTGRES_MAJOR"-alpine \
  sh -c 'psql "$TARGET_DB_URL" -v ON_ERROR_STOP=1 -Atqc "SELECT to_regclass('\''auth.users'\'') IS NOT NULL AND to_regclass('\''auth.identities'\'') IS NOT NULL AND to_regclass('\''storage.buckets'\'') IS NOT NULL AND to_regclass('\''storage.objects'\'') IS NOT NULL AND to_regclass('\''supabase_migrations.schema_migrations'\'') IS NOT NULL"' \
  | grep -qx t

echo "Database restore completed. Next run scripts/restore-storage.mjs with the same target project ref and RESTORE_CONFIRMATION=RESTORE-STORAGE-TO:<target-ref>."
