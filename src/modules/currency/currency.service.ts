import { Injectable, Logger } from '@nestjs/common';

// Курсы относительно USD: rates[X] = сколько единиц X за 1 USD.
type Rates = Record<string, number>;

const BASE = 'USD';
const TTL_MS = 12 * 60 * 60 * 1000; // 12 часов
const ENDPOINT = `https://open.er-api.com/v6/latest/${BASE}`;

@Injectable()
export class CurrencyService {
  private readonly logger = new Logger(CurrencyService.name);
  private cache: { rates: Rates; fetchedAt: number } | null = null;
  private inflight: Promise<Rates | null> | null = null;

  // Актуальные курсы с кэшем в памяти. null, если получить не удалось и кэша нет.
  async getRates(): Promise<Rates | null> {
    if (this.cache && Date.now() - this.cache.fetchedAt < TTL_MS) {
      return this.cache.rates;
    }
    // Не плодим параллельные запросы к API.
    if (this.inflight) return this.inflight;
    this.inflight = this.fetchRates().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async fetchRates(): Promise<Rates | null> {
    try {
      const res = await fetch(ENDPOINT);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { result?: string; rates?: Rates };
      if (data.result !== 'success' || !data.rates)
        throw new Error('Некорректный ответ API курсов');
      this.cache = { rates: data.rates, fetchedAt: Date.now() };
      return data.rates;
    } catch (err) {
      this.logger.warn(`Не удалось получить курсы валют: ${err}`);
      // Отдаём устаревший кэш, если он есть, иначе null.
      return this.cache?.rates ?? null;
    }
  }

  // Чистая конвертация по уже полученным курсам. null, если валюта неизвестна.
  convertWithRates(rates: Rates, amount: number, from: string, to: string): number | null {
    if (from === to) return amount;
    const fromRate = from === BASE ? 1 : rates[from];
    const toRate = to === BASE ? 1 : rates[to];
    if (!fromRate || !toRate) return null;
    return (amount / fromRate) * toRate;
  }

  // Разовая конвертация одной суммы. null, если курсы недоступны или валюта неизвестна.
  async convert(amount: number, from: string, to: string): Promise<number | null> {
    if (from === to) return amount;
    const rates = await this.getRates();
    if (!rates) return null;
    return this.convertWithRates(rates, amount, from, to);
  }

  // Сводит набор сумм в базовую валюту через USD-снапшот (amountUsd).
  // Для строк без снапшота (amountUsd === null) — фолбэк по текущему курсу.
  // Возвращает null, если курсы недоступны или встретилась неизвестная валюта.
  approxTotalInBase(
    rows: { amount: number; currency: string; amountUsd: number | null }[],
    baseCurrency: string,
    rates: Rates | null,
  ): number | null {
    if (rows.length === 0) return 0;
    if (!rates) return null;

    let usdSum = 0;
    for (const r of rows) {
      const usd =
        r.amountUsd != null
          ? r.amountUsd
          : this.convertWithRates(rates, r.amount, r.currency, BASE);
      if (usd === null) return null;
      usdSum += usd;
    }

    const inBase = this.convertWithRates(rates, usdSum, BASE, baseCurrency);
    if (inBase === null) return null;
    // Округляем до 2 знаков — это всё равно оценка.
    return Math.round(inBase * 100) / 100;
  }
}
