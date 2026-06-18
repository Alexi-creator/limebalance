import { Test } from '@nestjs/testing';
import type { Context } from 'grammy';
import { ExpenseCategoriesService } from '../../modules/expense-categories/expense-categories.service';
import { ExpensesService } from '../../modules/expenses/expenses.service';
import { UsersService } from '../../modules/users/users.service';
import { StateService } from '../state.service';
import { ExpenseHandler } from './expense.handler';

describe('ExpenseHandler', () => {
  let handler: ExpenseHandler;
  let cats: { findAllByUser: jest.Mock; findOne: jest.Mock };
  let expenses: { create: jest.Mock };
  let users: { getTimezone: jest.Mock };
  let state: { set: jest.Mock; get: jest.Mock; reset: jest.Mock };
  let reply: jest.Mock;

  const ctx = () => ({ reply }) as unknown as Context;

  beforeEach(async () => {
    cats = { findAllByUser: jest.fn(), findOne: jest.fn() };
    expenses = { create: jest.fn() };
    users = { getTimezone: jest.fn().mockResolvedValue('UTC') };
    state = { set: jest.fn(), get: jest.fn(), reset: jest.fn() };
    reply = jest.fn();

    const module = await Test.createTestingModule({
      providers: [
        ExpenseHandler,
        { provide: ExpenseCategoriesService, useValue: cats },
        { provide: ExpensesService, useValue: expenses },
        { provide: UsersService, useValue: users },
        { provide: StateService, useValue: state },
      ],
    }).compile();

    handler = module.get(ExpenseHandler);
  });

  describe('handleAdd', () => {
    it('asks to create a category first when there are none', async () => {
      cats.findAllByUser.mockResolvedValue([]);
      await handler.handleAdd(ctx(), 'u1');
      expect(reply.mock.calls[0][0]).toContain('добавьте хотя бы одну категорию');
    });

    it('offers the categories when present', async () => {
      cats.findAllByUser.mockResolvedValue([{ id: 'c1', name: 'Food' }]);
      await handler.handleAdd(ctx(), 'u1');
      expect(reply.mock.calls[0][0]).toBe('Выберите категорию:');
    });
  });

  describe('handleCategorySelected', () => {
    it('stores the chosen category and waits for an amount', async () => {
      cats.findOne.mockResolvedValue({ name: 'Food' });
      await handler.handleCategorySelected(ctx(), 'u1', 'c1');
      expect(state.set).toHaveBeenCalledWith('u1', {
        step: 'addexpense:waiting_amount',
        categoryId: 'c1',
        categoryName: 'Food',
      });
    });
  });

  describe('handleAmountInput', () => {
    it('rejects a non-numeric / non-positive amount without advancing', async () => {
      await handler.handleAmountInput(ctx(), 'u1', 'abc');
      expect(state.set).not.toHaveBeenCalled();
      expect(reply.mock.calls[0][0]).toContain('корректную сумму');
    });

    it('accepts a comma decimal and advances to the description step', async () => {
      await handler.handleAmountInput(ctx(), 'u1', '1500,50');
      expect(state.set).toHaveBeenCalledWith('u1', {
        step: 'addexpense:waiting_description',
        amount: 1500.5,
      });
    });
  });

  describe('handleDescriptionInput', () => {
    it('resets and warns when the state is incomplete', async () => {
      state.get.mockResolvedValue({ categoryId: null, amount: null });
      await handler.handleDescriptionInput(ctx(), 'u1', 'lunch');
      expect(expenses.create).not.toHaveBeenCalled();
      expect(state.reset).toHaveBeenCalledWith('u1');
      expect(reply.mock.calls[0][0]).toContain('Что-то пошло не так');
    });

    it('creates the expense, resets state and confirms', async () => {
      state.get.mockResolvedValue({ categoryId: 'c1', categoryName: 'Food', amount: 500 });
      await handler.handleDescriptionInput(ctx(), 'u1', 'lunch');
      expect(expenses.create).toHaveBeenCalledWith('u1', {
        categoryId: 'c1',
        amount: 500,
        description: 'lunch',
        date: expect.any(Date),
      });
      expect(state.reset).toHaveBeenCalledWith('u1');
      expect(reply.mock.calls[0][0]).toContain('Трата добавлена');
    });
  });
});
