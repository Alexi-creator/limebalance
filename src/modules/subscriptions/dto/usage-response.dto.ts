import { ApiProperty } from '@nestjs/swagger';

export class LimitUsageDto {
  @ApiProperty({ example: 3, description: 'How many the user already has' })
  used: number;

  @ApiProperty({ example: 5, nullable: true, description: 'Plan cap, or null = unlimited' })
  limit: number | null;

  @ApiProperty({ example: 2, nullable: true, description: 'limit - used, or null = unlimited' })
  remaining: number | null;
}

export class UsageResponseDto {
  @ApiProperty({
    type: LimitUsageDto,
    description: 'Categories (expense + income), lifetime total',
  })
  categories: LimitUsageDto;

  @ApiProperty({
    type: LimitUsageDto,
    description: 'Transactions (expenses + incomes) in the current calendar month; resets monthly',
  })
  transactions: LimitUsageDto;
}
