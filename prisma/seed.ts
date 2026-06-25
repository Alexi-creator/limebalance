import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Free is gated both by feature access (no investing section) and by combined usage caps:
// 5 categories total (lifetime) and 20 transactions per calendar month. Paid plans are unlimited.
const PLANS = [
  { name: 'free', price: 0, investingAccess: false, maxCategories: 5, maxTransactionsPerMonth: 20 },
  { name: 'pro', price: 12, investingAccess: true, maxCategories: null, maxTransactionsPerMonth: null }, // $12 / month
  { name: 'ultra', price: 100, investingAccess: true, maxCategories: null, maxTransactionsPerMonth: null }, // $100 lifetime
];

async function main() {
  for (const plan of PLANS) {
    const data = {
      maxCategories: plan.maxCategories,
      maxTransactionsPerMonth: plan.maxTransactionsPerMonth,
      price: plan.price,
      investingAccess: plan.investingAccess,
    };

    await prisma.plan.upsert({
      where: { name: plan.name },
      update: data,
      create: { name: plan.name, ...data },
    });
  }

  // Grant the owner the top (ultra) plan forever. Set OWNER_EMAIL to your account's email.
  const ownerEmail = process.env.OWNER_EMAIL;
  if (ownerEmail) {
    const owner = await prisma.user.findUnique({ where: { email: ownerEmail } });

    if (owner) {
      const ultra = await prisma.plan.findUniqueOrThrow({ where: { name: 'ultra' } });
      await prisma.userSubscription.upsert({
        where: { userId: owner.id },
        update: { planId: ultra.id, expiresAt: null },
        create: { userId: owner.id, planId: ultra.id, expiresAt: null },
      });
    } else {
      process.stderr.write(`OWNER_EMAIL ${ownerEmail} not found — skipping ultra grant\n`);
    }
  }
}

main()
  .catch((e) => {
    process.stderr.write(`${e}\n`);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
