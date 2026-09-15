import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'bun prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
    // Only used by `prisma migrate diff --from-migrations` and `migrate dev`, which replay the
    // migration history into a throwaway database. Never touched at runtime.
    shadowDatabaseUrl: process.env['SHADOW_DATABASE_URL'],
  },
});
