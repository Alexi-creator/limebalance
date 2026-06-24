import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Plans differ by feature access (investing / crypto section), not by record limits.
// All plans are unlimited (max* = null); the gate is `investingAccess`.
const PLANS = [
  { name: 'free', price: 0, investingAccess: false }, // unlimited, no investing section
  { name: 'pro', price: 12, investingAccess: true }, // $12 / month
  { name: 'ultra', price: 100, investingAccess: true }, // $100 lifetime
];

async function main() {
  for (const plan of PLANS) {
    const data = {
      maxCategories: null,
      maxExpenses: null,
      maxIncomes: null,
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
