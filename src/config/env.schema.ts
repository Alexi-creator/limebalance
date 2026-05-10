import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  BOT_TOKEN: z.string().optional(),
  WEBHOOK_URL: z.url().optional(),
  JWT_SECRET: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(32).optional()),
  GOOGLE_CLIENT_ID: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;
