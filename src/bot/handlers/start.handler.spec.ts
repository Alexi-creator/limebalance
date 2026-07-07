import { Test } from '@nestjs/testing';
import type { Context } from 'grammy';
import { UsersService } from '../../modules/users/users.service';
import { StartHandler } from './start.handler';

describe('StartHandler', () => {
  let handler: StartHandler;
  let users: { findOrCreateByTelegramId: jest.Mock };
  let reply: jest.Mock;

  const ctx = (from?: { id: number }) => ({ from, reply }) as unknown as Context;

  beforeEach(async () => {
    users = { findOrCreateByTelegramId: jest.fn() };
    reply = jest.fn();

    const module = await Test.createTestingModule({
      providers: [StartHandler, { provide: UsersService, useValue: users }],
    }).compile();

    handler = module.get(StartHandler);
  });

  it('ignores updates without a sender', async () => {
    await handler.handle(ctx(undefined));
    expect(users.findOrCreateByTelegramId).not.toHaveBeenCalled();
    expect(reply).not.toHaveBeenCalled();
  });

  it('greets a brand-new user', async () => {
    users.findOrCreateByTelegramId.mockResolvedValue({ isNew: true });
    await handler.handle(ctx({ id: 7 }));
    expect(users.findOrCreateByTelegramId).toHaveBeenCalledWith(7n, undefined, null);
    expect(reply.mock.calls[0][0]).toContain('Добро пожаловать');
  });

  it('welcomes a returning user', async () => {
    users.findOrCreateByTelegramId.mockResolvedValue({ isNew: false });
    await handler.handle(ctx({ id: 7 }));
    expect(reply.mock.calls[0][0]).toContain('С возвращением');
  });
});
