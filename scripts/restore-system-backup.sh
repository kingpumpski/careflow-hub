#!/usr/bin/env bash
set -euo pipefail

INPUT="\${1:-}"
if [[ -z "$INPUT" || ! -f "$INPUT" ]]; then
  echo "Usage: BACKUP_AGE_IDENTITY_FILE=/secure/path/identity.txt BACKUP_EXPECTED_SHA256=<manifest-sha256> $0 <backup.tar.gz.age> [output-directory]" >&2
  exit 2
fi
: "\${BACKUP_AGE_IDENTITY_FILE:?Set BACKUP_AGE_IDENTITY_FILE to the private age identity file.}"
: "\${BACKUP_EXPECTED_SHA256:?Copy the expected SHA-256 from the verified backup manifest.}"
OUTPUT="\${2:-careflow-recovery-\$(date -u +%Y%m%dT%H%M%SZ)}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
ACTUAL="$(sha256sum "$INPUT" | awk '{print $1}')"
if [[ "$ACTUAL" != "$BACKUP_EXPECTED_SHA256" ]]; then
  echo "Encrypted backup checksum mismatch. Do not restore this file." >&2
  exit 1
fi
age --decrypt --identity "$BACKUP_AGE_IDENTITY_FILE" --output "$WORK/backup.tar.gz" "$INPUT"
if tar -tzf "$WORK/backup.tar.gz" | awk 'BEGIN{bad=0} /^\//{bad=1} /(^|\/)\.\.(\/|$)/{bad=1} END{exit bad?0:1}'; then
  echo "Backup archive contains an unsafe path. Refusing extraction." >&2
  exit 1
fi
mkdir -p "$OUTPUT"
tar --no-same-owner --no-same-permissions -xzf "$WORK/backup.tar.gz" -C "$OUTPUT"
node scripts/verify-system-backup.mjs "$OUTPUT"
echo
echo "Backup integrity verified and extracted to: $OUTPUT"
echo "Database file: inspect $OUTPUT/manifest.json and follow docs/BACKUP_AND_RESTORE.md before any database restore."
echo "Storage objects: after restoring the database to the intended target, run scripts/restore-storage.mjs with the explicit confirmation described in docs/BACKUP_AND_RESTORE.md."
