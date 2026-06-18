import { Test } from '@nestjs/testing';
import type { Context } from 'grammy';
import { ExpenseCategoriesService } from '../../modules/expense-categories/expense-categories.service';
import { ExpensesService } from '../../modules/expenses/expenses.service';
import { IncomeCategoriesService } from '../../modules/income-categories/income-categories.service';
import { IncomesService } from '../../modules/incomes/incomes.service';
import { StateService } from '../state.service';
import { StatHandler } from './stat.handler';

describe('StatHandler', () => {
  let handler: StatHandler;
  let expenseCats: { findAllByUser: jest.Mock };
  let incomeCats: { findAllByUser: jest.Mock };
  let expenses: { statSummary: jest.Mock; statDetails: jest.Mock };
  let incomes: { statSummary: jest.Mock; statDetails: jest.Mock };
  let state: { set: jest.Mock; get: jest.Mock; reset: jest.Mock };
  let reply: jest.Mock;

  const ctx = () => ({ reply }) as unknown as Context;
  const lastReply = () => reply.mock.calls.at(-1)?.[0];

  beforeEach(async () => {
    expenseCats = { findAllByUser: jest.fn() };
    incomeCats = { findAllByUser: jest.fn() };
    expenses = { statSummary: jest.fn(), statDetails: jest.fn() };
    incomes = { statSummary: jest.fn(), statDetails: jest.fn() };
    state = { set: jest.fn(), get: jest.fn(), reset: jest.fn() };
    reply = jest.fn();

    const module = await Test.createTestingModule({
      providers: [
        StatHandler,
        { provide: ExpenseCategoriesService, useValue: expenseCats },
        { provide: IncomeCategoriesService, useValue: incomeCats },
        { provide: ExpensesService, useValue: expenses },
        { provide: IncomesService, useValue: incomes },
        { provide: StateService, useValue: state },
      ],
    }).compile();

    handler = module.get(StatHandler);
  });

  describe('handleTypeSelected', () => {
    it('asks to add a category first when none exist', async () => {
      expenseCats.findAllByUser.mockResolvedValue([]);
      await handler.handleTypeSelected(ctx(), 'u1', 'expense');
      expect(lastReply()).toContain('категорию расходов');
    });

    it('offers the income categories when present', async () => {
      incomeCats.findAllByUser.mockResolvedValue([{ id: 'c1', name: 'Salary', emoji: null }]);
      await handler.handleTypeSelected(ctx(), 'u1', 'income');
      expect(lastReply()).toBe('Выберите категорию:');
    });
  });

  describe('handleCategorySelected', () => {
    it('stores the category id for a specific category', async () => {
      await handler.handleCategorySelected(ctx(), 'u1', 'c1', 'expense');
      expect(state.set).toHaveBeenCalledWith('u1', {
        step: 'stat:expense:waiting_for_period',
        categoryId: 'c1',
      });
      expect(lastReply()).toBe('Выберите период:');
    });

    it('omits the category id for "all"', async () => {
      await handler.handleCategorySelected(ctx(), 'u1', 'all', 'income');
      expect(state.set).toHaveBeenCalledWith('u1', { step: 'stat:income:waiting_for_period' });
    });
  });

  describe('handlePeriodSelected', () => {
    it('derives the type from the step and waits for the details choice', async () => {
      state.get.mockResolvedValue({ step: 'stat:income:waiting_for_period' });
      await handler.handlePeriodSelected(ctx(), 'u1', 'month');
      expect(state.set).toHaveBeenCalledWith('u1', {
        step: 'stat:income:waiting_for_details',
        period: 'month',
      });
      expect(lastReply()).toContain('детализация');
    });
  });

  describe('handleDetailsSelected', () => {
    it('bails out when the period is missing from state', async () => {
      state.get.mockResolvedValue({ step: 'stat:expense:waiting_for_details' });
      await handler.handleDetailsSelected(ctx(), 'u1', false);
      expect(expenses.statSummary).not.toHaveBeenCalled();
      expect(lastReply()).toContain('Что-то пошло не так');
    });

    it('reports an empty summary nicely', async () => {
      state.get.mockResolvedValue({ step: 'stat:expense:waiting_for_details', period: 'month' });
      expenses.statSummary.mockResolvedValue({ baseCurrency: 'USD', total: 0, items: [] });
      await handler.handleDetailsSelected(ctx(), 'u1', false);
      expect(lastReply()).toContain('трат нет');
    });

    it('renders an expense summary with the per-category totals', async () => {
      state.get.mockResolvedValue({ step: 'stat:expense:waiting_for_details', period: 'month' });
      expenses.statSummary.mockResolvedValue({
        baseCurrency: 'USD',
        total: 150,
        items: [
          { category: 'Food', emoji: '🍔', total: 100 },
          { category: 'Taxi', emoji: null, total: 50 },
        ],
      });
      await handler.handleDetailsSelected(ctx(), 'u1', false);
      const text = lastReply();
      expect(text).toContain('Траты:');
      expect(text).toContain('🍔 Food');
      expect(text).toContain('Итого:');
      expect(state.reset).toHaveBeenCalledWith('u1');
    });

    it('uses statDetails for the income detailed view', async () => {
      state.get.mockResolvedValue({ step: 'stat:income:waiting_for_details', period: 'week' });
      incomes.statDetails.mockResolvedValue({
        baseCurrency: 'USD',
        total: 5000,
        categories: [
          {
            category: 'Salary',
            emoji: '💰',
            total: 5000,
            items: [
              { date: new Date('2026-06-01'), amount: 5000, currency: 'USD', description: 'May' },
            ],
          },
        ],
      });
      await handler.handleDetailsSelected(ctx(), 'u1', true);
      expect(incomes.statDetails).toHaveBeenCalledWith('u1', null, 'week');
      expect(lastReply()).toContain('Доходы с детализацией');
    });
  });
});
