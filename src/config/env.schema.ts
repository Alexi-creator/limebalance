import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  BOT_TOKEN: z.string().optional(),
  WEBHOOK_URL: z.url().optional(),
  JWT_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().optional(),

  // Базовый адрес фронтенда — из него собираются ссылки в письмах (подтверждение почты, сброс пароля).
  FRONTEND_URL: z.url().optional(),

  // SMTP для отправки писем. Если не задан — письма не шлются, ссылка пишется в лог (удобно для dev).
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: z.coerce.boolean().optional(),
  MAIL_FROM: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;
