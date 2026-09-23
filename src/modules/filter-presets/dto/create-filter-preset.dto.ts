import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsObject, IsString, Length } from 'class-validator';
import { FILTER_PRESET_SCOPES, type FilterPresetScopeParam } from '../filter-presets.util';

export class CreateFilterPresetDto {
  @ApiProperty({ enum: FILTER_PRESET_SCOPES, example: 'transactions' })
  @IsIn(FILTER_PRESET_SCOPES)
  scope: FilterPresetScopeParam;

  @ApiProperty({ example: 'Food this month' })
  @IsString()
  @Length(1, 60)
  name: string;

  @ApiProperty({
    example: { type: 'expense', categoryId: ['c1', 'c2'], period: 'this_month' },
    description:
      "The table's filter params with defaults left out. Values: string, number, boolean or an " +
      'array of strings. Stored as is (canonicalized), the backend does not interpret them.',
  })
  @IsObject()
  filters: Record<string, unknown>;
}
