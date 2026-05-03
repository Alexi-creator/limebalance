import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class UpdateCategoryDto {
  @ApiProperty({ example: 'Транспорт' })
  @IsString()
  @MinLength(1)
  name: string;
}
