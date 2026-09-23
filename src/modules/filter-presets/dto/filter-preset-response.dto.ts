import { ApiProperty } from '@nestjs/swagger';
import { FILTER_PRESET_SCOPES, type FilterPresetScopeParam } from '../filter-presets.util';

export class FilterPresetDto {
  @ApiProperty({ example: 'b3f1…' })
  id: string;

  @ApiProperty({ enum: FILTER_PRESET_SCOPES, example: 'transactions' })
  scope: FilterPresetScopeParam;

  @ApiProperty({ example: 'Food this month' })
  name: string;

  @ApiProperty({ example: { categoryId: ['c1', 'c2'], period: 'this_month', type: 'expense' } })
  filters: Record<string, unknown>;

  @ApiProperty()
  createdAt: Date;
}
