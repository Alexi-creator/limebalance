/**
 * Answers one question before we design around it: does the stored Bybit key let us read the
 * account's actual equity?
 *
 * If it does, a venue's value can simply be asked for every sync instead of accumulated from
 * deposits and PnL — which removes the whole class of "the number drifted and nobody knows why"
 * bugs. If it does not, the balance has to be accumulated and corrected by hand, and we need to
 * know that now rather than after building on the wrong assumption.
 *
 * Read-only: three GETs to Bybit, nothing is written anywhere. Secrets are decrypted in memory
 * and only ever printed masked.
 *
 * Locally (dev compose):
 *
 *   docker compose run --rm app bun scripts/probe-bybit-wallet.ts
 *
 * On the server, where only the built image exists — mount the file in and run it the same way
 * the deploy runs migrations (see .github/workflows/deploy.yml):
 *
 *   docker run --rm --env-file /opt/limebalance/.env --network host \
 *     -v /opt/limebalance/probe-bybit-wallet.ts:/app/probe.ts \
 *     ghcr.io/<owner>/<repo>:latest bun /app/probe.ts
 *
 * Add `--account <id>` to probe one specific account (default: every connected one).
 *
 * Deliberately self-contained — no imports from `src/`, which the production image does not ship.
 * Requires ENCRYPTION_KEY in the environment (same one the app uses) and the runner's IP to be
 * whitelisted on the key — a whitelist miss shows up as retCode 10010.
 */
import { createDecipheriv, createHmac } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/** Same AES-256-GCM format as investing/crypto.util.ts ("iv:tag:ciphertext", base64 parts),
 *  inlined so this file runs inside the production image, which ships only `dist`. */
function decryptSecret(payload: string, keyHex: string): string {
  const [iv, tag, data] = payload.split(':');
  if (!iv || !tag || !data) throw new Error('Malformed encrypted payload');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(keyHex, 'hex'),
    Buffer.from(iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString(
    'utf8',
  );
}

const BASE_URL = process.env.BYBIT_BASE_URL ?? 'https://api.bybit.com';
const RECV_WINDOW = '5000';

// Prisma 7 needs an explicit driver adapter, same as PrismaService.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const accountArg = process.argv.indexOf('--account');
const onlyAccount = accountArg === -1 ? undefined : process.argv[accountArg + 1];

type Creds = { apiKey: string; apiSecret: string };

async function get<T>(
  creds: Creds,
  path: string,
  params: Record<string, string> = {},
): Promise<{ ok: true; result: T } | { ok: false; code: number | string; message: string }> {
  const query = new URLSearchParams(params).toString();
  const timestamp = Date.now().toString();
  const signature = createHmac('sha256', creds.apiSecret)
    .update(timestamp + creds.apiKey + RECV_WINDOW + query)
    .digest('hex');

  try {
    const res = await fetch(`${BASE_URL}${path}${query ? `?${query}` : ''}`, {
      headers: {
        'X-BAPI-API-KEY': creds.apiKey,
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': RECV_WINDOW,
        'X-BAPI-SIGN': signature,
      },
    });
    const body = (await res.json()) as { retCode: number; retMsg: string; result: T };
    if (!res.ok) return { ok: false, code: res.status, message: `HTTP ${res.status}` };
    if (body.retCode !== 0) return { ok: false, code: body.retCode, message: body.retMsg };
    return { ok: true, result: body.result };
  } catch (err) {
    return { ok: false, code: 'network', message: String(err) };
  }
}

const mask = (key: string) => `••••${key.slice(-4)}`;

async function main() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY is not set — run this the same way the app runs.');

  const accounts = await prisma.exchangeAccount.findMany({
    where: { exchange: 'bybit', ...(onlyAccount ? { id: onlyAccount } : {}) },
    select: { id: true, label: true, apiKey: true, apiSecret: true, status: true },
  });
  if (accounts.length === 0) {
    console.log('No connected Bybit accounts.');
    return;
  }

  for (const account of accounts) {
    const creds: Creds = {
      apiKey: decryptSecret(account.apiKey, key),
      apiSecret: decryptSecret(account.apiSecret, key),
    };
    console.log(`\n=== ${account.label || account.id} (${mask(creds.apiKey)}, ${account.status})`);

    // 1. What the key is actually allowed to do — this is what decides the design.
    const info = await get<{ readOnly: number; permissions: Record<string, string[]> }>(
      creds,
      '/v5/user/query-api',
    );
    if (!info.ok) {
      console.log(`  key info FAILED — ${info.code}: ${info.message}`);
      if (info.code === 10010) console.log('  ^ IP not whitelisted for this key.');
      continue;
    }
    const granted = Object.entries(info.result.permissions ?? {})
      .filter(([, v]) => v.length > 0)
      .map(([k, v]) => `${k}(${v.join(',')})`);
    console.log(`  readOnly: ${info.result.readOnly === 1}`);
    console.log(`  permissions: ${granted.join(' ') || 'none'}`);

    // 2. The endpoint we would actually rely on: total equity of the unified account.
    const wallet = await get<{
      list: { totalEquity: string; totalWalletBalance: string; coin: unknown[] }[];
    }>(creds, '/v5/account/wallet-balance', { accountType: 'UNIFIED' });
    if (!wallet.ok) {
      console.log(`  wallet-balance FAILED — ${wallet.code}: ${wallet.message}`);
      console.log('  => accumulated mode: the balance has to be summed up and corrected by hand.');
      continue;
    }
    const row = wallet.result.list?.[0];
    console.log(`  wallet-balance OK — totalEquity=${row?.totalEquity} USD`);
    console.log(`                      totalWalletBalance=${row?.totalWalletBalance} USD`);
    console.log(`                      coins held: ${row?.coin?.length ?? 0}`);
    console.log('  => live mode: the venue value can be read every sync, nothing to drift.');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
