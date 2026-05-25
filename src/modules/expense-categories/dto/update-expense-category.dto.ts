import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class UpdateExpenseCategoryDto {
  @ApiProperty({ example: 'Транспорт' })
  @IsString()
  @MinLength(1)
  name: string;
}
