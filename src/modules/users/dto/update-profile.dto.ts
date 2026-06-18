import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Ilia' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'THB', description: 'ISO 4217 currency code' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO 4217 code' })
  currency?: string;

  @ApiPropertyOptional({ example: 'Asia/Bangkok', description: 'IANA timezone' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/, { message: 'timezone must be a valid IANA name' })
  timezone?: string;
}
