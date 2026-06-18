import { Test } from '@nestjs/testing';
import type { Context } from 'grammy';
import { ExpenseCategoriesService } from '../../modules/expense-categories/expense-categories.service';
import { IncomeCategoriesService } from '../../modules/income-categories/income-categories.service';
import { StateService } from '../state.service';
import { CategoryHandler } from './category.handler';

describe('CategoryHandler', () => {
  let handler: CategoryHandler;
  let expenseCats: { create: jest.Mock; findAllByUser: jest.Mock };
  let incomeCats: { create: jest.Mock; findAllByUser: jest.Mock };
  let state: { set: jest.Mock; reset: jest.Mock };
  let reply: jest.Mock;

  const ctx = () => ({ reply }) as unknown as Context;

  beforeEach(async () => {
    expenseCats = { create: jest.fn(), findAllByUser: jest.fn() };
    incomeCats = { create: jest.fn(), findAllByUser: jest.fn() };
    state = { set: jest.fn(), reset: jest.fn() };
    reply = jest.fn();

    const module = await Test.createTestingModule({
      providers: [
        CategoryHandler,
        { provide: ExpenseCategoriesService, useValue: expenseCats },
        { provide: IncomeCategoriesService, useValue: incomeCats },
        { provide: StateService, useValue: state },
      ],
    }).compile();

    handler = module.get(CategoryHandler);
  });

  describe('handleTypeSelected', () => {
    it('sets the expense name-waiting step', async () => {
      await handler.handleTypeSelected(ctx(), 'u1', 'expense');
      expect(state.set).toHaveBeenCalledWith('u1', { step: 'addcategory:expense:waiting_name' });
    });

    it('sets the income name-waiting step', async () => {
      await handler.handleTypeSelected(ctx(), 'u1', 'income');
      expect(state.set).toHaveBeenCalledWith('u1', { step: 'addcategory:income:waiting_name' });
    });
  });

  describe('handleNameInput', () => {
    it('creates an expense category for the expense step', async () => {
      await handler.handleNameInput(ctx(), 'u1', 'Food', 'addcategory:expense:waiting_name');
      expect(expenseCats.create).toHaveBeenCalledWith('u1', { name: 'Food' });
      expect(incomeCats.create).not.toHaveBeenCalled();
      expect(state.reset).toHaveBeenCalledWith('u1');
    });

    it('creates an income category otherwise', async () => {
      await handler.handleNameInput(ctx(), 'u1', 'Salary', 'addcategory:income:waiting_name');
      expect(incomeCats.create).toHaveBeenCalledWith('u1', { name: 'Salary' });
      expect(expenseCats.create).not.toHaveBeenCalled();
    });
  });

  describe('handleViewAll', () => {
    it('tells the user when there are no categories', async () => {
      expenseCats.findAllByUser.mockResolvedValue([]);
      incomeCats.findAllByUser.mockResolvedValue([]);
      await handler.handleViewAll(ctx(), 'u1');
      expect(reply.mock.calls[0][0]).toContain('нет категорий');
    });

    it('lists expense and income categories', async () => {
      expenseCats.findAllByUser.mockResolvedValue([{ name: 'Food' }]);
      incomeCats.findAllByUser.mockResolvedValue([{ name: 'Salary' }]);
      await handler.handleViewAll(ctx(), 'u1');
      const text = reply.mock.calls[0][0];
      expect(text).toContain('Расходы:');
      expect(text).toContain('1. Food');
      expect(text).toContain('Доходы:');
      expect(text).toContain('1. Salary');
    });
  });
});
