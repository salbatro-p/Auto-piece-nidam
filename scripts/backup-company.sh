#!/usr/bin/env bash
set -euo pipefail
umask 077

# The installation env, a verified GPG recipient fingerprint, and a new archive path.
[[ $# -eq 3 ]] || { echo 'Usage: backup-company.sh PRIVATE_ENV RECIPIENT_FINGERPRINT NEW_ARCHIVE' >&2; exit 2; }
envfile=$(realpath "$1")
recipient=$2
output=$3
[[ -f "$envfile" && "$recipient" =~ ^([[:xdigit:]]{40}|[[:xdigit:]]{64})$ && ! -e "$output" ]] || exit 2
root=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
partial=$(mktemp "$(dirname "$output")/.company-backup-XXXXXXXX")
cleanup() {
  rm -f -- "$work/database.dump" "$work/media.tar" "$work/tls.tar" "$work/company.env" "$work/SHA256SUMS" "$partial"
  rmdir -- "$work"
}
trap cleanup EXIT
compose=(docker compose --env-file "$envfile" -f "$root/infrastructure/company.compose.yaml")
"${compose[@]}" exec -T db pg_dump -U postgres -d autoparts_company --format=custom > "$work/database.dump"
# Media is content-addressed and retained. Copy after the DB snapshot so referenced objects exist.
"${compose[@]}" exec -T api tar --exclude='*.tmp' -C /var/lib/autoparts/media -cf - . > "$work/media.tar"
"${compose[@]}" exec -T gateway tar -C /data -cf - caddy > "$work/tls.tar"
cp -- "$envfile" "$work/company.env"
(cd "$work" && sha256sum database.dump media.tar tls.tar company.env > SHA256SUMS)
tar -C "$work" -cf - database.dump media.tar tls.tar company.env SHA256SUMS |
  gpg --batch --yes --trust-model always --recipient "$recipient" --encrypt --output "$partial"
# Publish only a complete archive. A competing run cannot replace an existing backup.
ln -- "$partial" "$output"
echo 'Encrypted backup complete.'
