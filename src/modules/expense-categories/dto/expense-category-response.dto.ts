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

export class ExpenseCategoryStatDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  id: string;

  @ApiProperty({ example: 'Продукты' })
  name: string;

  @ApiProperty({ example: '🛒', nullable: true })
  emoji: string | null;

  @ApiProperty({ example: 1234.56, description: 'Сумма расходов по категории за период' })
  total: number;

  @ApiProperty({ example: 7, description: 'Количество операций по категории за период' })
  count: number;
}
