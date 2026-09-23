import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { type FilterPreset, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateFilterPresetDto } from './dto/create-filter-preset.dto';
import type { FilterPresetDto } from './dto/filter-preset-response.dto';
import type { UpdateFilterPresetDto } from './dto/update-filter-preset.dto';
import {
  canonicalizeFilters,
  type FilterPresetScopeParam,
  fromScope,
  hashFilters,
  toScope,
} from './filter-presets.util';

/** Machine-readable reason on a 409, so the client can tell which rule it hit. */
export const PRESET_FILTERS_EXIST = 'PRESET_FILTERS_EXIST';
export const PRESET_NAME_EXISTS = 'PRESET_NAME_EXISTS';

@Injectable()
export class FilterPresetsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, scope: FilterPresetScopeParam): Promise<FilterPresetDto[]> {
    const rows = await this.prisma.filterPreset.findMany({
      where: { userId, scope: toScope(scope) },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toDto);
  }

  async create(userId: string, dto: CreateFilterPresetDto): Promise<FilterPresetDto> {
    const scope = toScope(dto.scope);
    const filters = canonicalizeFilters(dto.filters);
    const filtersHash = hashFilters(filters);
    const name = dto.name.trim();

    // Checked up front for a clear message; the unique indexes still catch a race (P2002 below).
    const same = await this.prisma.filterPreset.findFirst({
      where: { userId, scope, OR: [{ filtersHash }, { name }] },
    });
    if (same) throw conflictFor(same.filtersHash === filtersHash ? 'filters' : 'name', same.name);

    try {
      const row = await this.prisma.filterPreset.create({
        data: { userId, scope, name, filters, filtersHash },
      });
      return toDto(row);
    } catch (err) {
      throw uniqueViolation(err) ?? err;
    }
  }

  async rename(userId: string, id: string, dto: UpdateFilterPresetDto): Promise<FilterPresetDto> {
    const preset = await this.owned(userId, id);
    const name = dto.name.trim();
    if (name === preset.name) return toDto(preset);

    const taken = await this.prisma.filterPreset.findFirst({
      where: { userId, scope: preset.scope, name, id: { not: id } },
    });
    if (taken) throw conflictFor('name', taken.name);

    try {
      return toDto(await this.prisma.filterPreset.update({ where: { id }, data: { name } }));
    } catch (err) {
      throw uniqueViolation(err) ?? err;
    }
  }

  async remove(userId: string, id: string): Promise<{ success: true }> {
    const { count } = await this.prisma.filterPreset.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Preset not found');
    return { success: true };
  }

  private async owned(userId: string, id: string): Promise<FilterPreset> {
    const preset = await this.prisma.filterPreset.findFirst({ where: { id, userId } });
    if (!preset) throw new NotFoundException('Preset not found');
    return preset;
  }
}

function toDto(row: FilterPreset): FilterPresetDto {
  return {
    id: row.id,
    scope: fromScope(row.scope),
    name: row.name,
    filters: row.filters as Record<string, unknown>,
    createdAt: row.createdAt,
  };
}

function conflictFor(rule: 'filters' | 'name', existingName: string): ConflictException {
  return rule === 'filters'
    ? new ConflictException({
        message: `These filters are already saved as "${existingName}"`,
        code: PRESET_FILTERS_EXIST,
      })
    : new ConflictException({
        message: `A preset named "${existingName}" already exists`,
        code: PRESET_NAME_EXISTS,
      });
}

/** Maps a unique-index violation (a request that raced the pre-check) to the matching 409. */
function uniqueViolation(err: unknown): ConflictException | null {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return null;
  const target = String((err.meta?.target as string[] | string | undefined) ?? '');
  return target.includes('filters_hash') || target.includes('filtersHash')
    ? new ConflictException({
        message: 'These filters are already saved',
        code: PRESET_FILTERS_EXIST,
      })
    : new ConflictException({
        message: 'A preset with this name already exists',
        code: PRESET_NAME_EXISTS,
      });
}
