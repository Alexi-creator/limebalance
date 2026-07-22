import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreatePositionNoteDto {
  @ApiProperty({
    example: 'Entered on the breakout above 65k, tight stop below the range.',
    description: 'Entry reason, a mid-trade update, the exit reason — whatever, at any time',
  })
  @IsString()
  @MaxLength(4000)
  body: string;

  @ApiPropertyOptional({
    example: 'https://i.imgur.com/chart123.png',
    description: 'Chart screenshot, etc.',
  })
  @IsOptional()
  @IsUrl()
  @MaxLength(2000)
  imageUrl?: string;
}

export class UpdatePositionNoteDto {
  @ApiPropertyOptional({ example: 'Edited: actually entered on the retest, not the breakout.' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;

  @ApiPropertyOptional({ example: 'https://i.imgur.com/chart123.png' })
  @IsOptional()
  @IsUrl()
  @MaxLength(2000)
  imageUrl?: string;
}
