import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class UpdateIncomeCategoryDto {
  @ApiProperty({ example: 'Фриланс' })
  @IsString()
  @MinLength(1)
  name: string;
}
