import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateFilterPresetDto } from './dto/create-filter-preset.dto';
import { FilterPresetDto } from './dto/filter-preset-response.dto';
import { ListFilterPresetsDto } from './dto/list-filter-presets.dto';
import { UpdateFilterPresetDto } from './dto/update-filter-preset.dto';
import { FilterPresetsService } from './filter-presets.service';

@ApiTags('filter-presets')
@Controller('filter-presets')
export class FilterPresetsController {
  constructor(private readonly filterPresetsService: FilterPresetsService) {}

  @Get()
  @ApiOperation({ summary: "A table's saved filter presets, oldest first" })
  @ApiOkResponse({ type: [FilterPresetDto] })
  list(@CurrentUser() user: { id: string }, @Query() query: ListFilterPresetsDto) {
    return this.filterPresetsService.list(user.id, query.scope);
  }

  @Post()
  @ApiOperation({
    summary: 'Save the current filters as a preset',
    description:
      '409 with code PRESET_FILTERS_EXIST if the same filter set is already saved in this table, ' +
      'PRESET_NAME_EXISTS if the name is taken.',
  })
  @ApiOkResponse({ type: FilterPresetDto })
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateFilterPresetDto) {
    return this.filterPresetsService.create(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename a preset (409 PRESET_NAME_EXISTS if the name is taken)' })
  @ApiOkResponse({ type: FilterPresetDto })
  rename(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateFilterPresetDto,
  ) {
    return this.filterPresetsService.rename(user.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a preset' })
  remove(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.filterPresetsService.remove(user.id, id);
  }
}
