import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateExchangeAccountDto {
  @ApiProperty({ example: 'Main account', description: 'New display label' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  label: string;
}
