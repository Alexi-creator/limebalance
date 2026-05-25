import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.plan.upsert({
    where: { name: 'free' },
    update: {},
    create: {
      name: 'free',
      maxCategories: 3,
      maxExpenses: 50,
      maxIncomes: 50,
      price: 0,
    },
  });

  await prisma.plan.upsert({
    where: { name: 'pro' },
    update: {},
    create: {
      name: 'pro',
      maxCategories: 15,
      maxExpenses: null,
      maxIncomes: null,
      price: 0,
    },
  });

  await prisma.plan.upsert({
    where: { name: 'ultra' },
    update: {},
    create: {
      name: 'ultra',
      maxCategories: null,
      maxExpenses: null,
      maxIncomes: null,
      price: 0,
    },
  });
}

main()
  .catch((e) => { process.stderr.write(`${e}\n`); process.exit(1); })
  .finally(() => prisma.$disconnect());
