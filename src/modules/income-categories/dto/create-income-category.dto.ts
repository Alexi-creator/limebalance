import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateIncomeCategoryDto {
  @ApiProperty({ example: 'Зарплата' })
  @IsString()
  @MinLength(1)
  name: string;
}
