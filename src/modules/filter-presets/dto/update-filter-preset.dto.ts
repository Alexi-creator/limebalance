import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

/** Only the name can change — a different filter set is a different preset. */
export class UpdateFilterPresetDto {
  @ApiProperty({ example: 'Food this month' })
  @IsString()
  @Length(1, 60)
  name: string;
}
