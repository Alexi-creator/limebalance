import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNumber, IsOptional, Matches, Min } from 'class-validator';

export class CreatePlanDto {
  @ApiProperty({ example: 'plus', description: 'Unique plan name (lowercase slug).' })
  @Matches(/^[a-z0-9-]{1,30}$/, {
    message: 'name must be a lowercase slug (a-z, 0-9, -), 1–30 chars',
  })
  name!: string;

  @ApiPropertyOptional({
    example: 15,
    nullable: true,
    description: 'Total categories cap (expense + income, lifetime). Omit or null for unlimited.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxCategories?: number | null;

  @ApiPropertyOptional({
    example: 200,
    nullable: true,
    description: 'Transactions per calendar month cap. Omit or null for unlimited.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxTransactionsPerMonth?: number | null;

  @ApiProperty({ example: 4.99, description: 'Monthly price.' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Unlocks the investing / crypto section. Defaults to false.',
  })
  @IsOptional()
  @IsBoolean()
  investingAccess?: boolean;
}
