import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';

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

  @ApiProperty({ description: 'Unix timestamp выдачи токена' })
  @IsNumber()
  auth_date: number;

  @ApiProperty({ description: 'HMAC-SHA256 подпись данных' })
  @IsString()
  hash: string;
}
