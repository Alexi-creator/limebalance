import { Test } from '@nestjs/testing';
import type { Context } from 'grammy';
import { IncomeCategoriesService } from '../../modules/income-categories/income-categories.service';
import { IncomesService } from '../../modules/incomes/incomes.service';
import { UsersService } from '../../modules/users/users.service';
import { StateService } from '../state.service';
import { IncomeHandler } from './income.handler';

describe('IncomeHandler', () => {
  let handler: IncomeHandler;
  let cats: { findAllByUser: jest.Mock; findOne: jest.Mock };
  let incomes: { create: jest.Mock };
  let users: { getTimezone: jest.Mock };
  let state: { set: jest.Mock; get: jest.Mock; reset: jest.Mock };
  let reply: jest.Mock;

  const ctx = () => ({ reply }) as unknown as Context;

  beforeEach(async () => {
    cats = { findAllByUser: jest.fn(), findOne: jest.fn() };
    incomes = { create: jest.fn() };
    users = { getTimezone: jest.fn().mockResolvedValue('UTC') };
    state = { set: jest.fn(), get: jest.fn(), reset: jest.fn() };
    reply = jest.fn();

    const module = await Test.createTestingModule({
      providers: [
        IncomeHandler,
        { provide: IncomeCategoriesService, useValue: cats },
        { provide: IncomesService, useValue: incomes },
        { provide: UsersService, useValue: users },
        { provide: StateService, useValue: state },
      ],
    }).compile();

    handler = module.get(IncomeHandler);
  });

  describe('handleAmountInput', () => {
    it('rejects a zero / negative amount', async () => {
      await handler.handleAmountInput(ctx(), 'u1', '-5');
      expect(state.set).not.toHaveBeenCalled();
      expect(reply.mock.calls[0][0]).toContain('корректную сумму');
    });

    it('advances to the description step on a valid amount', async () => {
      await handler.handleAmountInput(ctx(), 'u1', '50000');
      expect(state.set).toHaveBeenCalledWith('u1', {
        step: 'addincome:waiting_description',
        amount: 50000,
      });
    });
  });

  describe('handleDescriptionInput', () => {
    it('creates the income, resets and confirms', async () => {
      state.get.mockResolvedValue({ categoryId: 'c1', categoryName: 'Salary', amount: 50000 });
      await handler.handleDescriptionInput(ctx(), 'u1', 'May');
      expect(incomes.create).toHaveBeenCalledWith('u1', {
        categoryId: 'c1',
        amount: 50000,
        description: 'May',
        date: expect.any(Date),
      });
      expect(state.reset).toHaveBeenCalledWith('u1');
      expect(reply.mock.calls[0][0]).toContain('Доход добавлен');
    });

    it('bails out when state is incomplete', async () => {
      state.get.mockResolvedValue(null);
      await handler.handleDescriptionInput(ctx(), 'u1', 'May');
      expect(incomes.create).not.toHaveBeenCalled();
      expect(reply.mock.calls[0][0]).toContain('Что-то пошло не так');
    });
  });
});
