import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  BOT_TOKEN: z.string().optional(),
  WEBHOOK_URL: z.url().optional(),
  JWT_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().min(1),

  // Frontend base URL — used to build links in emails (email confirmation, password reset).
  FRONTEND_URL: z.url().optional(),

  // SMTP for sending emails. If unset — emails aren't sent, the link is logged instead (handy for dev).
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: z.coerce.boolean().optional(),
  MAIL_FROM: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;
