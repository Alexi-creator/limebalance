import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateExchangeAccountDto {
  @ApiProperty({ example: 'AbCdEf123456', description: 'Bybit API key (read-only recommended)' })
  @IsString()
  @MinLength(5)
  @MaxLength(128)
  apiKey: string;

  @ApiProperty({ example: 'x9y8z7...', description: 'Bybit API secret' })
  @IsString()
  @MinLength(5)
  @MaxLength(128)
  apiSecret: string;

  // Required: with several accounts (several Bybit keys, or later other exchanges) this is the
  // only thing telling them apart in the UI — an empty label reads as a blank row in the filter.
  @ApiProperty({ example: 'Main account', description: 'Display label' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  label: string;
}
