# DB backups

Daily encrypted Postgres dump, delivered to your Telegram DM via the bot.

## One-time setup

### 1. Install tools on the VPS

```bash
# matching the server's major version (Postgres 17)
sudo apt-get install -y postgresql-client-17 age
```

### 2. Generate the age key pair (on YOUR laptop, not the VPS)

```bash
age-keygen -o limebalance-backup-key.txt
# prints: Public key: age1xxxxxxxx...
```

- Store `limebalance-backup-key.txt` (the **private** key) in your password manager.
  Without it the backups cannot be decrypted — and it must never touch the VPS.
- Copy only the **public** key (`age1...`) to the server.

### 3. Find your Telegram chat id

Message [@userinfobot](https://t.me/userinfobot) — it replies with your numeric id.

### 4. Add the two new vars to `/opt/limebalance/.env` on the VPS

```env
BACKUP_CHAT_ID=123456789
AGE_RECIPIENT=age1xxxxxxxx...
```

### 5. Put the script on the VPS and schedule it

```bash
chmod +x /opt/limebalance/scripts/backup-db.sh

# crontab -e (as the `deploy` user) -> daily at 03:00 server time
# The script loads .env and sets PATH itself, so no `cd`/`set -a` needed.
# Log goes to the project dir, NOT /var/log — a non-root user can't create files
# under /var/log, which makes cron abort on the redirect before the script runs.
0 3 * * * /opt/limebalance/scripts/backup-db.sh >> /opt/limebalance/backup.log 2>&1
```

Run it once by hand to confirm the file lands in your Telegram chat.

## Restoring (on your laptop)

```bash
# decrypt with the private key, then restore into a target database
age -d -i limebalance-backup-key.txt limebalance_2026-06-10_0300.dump.age > restore.dump
pg_restore --clean --if-exists --dbname="$TARGET_DATABASE_URL" restore.dump
```

> Test a restore into a throwaway DB now and then — an untested backup is a guess.
