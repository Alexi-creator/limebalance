import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class ChangePlanDto {
  @ApiProperty({ example: 'pro', description: 'Plan name (free / pro / ultra).' })
  @IsString()
  planName!: string;

  @ApiPropertyOptional({
    example: '2026-12-31T00:00:00.000Z',
    nullable: true,
    description: 'When the subscription expires. Omit or null for no expiry (lifetime).',
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;
}
