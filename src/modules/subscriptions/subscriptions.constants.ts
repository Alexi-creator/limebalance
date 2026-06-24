import { Prisma } from '@prisma/client';

// Every new user starts on the free plan.
export const FREE_PLAN_NAME = 'free';

// Nested write attached to user.create so a free subscription is created atomically with the user.
export const FREE_SUBSCRIPTION: Prisma.UserCreateInput['subscription'] = {
  create: { plan: { connect: { name: FREE_PLAN_NAME } } },
};
