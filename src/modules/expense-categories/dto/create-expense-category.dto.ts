import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateExpenseCategoryDto {
  @ApiProperty({ example: 'Продукты' })
  @IsString()
  @MinLength(1)
  name: string;
}
