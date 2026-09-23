import type { Prisma } from '@prisma/client';

type Db = Prisma.TransactionClient;
type Link = { incomeId: { in: string[] } } | { expenseId: { in: string[] } };

/**
 * Puts the venue movements tied to these incomes or expenses back up for review.
 *
 * Such a pair is one event seen from two sides — the income puts the money into the wallet and
 * the transfer takes it straight on to the venue. Deleting only the income would leave the
 * transfer taking money out of a wallet it never reached. So the transfer goes back to what it was
 * on import: someone else's money until explained, valued at what actually arrived.
 */
export async function reopenLinkedTransfers(db: Db, link: Link): Promise<void> {
  const rows = await db.investingTransfer.findMany({
    where: link,
    select: { id: true, amountUsd: true },
  });
  for (const row of rows) {
    await db.investingTransfer.update({
      where: { id: row.id },
      data: {
        peer: 'EXTERNAL',
        amount: Number(row.amountUsd ?? 0),
        currency: 'USD',
        needsReview: true,
        incomeId: null,
        expenseId: null,
      },
    });
  }
}

/**
 * Keeps the transfer of an income or expense in step with it: change the income and the money
 * moved on to the venue changes with it, or the wallet would stop netting to zero.
 */
export async function syncLinkedTransfer(
  db: Db,
  link: { incomeId: string } | { expenseId: string },
  amount: number,
  currency: string,
): Promise<void> {
  await db.investingTransfer.updateMany({ where: link, data: { amount, currency } });
}
