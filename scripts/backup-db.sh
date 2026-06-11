#!/usr/bin/env bash
#
# Daily encrypted Postgres backup -> Telegram DM.
#
# Dumps the DB with pg_dump (custom/compressed format), encrypts it with age
# under a public key, and uploads the result to a Telegram chat via the bot.
# The age private key must live OFF this server (keep it in a password manager);
# only AGE_RECIPIENT (public key) is needed here.
#
# Required env (read from .env in the project dir, see crontab line below):
#   DATABASE_URL    - postgres connection string (already in .env)
#   BOT_TOKEN       - telegram bot token         (already in .env)
#   BACKUP_CHAT_ID  - your personal chat id (get it from @userinfobot)
#   AGE_RECIPIENT   - age public key, starts with "age1..."
#
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BOT_TOKEN:?BOT_TOKEN is required}"
: "${BACKUP_CHAT_ID:?BACKUP_CHAT_ID is required}"
: "${AGE_RECIPIENT:?AGE_RECIPIENT is required}"

STAMP="$(date +%Y-%m-%d_%H%M)"
FILE="limebalance_${STAMP}.dump.age"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

notify_fail() {
  curl -fsS \
    -F chat_id="$BACKUP_CHAT_ID" \
    -F text="⚠️ limebalance DB backup FAILED at ${STAMP}" \
    "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" >/dev/null 2>&1 || true
}
trap 'notify_fail' ERR

# Dump straight from native Postgres, compress (built into -Fc), encrypt.
pg_dump --dbname="$DATABASE_URL" --format=custom \
  | age -r "$AGE_RECIPIENT" \
  > "$TMP/$FILE"

SIZE="$(du -h "$TMP/$FILE" | cut -f1)"

# Telegram bot upload limit is 50 MB; warn loudly if we get close.
BYTES="$(stat -c%s "$TMP/$FILE")"
if [ "$BYTES" -gt 47185920 ]; then
  echo "WARNING: backup is ${SIZE} (>45MB), close to Telegram's 50MB bot limit" >&2
fi

curl -fsS \
  -F document=@"$TMP/$FILE" \
  -F chat_id="$BACKUP_CHAT_ID" \
  -F caption="🗄 limebalance backup ${STAMP} (${SIZE})" \
  "https://api.telegram.org/bot${BOT_TOKEN}/sendDocument" >/dev/null

echo "backup sent: $FILE (${SIZE})"
