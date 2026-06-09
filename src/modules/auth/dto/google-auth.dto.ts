import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class GoogleAuthDto {
  @ApiProperty({ description: 'Google ID token из Sign In With Google' })
  @IsString()
  credential: string;

  @ApiPropertyOptional({
    example: 'Asia/Bangkok',
    description: 'IANA таймзона браузера — для дефолта валюты при первой регистрации',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/, { message: 'timezone must be a valid IANA name' })
  timezone?: string;
}
