import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class IncomeCategoryResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  id: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'ID владельца' })
  userId: string;

  @ApiProperty({ example: 'Зарплата' })
  name: string;

  @ApiProperty({ example: '💰', nullable: true, description: 'Эмодзи категории или null' })
  emoji: string | null;

  @ApiProperty({ example: '2026-06-01T08:00:00.000Z', format: 'date-time' })
  createdAt: Date;
}

export class IncomeCurrencyTotalDto {
  @ApiProperty({ example: 'THB', description: 'Код валюты' })
  currency: string;

  @ApiProperty({ example: 50000, description: 'Сумма доходов в этой валюте за период' })
  total: number;

  @ApiProperty({ example: 3, description: 'Количество операций в этой валюте за период' })
  count: number;
}

export class IncomeCategoryStatDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  id: string;

  @ApiProperty({ example: 'Зарплата' })
  name: string;

  @ApiProperty({ example: '💰', nullable: true })
  emoji: string | null;

  @ApiProperty({
    example: 3,
    description: 'Всего операций по категории за период (по всем валютам)',
  })
  count: number;

  @ApiProperty({
    type: [IncomeCurrencyTotalDto],
    description: 'Суммы по каждой валюте отдельно (разные валюты не складываются)',
  })
  totals: IncomeCurrencyTotalDto[];

  @ApiProperty({ example: 'USD', description: 'Базовая валюта пользователя для approxTotal' })
  baseCurrency: string;

  @ApiProperty({
    example: 1527.7,
    nullable: true,
    description:
      'Приблизительная сумма в базовой валюте по текущему курсу. null, если курсы недоступны.',
  })
  approxTotal: number | null;

  @ApiPropertyOptional({
    example: 1400.0,
    nullable: true,
    description:
      'Итог за предыдущий период в базовой валюте. Присутствует только при compareFrom/compareTo.',
  })
  previousApproxTotal?: number | null;

  @ApiPropertyOptional({
    example: 127.7,
    nullable: true,
    description:
      'Разница с предыдущим периодом (approxTotal − previousApproxTotal). Присутствует только при сравнении.',
  })
  deltaApproxTotal?: number | null;
}
