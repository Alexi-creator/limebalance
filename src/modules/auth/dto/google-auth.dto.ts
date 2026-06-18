import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class GoogleAuthDto {
  @ApiProperty({ description: 'Google ID token from Sign In With Google' })
  @IsString()
  credential: string;

  @ApiPropertyOptional({
    example: 'Asia/Bangkok',
    description: 'Browser IANA timezone — for the default currency on first registration',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/, { message: 'timezone must be a valid IANA name' })
  timezone?: string;
}
