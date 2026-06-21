import { ApiProperty } from '@nestjs/swagger';

export class BalanceResponseDto {
  @ApiProperty({ example: 'THB', description: "User's base currency for the balance field" })
  baseCurrency: string;

  @ApiProperty({
    example: 1234.56,
    nullable: true,
    description:
      'Free balance (income − expenses − money reserved in active goals) in USD. ' +
      'null if rates are unavailable.',
  })
  balanceUsd: number | null;

  @ApiProperty({
    example: 44000,
    nullable: true,
    description: 'The same free balance in the base currency at the current rate. null if rates are unavailable.',
  })
  balance: number | null;

  @ApiProperty({
    example: 913200,
    nullable: true,
    description: 'Money reserved across active goals, in the base currency.',
  })
  inGoals: number | null;

  @ApiProperty({
    example: 25000,
    nullable: true,
    description: 'The same goal reserve in USD.',
  })
  inGoalsUsd: number | null;
}
