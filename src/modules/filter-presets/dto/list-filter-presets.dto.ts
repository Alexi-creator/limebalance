import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { FILTER_PRESET_SCOPES, type FilterPresetScopeParam } from '../filter-presets.util';

export class ListFilterPresetsDto {
  @ApiProperty({ enum: FILTER_PRESET_SCOPES })
  @IsIn(FILTER_PRESET_SCOPES)
  scope: FilterPresetScopeParam;
}
