import { ApiProperty } from '@nestjs/swagger';

export class ExpenseCategoryResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  id: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'ID владельца' })
  userId: string;

  @ApiProperty({ example: 'Продукты' })
  name: string;

  @ApiProperty({ example: '🛒', nullable: true, description: 'Эмодзи категории или null' })
  emoji: string | null;

  @ApiProperty({ example: '2026-06-01T08:00:00.000Z', format: 'date-time' })
  createdAt: Date;
}

export class CategoryCurrencyTotalDto {
  @ApiProperty({ example: 'THB', description: 'Код валюты' })
  currency: string;

  @ApiProperty({ example: 5000, description: 'Сумма расходов в этой валюте за период' })
  total: number;

  @ApiProperty({ example: 10, description: 'Количество операций в этой валюте за период' })
  count: number;
}

export class ExpenseCategoryStatDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  id: string;

  @ApiProperty({ example: 'Продукты' })
  name: string;

  @ApiProperty({ example: '🛒', nullable: true })
  emoji: string | null;

  @ApiProperty({
    example: 7,
    description: 'Всего операций по категории за период (по всем валютам)',
  })
  count: number;

  @ApiProperty({
    type: [CategoryCurrencyTotalDto],
    description: 'Суммы по каждой валюте отдельно (разные валюты не складываются)',
  })
  totals: CategoryCurrencyTotalDto[];

  @ApiProperty({ example: 'USD', description: 'Базовая валюта пользователя для approxTotal' })
  baseCurrency: string;

  @ApiProperty({
    example: 260.5,
    nullable: true,
    description:
      'Приблизительная сумма в базовой валюте по текущему курсу. null, если курсы недоступны.',
  })
  approxTotal: number | null;
}
