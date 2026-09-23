<h1 align="center">🍋 LimeBalance</h1>

<p align="center">
  <b>A personal finance tracker you control from Telegram and the web.</b><br/>
  Expenses and income in any currency, savings goals, and a crypto section that reads your Bybit account, keeps a trading diary, and tracks where your invested money sits.
</p>

<p align="center">
  <img alt="Bun" src="https://img.shields.io/badge/Bun-1.4-000000?logo=bun&logoColor=white" />
  <img alt="NestJS" src="https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-6%20%2B%207-3178C6?logo=typescript&logoColor=white" />
  <img alt="Fastify" src="https://img.shields.io/badge/Fastify-black?logo=fastify&logoColor=white" />
  <img alt="Prisma" src="https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white" />
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white" />
  <img alt="grammY" src="https://img.shields.io/badge/grammY-Telegram%20Bot-26A5E4?logo=telegram&logoColor=white" />
  <img alt="Docker" src="https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white" />
</p>

---

This repository is the **backend**: a REST API plus the Telegram bot. The web cabinet is a separate frontend that talks to this API.

## Contents

- [Features](#-features)
- [Tech stack](#-tech-stack)
- [Architecture](#️-architecture)
- [How it works](#-how-it-works)
  - [Accounts and authentication](#1-accounts-and-authentication)
  - [Plans and limits](#2-plans-and-limits)
  - [Categories, expenses, income](#3-categories-expenses-income)
  - [Multi-currency](#4-multi-currency)
  - [Balance](#5-balance)
  - [Currency exchanges](#6-currency-exchanges)
  - [Goals](#7-goals)
  - [Investing](#8-investing-pro--ultra)
  - [Notifications](#9-notifications)
  - [Telegram bot](#10-telegram-bot)
  - [Admin panel](#11-admin-panel)
  - [Background jobs](#12-background-jobs)
- [Getting started](#-getting-started)
- [API overview](#-api-overview)
- [Deployment](#-deployment-cicd)
- [Project structure](#-project-structure)

---

## ✨ Features

- **💬 Telegram and web.** Add expenses, income and categories and view stats in a [grammY](https://grammy.dev/) bot (34 interface languages), or use the web cabinet through the REST API.
- **🔐 Three ways to sign in.** Email and password, Google or Telegram, and one account can have all three linked. Web clients get httpOnly cookies and mobile clients get Bearer tokens.
- **🌍 Multi-currency.** Every amount is kept in its own currency. Reports convert at the rate of each operation's own date, so a month that has ended always shows the same total.
- **💱 Currency exchanges.** Record a real exchange (100 USD → 3 180 THB) and the app shows the rate you got and what it cost compared with the market rate.
- **🎯 Savings goals.** Money you put into a goal is set aside and no longer counts in your free balance.
- **📈 Investing section.** A read-only Bybit connection that syncs trades every 2 minutes. It includes a trading diary with notes, venues (exchanges and wallets) with their value and result, deposit and withdrawal import, P2P history, and a manual portfolio.
- **🔔 Notifications.** Bell notifications in the web app, a monthly digest in Telegram and an alert when a trade closes. Each push can be turned off.
- **🪪 Plans.** A free tier with limits and paid tiers that unlock the investing section. Admins manage plans and users.
- **🛡️ Built-in protections.** DTO whitelisting, Zod-validated env, rate limiting, AES-256-GCM encryption for exchange keys, and exchange keys with trade permissions are refused.

---

## 🧱 Tech stack

| Layer        | Technology                                                                         |
| ------------ | ---------------------------------------------------------------------------------- |
| Runtime      | [Bun](https://bun.sh/) 1.4 (dev, tests, production)                                 |
| Framework    | [NestJS 11](https://nestjs.com/) on [Fastify](https://fastify.dev/)                 |
| Language     | TypeScript: TS 6 for the Nest CLI build, TS 7 (`tsgo`) for fast type-checking        |
| Database     | PostgreSQL 17 via [Prisma 7](https://www.prisma.io/) (`@prisma/adapter-pg`)          |
| Telegram     | [grammY](https://grammy.dev/) (webhook mode) + i18next                              |
| Auth         | Passport JWT, Google ID tokens, Telegram Login Widget, bcrypt                        |
| Scheduling   | `@nestjs/schedule` (cron jobs inside the app process)                               |
| Email        | Nodemailer over SMTP (falls back to logging links when SMTP is not set)             |
| Validation   | Zod (env) + class-validator / class-transformer (DTOs)                              |
| Tooling      | [Biome](https://biomejs.dev/) (lint + format), `bun test`                           |
| Delivery     | Docker multi-stage image → GHCR → VPS via GitHub Actions                            |

External data sources: [open.er-api.com](https://open.er-api.com) (live FX, about 160 currencies), [Frankfurter / ECB](https://frankfurter.dev) (historical FX backfill), and the Bybit v5 API (trades, balances, prices, P2P).

---

## 🏗️ Architecture

```
  Telegram user ──► Telegram ──webhook──► POST /api/bot/webhook ─┐
                                                                 │
  Web / mobile ────────── REST /api/* (cookies or Bearer) ───────┤
                                                                 ▼
                    ┌──────────────────────── NestJS + Fastify ───────────────────────┐
                    │  Global guards: ThrottlerGuard → JwtAuthGuard (@Public opt-out)  │
                    │                                                                  │
                    │  auth · users · subscriptions · admin                            │
                    │  expense/income categories · expenses · incomes · transactions   │
                    │  currency (live + historical FX) · exchanges · goals             │
                    │  investing (Bybit sync, venues, transfers, P2P, diary, holdings) │
                    │  notifications (bell, digest) · mail · bot (grammY)              │
                    │                                                                  │
                    │  Cron: FX snapshot · Bybit sync · monthly digest · account purge  │
                    └──────────────┬──────────────────────────────┬────────────────────┘
                                   │ Prisma                        │ fetch
                                   ▼                               ▼
                           ┌──────────────┐          er-api · Frankfurter · Bybit · Google
                           │  PostgreSQL  │
                           └──────────────┘
```

Every route is served under `/api`. Every route needs a valid JWT unless it is marked `@Public()`. Admin routes also check the `ADMIN` role, and investing routes check that the plan includes investing.

---

## 🔍 How it works

### 1. Accounts and authentication

**Ways to sign in** ([auth.service.ts](src/modules/auth/auth.service.ts)):

| Method          | How it is verified                                                                                   | Result                                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Email and password | bcrypt hash (cost 10)                                                                             | `register` creates the account and logs the user in right away. The email starts **unverified**.        |
| Google          | The ID token is checked with Google `tokeninfo`: `aud` must equal `GOOGLE_CLIENT_ID` and the email must be verified | Finds the user by `googleId`. If none matches, it links Google to an existing account with the same email. If there is none, it creates a new user. |
| Telegram        | Login Widget HMAC-SHA256 with `sha256(BOT_TOKEN)`, rejected after 24 h                                | Finds or creates the user by `telegramId`.                                                              |

When a new account is created, the client can send the browser `timezone` as a hint. The default **currency** comes from it (timezone → country → currency, in [currency-from-timezone.ts](src/common/currency-from-timezone.ts)), and falls back to USD. Every new user gets the `free` plan in the same write.

**Tokens**

- The **access token** is a JWT (`{ sub: userId }`) that lasts **15 min**.
- The **refresh token** is a random UUID stored in `refresh_tokens` and lasts **7 days**. It is **rotated** on every `/auth/refresh`: the old one is deleted and a new pair is issued.
- **Web:** both tokens are set as httpOnly `SameSite=Lax` cookies (`secure` in production). `access_token` uses path `/` and `refresh_token` uses path `/api/auth`, so the refresh token is only ever sent to auth routes.
- **Mobile:** send the header `X-Client: mobile` to get the tokens in the response body instead of cookies. Then send `Authorization: Bearer <access>` and pass `refreshToken` in the body of `/auth/refresh` and `/auth/logout`.
- `JwtStrategy` reads the token from the cookie first, then from the Bearer header. It checks `blockedAt` on **every request**, so blocking a user takes effect on their next call.

**Linking and email**

- `POST /auth/link/google` and `POST /auth/link/telegram` attach another login method to the current account. If that method already belongs to a different account, the call returns 409.
- `POST /auth/me/credentials` does two jobs:
  - If the account has **no email** (for example, it was created through Telegram), it takes an email and a password. They are held in `email_verification_tokens` and written to the account only after the user clicks the link in the email (`/auth/confirm-email`, valid for 24 h).
  - If the account already has an email, it changes the password. The current password is required if one is set.
- Password reset: `forgot-password` always returns success, so it does not reveal which emails exist. It sends a one-time token that lasts 15 minutes. `reset-password` uses that token.
- Cleanup: every night at 04:00 (after the 03:00 backup), password accounts that are **both** unverified and older than 72 h **and** completely empty (no transactions, goals or categories) are deleted.

**Rate limits:** 100 requests/min per IP overall and 10/min on `/auth/*`. Fastify runs with `trustProxy: 'loopback'`, so the limit applies to the real client IP behind nginx.

### 2. Plans and limits

Plans are stored in the `plans` table and managed by admins. Seeded values:

| Plan    | Categories (lifetime, expense + income) | Transactions / calendar month | Investing section |
| ------- | --------------------------------------- | ----------------------------- | ----------------- |
| `free`  | 5                                       | 20                            | ✗                 |
| `pro`   | unlimited                               | unlimited                     | ✓                 |
| `ultra` | unlimited                               | unlimited                     | ✓                 |

- A user's **effective plan** is their subscribed plan while `expiresAt` is empty or in the future. Otherwise it is `free` ([subscriptions.service.ts](src/modules/subscriptions/subscriptions.service.ts)).
- Limits are checked when something is created. The monthly count uses the operation date in the user's timezone. Going over a limit throws `PlanLimitExceededException`, which is a 403. The bot catches it and replies with an upgrade prompt.
- `GET /subscriptions/usage` returns `used / limit / remaining` so the frontend can warn users before they hit a limit.
- An admin can **archive** a plan. It is then hidden from new signups, but current subscribers keep it until it expires. A plan can only be deleted when nobody is on it. The `free` plan can never be archived or deleted.

### 3. Categories, expenses, income

- Expense and income categories are separate, belong to one user, and have a name and an optional emoji. **Deleting a category deletes its transactions** (cascade).
- An expense or income has `amount` (2 decimals, > 0), `currency` (ISO 4217, defaults to the user's currency), `description`, and `date`. The date is a calendar date (a `DATE` column): the local day of the operation, with no time or timezone.
- `GET /transactions` returns one paginated feed of both types via `UNION ALL`. It can be filtered by type, category, currency, text search and date range. Each page includes a `summary` of income, expense and net for that page in the base currency.
- `/expenses/summary` and `/incomes/summary` group totals into day, week or month buckets for charts. `/expense-categories/stats` returns totals per category and can compare two periods. `/expenses/stat` and `/incomes/stat` return the same summary the bot shows.
- Bulk delete (`DELETE /expenses` with `ids`) runs in one transaction. If any id belongs to someone else, it returns 404 and nothing is deleted.

### 4. Multi-currency

The core rule: **money is never silently converted.** Each amount stays in the currency it was entered in. Conversion happens only when two currencies have to be shown as one number.

There are two kinds of rates ([src/modules/currency/](src/modules/currency/)):

| Service           | Question it answers           | Source                                                                                                            |
| ----------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `CurrencyService` | "What is this worth **now**?" | open.er-api.com, USD base, about 160 currencies, cached in memory for 12 h. If a fetch fails, the last cached rates are used. |
| `FxRatesService`  | "What was it worth **on that date**?" | The `fx_rates` table: one USD rate per currency per day.                                                    |

How `fx_rates` is filled:
- A **cron at 01:00** saves the day's live rates (`source = er-api`).
- `scripts/backfill-fx-rates.ts` fills in older dates from the ECB/Frankfurter series (about 30 currencies). Existing rows are kept. See [scripts/README.md](scripts/README.md).
- To look up a date, the service takes the newest row on or before it (markets are closed on weekends). If there is none, it uses today's live rate. If the currency is unknown everywhere, it returns `null`.

**USD snapshot per transaction.** On create, `amountUsd` is calculated at the rate of the transaction's **own `date`**, not the day it was entered. It is recalculated only when the amount, currency or date actually changes. The frontend often sends back the whole form unchanged, and that must not trigger a recalculation.

**Two ways to add up amounts:**

- `historicalTotalInBase` is used for **reports on a period** (summaries, stats, feed totals, monthly digest). Each row is converted to the base currency at the rate of its own date. This is why a month that has ended always shows the same total, even when the base currency loses value.
- `approxTotalInBase` / `sumIntoBase` are used for **"how much is it now"** (balance, goal totals). They convert at today's rate.

In both cases, rows already in the base currency are added as they are, with no round trip through USD. If a conversion is needed but no rate is available, the total is `null` rather than a wrong number.

When the user changes their base currency in the profile, only how totals are displayed changes. Stored rows are never rewritten.

### 5. Balance

`GET /transactions/balance` ([transactions.service.ts](src/modules/transactions/transactions.service.ts)) works out a free balance **per currency** and does not convert anything:

```
free balance[cur] =  Σ income[cur]
                   − Σ expense[cur]
                   − Σ money set aside in active goals[cur]
                   ± currency exchanges (from −, to +)
                   − Σ net transfers from the balance to investing venues[cur]   (peer = LEDGER only)
```

- `byCurrency` has the exact amounts and is the source of truth.
- `balance` adds them into one number in the base currency, converting only foreign currencies at today's rate. `isApproximate: true` means a conversion happened.
- `balanceUsd` is `balance` converted to USD. It is not calculated separately, so it cannot disagree with `balance`.
- `inGoals` is the total set aside in goals.
- `inExchanges` is the current value of all investing venues, converted from USD to the base currency.
- Withdrawing more from an exchange than was deposited (that is, trading at a profit) makes the transfer total negative. That adds the gain to the balance without creating an income entry.

### 6. Currency exchanges

`/exchanges` records something like "100 USD handed over, 3 180 THB received" ([exchanges.service.ts](src/modules/exchanges/exchanges.service.ts)). An exchange is **neither income nor expense**. It only moves money between the per-currency balances, using the two amounts the user actually entered, so no rate is needed. Each exchange in a response also includes:

- `effectiveRate`: `toAmount / fromAmount`
- `midMarketRate`: the market rate from `fx_rates` on the exchange date
- `costPct`: how much the exchange cost compared with the market rate. A positive value is the normal case (a loss to the user).

### 7. Goals

- A goal has a name, an emoji, `targetAmount` in its **own currency**, an optional month/year deadline, and an `archived` flag ([goals.service.ts](src/modules/goals/goals.service.ts)).
- Its current amount is the sum of `goal_contributions`. Contributions can be negative, which is a withdrawal. The server enforces `0 ≤ current ≤ target`.
- Money in an **active** goal is taken out of the free balance in the goal's currency. Archived goals stop holding money aside.
- Calculated fields: `progress` %, `remaining`, `monthsLeft`, `perMonth` needed to reach the target, `isOverdue`. The top summary card adds up all goals in the base currency at today's rate.
- The first time a goal reaches its target, `completedAt` is set and a `goal_completed` notification is created once.

### 8. Investing (Pro / Ultra)

Every `/investing/*` route is protected by `InvestingAccessGuard`. The whole section is turned off until `ENCRYPTION_KEY` is set.

#### 8.1 Connecting Bybit

- `POST /investing/accounts` checks the key with Bybit and **refuses any key that is not read-only**, because the app never needs trade or withdraw permissions.
- The key and secret are stored encrypted with **AES-256-GCM** (`iv:tag:ciphertext`, [crypto.util.ts](src/modules/investing/crypto.util.ts)) and are never returned by the API.
- History is loaded from about 2 years back (Bybit's limit) in the background. Account `status` is `ACTIVE`, `ERROR` (with `lastError`, retried automatically) or `DISABLED`.
- Deleting an account removes its synced trades, but **keeps** its venue and all money history. The venue switches to `MANUAL`.

#### 8.2 Sync (cron every 2 min)

For each `ACTIVE` or `ERROR` account, [investing-sync.service.ts](src/modules/investing/investing-sync.service.ts) runs these steps in order:

1. **Closed PnL (linear)**, in 7-day windows with a saved position (cursor) and a small overlap. If a tracked `OPEN` position closes, the same row is switched to `CLOSED`, so notes on it are kept.
2. **Fills (linear + spot)**, saved with `execId` as the dedupe key.
3. **Open linear positions** from Bybit's position list, including TP and SL.
4. **Spot positions are rebuilt** from all fills using **LIFO**. Each buy is its own diary entry, and a sell uses up the newest buys first ([spot-lifo.util.ts](src/modules/investing/spot-lifo.util.ts)).
5. **Linear `openedAt`** is worked out by FIFO matching of closing quantities against opening fills.
6. **Live balance** of the venue: the trading account equity plus the FUND account.
7. **Deposit and withdrawal import** (see 8.4).
8. **P2P history**, at most every 30 min.
9. **Trade-closed pushes** for positions closed since the last sync. They are skipped on the first full history load.

If a cron tick starts while the previous one is still running, it is skipped. Balance, import and P2P steps never throw, so one failed read does not fail the whole sync.

#### 8.3 Trading diary

- `Position` rows can be `OPEN` or `CLOSED` and come from `bybit` (the trade fields cannot be edited) or `manual` (full CRUD). `side` is always the side of the **closing** order: Sell closes a long, Buy closes a short.
- `entryVolumeUsd = qty × entry / leverage` is a Postgres **generated column**, so positions under $1 (leftover "dust") can be filtered out in SQL. The app never writes this column.
- Notes (`position_notes`) can be added to any position, open or closed, synced or manual. They can include an **external** image URL, because the app does not upload or store files.
- Endpoints: a paginated list with filters (status, symbol, side, date, profit or loss), `summary` (total realized PnL and win rate over the **full** filtered history, not just the page), `equity-curve`, `symbols` for autocomplete, and raw `trades`.
- Open positions show unrealized PnL priced from Bybit's public tickers (cached in memory).

#### 8.4 Venues, transfers and the investing result

A **venue** is a place money sits outside the main balance ([investing-venues.service.ts](src/modules/investing/investing-venues.service.ts)).

| Mode     | Value                                                                                   |
| -------- | --------------------------------------------------------------------------------------- |
| `LIVE`   | Read from the exchange on every sync: trading equity plus FUND. It already includes open positions, fees and funding. |
| `MANUAL` | Tracked coins × current price. If no coins are tracked, the net amount transferred in. Adjustments are added on top. |

**Result** = current value − opening balance (the value at the first successful read, which never changes afterwards; FUND has its own) − net USD transferred in.

A **transfer** moves money into (`IN`) or out of (`OUT`) a venue. It is priced in USD at the rate of its own date. The other side of a transfer (`peer`) decides what it affects:

| `peer`     | Example                           | Free balance | Net worth |
| ---------- | --------------------------------- | ------------ | --------- |
| `LEDGER`   | Balance → Bybit and back          | changes      | unchanged |
| `VENUE`    | Bybit → cold wallet               | unchanged    | unchanged |
| `EXTERNAL` | Paid someone, or received a gift  | unchanged    | changes   |

- A transfer can be in a **coin** (`asset` + `assetAmount`). The coins held in the manual venues involved are then adjusted, and they are restored if the transfer is deleted.
- **Import from Bybit:** deposits and withdrawals are imported after FUND has its opening balance, and never from earlier dates. They arrive with `needsReview` and count as `EXTERNAL` until the user explains them with `/transfers/:id/classify`. The options are: from or to the balance, another venue, someone else, **income** or **expense** (which creates a real income or expense entry linked to the transfer, so the balance nets to zero while reports show the money earned or spent), or "replaces this manual entry". An imported transfer cannot be deleted or have its amount changed, only classified.
- **P2P:** Bybit's API only returns the last 180 days, so orders are copied into `p2p_orders` and kept permanently. With auto-recording on (`p2pAutoRecordFrom`), every completed order after that moment becomes a balance transfer: a buy takes fiat out of the balance, a sell puts it back.
- **Adjustments** (manual venues only, a note is required) cover things like "sent some to a friend" or "miscounted".
- A venue can only be **deleted** when it has no transfers, adjustments or coins. Otherwise, archive it.

#### 8.5 Holdings and reference data

- `holdings` is a manual portfolio ("0.5 BTC in a cold wallet"). Each holding has an optional average buy price for PnL and is valued at current prices. Coins in a `MANUAL` venue are also stored here.
- `GET /investing/assets` lists the coins that have a price, which is what the pickers show. `GET /investing/coin-icons` returns coin icons using a separate app-level Bybit key (`BYBIT_ICON_API_KEY`). If that key is not set, the frontend shows letter avatars instead.

### 9. Notifications

- **Bell (web):** `GET /notifications` recalculates the **current month** `monthly_summary` card every time it is called and returns the list with the unread count. Cards have a stable `dedupeKey`, so the same card is updated instead of duplicated. The frontend builds the text from `payload`.
- **Monthly digest:** on the 1st of the month at 09:00, users with Telegram get a summary of last month compared with the month before. It covers income, expenses, net, savings rate, the biggest expense, goals and investing. It is also saved as a bell card.
- **Trade closed:** a Telegram push with PnL, ROI and how long the trade was open.
- **Push settings:** `GET/PATCH /notifications/preferences` for `monthly_digest` and `trade_closed`. If there is no saved setting, the push is on, so new types are on by default.
- Push language comes from the stored Telegram `language_code`. If none is stored, Russian is used.

### 10. Telegram bot

- In production, the bot runs in **webhook** mode: Telegram → `POST /api/bot/webhook`. This route always returns 200 so Telegram does not resend updates; errors are logged.
- `/start` finds or creates the user by `telegramId` and shows the menu: view categories, add a category, add income, add an expense, stats. The Telegram `@username` and `language_code` are updated on every interaction.
- Multi-step input is a simple step-by-step flow whose current step is saved in the `user_states` table. For example: `addexpense:waiting_amount` → `waiting_description`. The date is today in the user's timezone, and the currency is the user's.
- Stats: pick the type → category → period → whether to show details. Totals are shown in the base currency, and each item in its own currency. Long replies are split to stay under Telegram's 4096-character limit.
- 34 languages ([src/bot/i18n/locales/](src/bot/i18n/locales/)), picked from `language_code`. If it is missing, Russian is used. If the language is not supported, English is used. Menu buttons are recognized in every language.

### 11. Admin panel

`ADMIN` routes (`@Roles(Role.ADMIN)` + `RolesGuard`):
- `/admin/users`: users with their login methods, plan and activity counts. Admins can block or unblock a user, change their plan and expiry, or delete them (this deletes all of their data).
- `/admin/plans`: create, edit, archive, unarchive and delete plans (see [§2](#2-plans-and-limits)).

The owner account is made admin by a data migration.

### 12. Background jobs

| When               | Job                                             | Where                                                                     |
| ------------------ | ----------------------------------------------- | ------------------------------------------------------------------------- |
| every 2 min        | Bybit sync (trades, balances, imports, P2P ≤ 30 min, pushes) | [investing-sync.service.ts](src/modules/investing/investing-sync.service.ts) |
| daily 01:00        | Save the day's FX rates to `fx_rates`            | [fx-rates.service.ts](src/modules/currency/fx-rates.service.ts)           |
| daily 03:00 (host cron) | Encrypted `pg_dump` sent to Telegram        | [scripts/backup-db.sh](scripts/backup-db.sh)                              |
| daily 04:00        | Delete unverified, empty password accounts      | [account-cleanup.service.ts](src/modules/auth/account-cleanup.service.ts) |
| 1st of month 09:00 | Monthly digest to Telegram and the bell         | [monthly-digest.service.ts](src/modules/notifications/monthly-digest.service.ts) |

Times use the server's timezone. The in-app crons run inside the single app process, so do not run more than one app replica unless you add locking.

---

## 🚀 Getting started

### Prerequisites

- [Docker](https://www.docker.com/) and Docker Compose
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- [ngrok](https://ngrok.com/): Telegram webhooks need HTTPS, so each developer needs their own ngrok tunnel **and** their own bot

### 1. Configure `.env`

```env
# --- required ---
DATABASE_URL=postgresql://postgres:postgres@db:5432/expense_accounting
JWT_SECRET=at-least-32-characters-long-secret....
GOOGLE_CLIENT_ID=your-google-oauth-client-id

# --- app ---
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173          # comma-separated allow-list
FRONTEND_URL=http://localhost:5173         # used for links in emails

# --- Telegram ---
BOT_TOKEN=123456:ABC...
WEBHOOK_URL=https://your-subdomain.ngrok-free.app

# --- investing (optional; the section is off without it) ---
ENCRYPTION_KEY=                            # openssl rand -hex 32
BYBIT_API_URL=                             # e.g. https://api.bytick.com where api.bybit.com is blocked
BYBIT_ICON_API_KEY=                        # separate read-only key, used only for coin icons
BYBIT_ICON_API_SECRET=

# --- email (optional; if unset, links are logged instead of sent) ---
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_SECURE=
MAIL_FROM=
```

The env is checked at startup against [src/config/env.schema.ts](src/config/env.schema.ts), and the app will not start if it is invalid. `CORS_ORIGIN` is read directly in [main.ts](src/main.ts). The backup script also needs `BACKUP_CHAT_ID` and `AGE_RECIPIENT` (see [scripts/README.md](scripts/README.md)).

### 2. Run

```bash
make dev           # build and start app + Postgres, apply migrations, follow logs
make set-webhook   # point Telegram at $WEBHOOK_URL/bot/webhook
```

Swagger UI is at **http://localhost:3000/api/docs** (not available in production).

### 3. Database

Every schema change goes through Prisma migrations ([prisma/schema.prisma](prisma/schema.prisma), [prisma/migrations/](prisma/migrations/)). Reference data such as plans and the owner's admin role is also set by migrations, so production needs nothing but `migrate deploy`.

```bash
make migrate                     # prisma migrate dev
make migrate-create name=add_x   # new named migration
make migrate-deploy              # apply pending (production path)
make migrate-status
make db-studio                   # Prisma Studio on http://localhost:5555
make refresh-deps                # recreate the node_modules volume after package.json changes
```

### Local commands (without Docker)

```bash
bun install
bun run start:dev     # watch mode from src/
bun run build         # nest build → dist/
bun run start:prod    # bun dist/main.js

bun run lint          # Biome check (lint:fix / format to fix)
bun run typecheck     # TS 7 (tsgo), types only
bun run test          # unit tests (bun test src)
bun run test:e2e      # e2e (bun test test)
```

### Maintenance scripts

- `scripts/backfill-fx-rates.ts [--dry-run]` fills in historical FX rates and recalculates `amount_usd` at each operation's own date.
- `scripts/backup-db.sh` makes a daily encrypted (`age`) Postgres dump and sends it to a Telegram DM.
- `scripts/probe-bybit-wallet.ts` is a debugging helper for Bybit wallet responses.

---

## 📖 API overview

Full, current documentation is in Swagger (`/api/docs`). All paths below start with `/api`. 🔓 = public, 👑 = admin, 💎 = investing plan.

| Area            | Routes                                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Auth            | 🔓 `POST auth/register · login · google · telegram · refresh · logout · confirm-email · forgot-password · reset-password` |
| Profile         | `GET/PATCH auth/me` · `POST auth/me/credentials · resend-email-confirmation · link/google · link/telegram`              |
| Plan            | `GET subscriptions/usage`                                                                                               |
| Categories      | `expense-categories`, `income-categories`: CRUD + `GET …/stats`                                                         |
| Expenses/Income | `expenses`, `incomes`: CRUD, bulk `DELETE`, `GET …/summary`, `GET …/stat`                                              |
| Feed & balance  | `GET transactions` · `GET transactions/balance`                                                                         |
| Exchanges       | `exchanges`: CRUD                                                                                                       |
| Goals           | `goals`: CRUD · `goals/:id/contributions`: list, add, edit, delete                                                     |
| Notifications   | `GET notifications` · `POST notifications/:id/read · read-all` · `GET/PATCH notifications/preferences[/:type]`         |
| Investing 💎    | `accounts` (+ `:id/sync`) · `venues` (+ `adjustments`) · `transfers` (+ `:id/classify`) · `p2p-orders` · `positions` (+ `summary`, `equity-curve`, `symbols`, `:id/notes`) · `trades` · `holdings` · `assets` · `coin-icons` |
| Admin 👑        | `admin/users` (block, unblock, plan, delete) · `admin/plans` (CRUD, archive, unarchive) · `users` (raw CRUD)             |
| Bot             | 🔓 `POST bot/webhook` (called by Telegram only)                                                                        |

---

## 🚢 Deployment (CI/CD)

A push to `main` (or a manual run) starts [.github/workflows/deploy.yml](.github/workflows/deploy.yml):

```
push to main
  └─ test job:   bun install → prisma generate → lint → typecheck (tsgo) → bun test → build
  └─ deploy job: docker build (multi-stage) → ghcr.io/<owner>/limebalance:{latest,sha}
                 └─ SSH to VPS (/opt/limebalance):
                      docker pull
                      docker run --rm … bun run migration:run      # prisma migrate deploy
                      docker stop/rm limebalance && docker run -d --restart unless-stopped --network host
                      docker image prune (> 72h)
```

The [Dockerfile](Dockerfile) has three stages:
- `builder` compiles TS into `dist/` and fails if `dist/main.js` is missing.
- `development` is used by `docker compose`.
- `production` contains only prod dependencies, the Prisma client and `dist/`.

On the VPS, the app runs behind nginx (hence `trustProxy: 'loopback'`) and reads `/opt/limebalance/.env`.

---

## 📂 Project structure

```
src/
├── main.ts                   # Fastify bootstrap: CORS, cookies, ValidationPipe, /api prefix, Swagger
├── app.module.ts             # module wiring, global Throttler + JWT guards, ScheduleModule
├── config/env.schema.ts      # Zod env schema
├── prisma/                   # PrismaService (pg adapter)
├── common/                   # timezone → currency, timezone utils, shared DTOs
├── bot/                      # grammY bot: service (router), state (FSM), handlers, i18n (34 locales)
└── modules/
    ├── auth/                 # register/login/Google/Telegram, tokens, email flows, guards, cleanup cron
    ├── users/                # user lookup/creation, profile
    ├── subscriptions/        # effective plan, limits, InvestingAccessGuard
    ├── admin/                # user & plan management
    ├── expense-categories/   # + income-categories/
    ├── expenses/             # + incomes/ (CRUD, summaries, bot stats)
    ├── transactions/         # unified feed + balance
    ├── currency/             # live rates, historical fx_rates, summary aggregation
    ├── exchanges/            # currency exchanges
    ├── goals/                # goals & contributions
    ├── investing/            # Bybit client & sync, diary, venues, transfers, P2P, holdings, prices
    ├── notifications/        # bell, bot push preferences, monthly digest
    └── mail/                 # SMTP emails (confirmation, password reset)
prisma/                       # schema.prisma + migrations (incl. data/seed migrations)
scripts/                      # backup, FX backfill, Bybit probe
test/                         # e2e
```

---

## 📝 License

This project is **private and unlicensed** (`UNLICENSED`).

<p align="center"><sub>Built with NestJS, Prisma &amp; grammY by Elijah Pavlov.</sub></p>
