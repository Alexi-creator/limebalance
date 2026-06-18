import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Matches } from 'class-validator';

export class TelegramAuthDto {
  @ApiProperty({ description: 'Telegram user ID', example: 1279948230 })
  @IsNumber()
  id: number;

  @ApiPropertyOptional({ example: 'Ilia' })
  @IsString()
  @IsOptional()
  first_name?: string;

  @ApiPropertyOptional({ example: 'Pavlov' })
  @IsString()
  @IsOptional()
  last_name?: string;

  @ApiPropertyOptional({ example: 'iliapavlov' })
  @IsString()
  @IsOptional()
  username?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  photo_url?: string;

  @ApiProperty({ description: 'Unix timestamp when the token was issued' })
  @IsNumber()
  auth_date: number;

  @ApiProperty({ description: 'HMAC-SHA256 signature of the data' })
  @IsString()
  hash: string;

  @ApiPropertyOptional({
    example: 'Asia/Bangkok',
    description:
      'Browser IANA timezone — for the default currency on first registration. NOT part of the Telegram signature.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/, { message: 'timezone must be a valid IANA name' })
  timezone?: string;
}
