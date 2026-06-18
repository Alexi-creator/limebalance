import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateExpenseCategoryDto {
  @ApiProperty({ example: 'Groceries' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiPropertyOptional({ example: '🛒' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  emoji?: string;
}
