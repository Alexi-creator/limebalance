import { ApiProperty } from '@nestjs/swagger';

export class BalanceResponseDto {
  @ApiProperty({ example: 'THB', description: "User's base currency for the balance field" })
  baseCurrency: string;

  @ApiProperty({
    example: 1234.56,
    nullable: true,
    description: 'All-time balance (income − expenses) in USD. null if rates are unavailable.',
  })
  balanceUsd: number | null;

  @ApiProperty({
    example: 44000,
    nullable: true,
    description:
      'The same balance in the base currency at the current rate. null if rates are unavailable.',
  })
  balance: number | null;
}
