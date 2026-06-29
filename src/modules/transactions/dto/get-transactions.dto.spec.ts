import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common';
import { GetTransactionsDto } from './get-transactions.dto';

// Mirrors the production pipe (see main.ts) so the test exercises the real transform + validation path.
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const meta: ArgumentMetadata = { type: 'query', metatype: GetTransactionsDto };

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-9222-222222222222';

const run = (query: Record<string, unknown>) =>
  pipe.transform(query, meta) as Promise<GetTransactionsDto>;

describe('GetTransactionsDto — categoryId', () => {
  it('wraps a single categoryId into an array', async () => {
    const dto = await run({ categoryId: A });
    expect(dto.categoryId).toEqual([A]);
  });

  it('keeps multiple categoryId values as an array (?categoryId=a&categoryId=b)', async () => {
    const dto = await run({ categoryId: [A, B] });
    expect(dto.categoryId).toEqual([A, B]);
  });

  it('leaves categoryId undefined when omitted', async () => {
    const dto = await run({ type: 'expense' });
    expect(dto.categoryId).toBeUndefined();
  });

  it('rejects a non-UUID value', async () => {
    await expect(run({ categoryId: 'not-a-uuid' })).rejects.toThrow(BadRequestException);
  });

  it('rejects when any value in the list is not a UUID', async () => {
    await expect(run({ categoryId: [A, 'nope'] })).rejects.toThrow(BadRequestException);
  });
});

describe('GetTransactionsDto — currency', () => {
  it('wraps a single currency into an array', async () => {
    const dto = await run({ currency: 'AED' });
    expect(dto.currency).toEqual(['AED']);
  });

  it('keeps multiple currency values as an array (?currency=THB&currency=AED)', async () => {
    const dto = await run({ currency: ['THB', 'AED'] });
    expect(dto.currency).toEqual(['THB', 'AED']);
  });

  it('leaves currency undefined when omitted', async () => {
    const dto = await run({ type: 'expense' });
    expect(dto.currency).toBeUndefined();
  });

  it('rejects a malformed ISO 4217 code', async () => {
    await expect(run({ currency: 'usd' })).rejects.toThrow(BadRequestException);
  });

  it('rejects when any value in the list is malformed', async () => {
    await expect(run({ currency: ['THB', 'EU'] })).rejects.toThrow(BadRequestException);
  });
});
