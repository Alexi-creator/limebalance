import { ApiProperty } from '@nestjs/swagger';

export class BalanceResponseDto {
  @ApiProperty({ example: 'THB', description: 'Базовая валюта пользователя для поля balance' })
  baseCurrency: string;

  @ApiProperty({
    example: 1234.56,
    nullable: true,
    description: 'Баланс (доходы − расходы) за всё время в USD. null, если курсы недоступны.',
  })
  balanceUsd: number | null;

  @ApiProperty({
    example: 44000,
    nullable: true,
    description: 'Тот же баланс в базовой валюте по текущему курсу. null, если курсы недоступны.',
  })
  balance: number | null;
}
