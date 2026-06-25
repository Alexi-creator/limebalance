import { Body, Controller, Delete, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminService } from './admin.service';
import { AdminUserDto } from './dto/admin-user.dto';
import { ChangePlanDto } from './dto/change-plan.dto';

@ApiTags('admin')
@Controller('admin/users')
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  @ApiOperation({
    summary: 'List all users with full admin detail (ADMIN)',
    description:
      'One row per user for the admin table: account fields, login methods (telegram/google/password), ' +
      'block status, current plan + expiry, and activity counts (categories, transactions, goals). ' +
      'Sorted newest first.',
  })
  @ApiOkResponse({ type: [AdminUserDto] })
  listUsers() {
    return this.adminService.listUsers();
  }

  @Patch(':id/block')
  @ApiOperation({
    summary: 'Block a user (ADMIN)',
    description: 'Sets blockedAt. The user is rejected on their next request, on every route.',
  })
  @ApiOkResponse({ type: AdminUserDto })
  block(@Param('id') id: string) {
    return this.adminService.setBlocked(id, true);
  }

  @Patch(':id/unblock')
  @ApiOperation({
    summary: 'Unblock a user (ADMIN)',
    description: 'Clears blockedAt, restoring access.',
  })
  @ApiOkResponse({ type: AdminUserDto })
  unblock(@Param('id') id: string) {
    return this.adminService.setBlocked(id, false);
  }

  @Patch(':id/plan')
  @ApiOperation({
    summary: "Change a user's plan (ADMIN)",
    description:
      "Upserts the user's subscription to the given plan (free / pro / ultra) with an optional expiry. " +
      'Omit expiresAt (or null) for a lifetime grant.',
  })
  @ApiOkResponse({ type: AdminUserDto })
  changePlan(@Param('id') id: string, @Body() dto: ChangePlanDto) {
    return this.adminService.changePlan(id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a user (ADMIN)',
    description: 'Deletes the user. All their data is cascade-deleted.',
  })
  @ApiOkResponse({ type: AdminUserDto, description: 'The deleted user row' })
  remove(@Param('id') id: string) {
    return this.adminService.remove(id);
  }
}
