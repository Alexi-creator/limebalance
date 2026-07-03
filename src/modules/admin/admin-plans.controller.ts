import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminPlansService } from './admin-plans.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@ApiTags('admin')
@Controller('admin/plans')
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
export class AdminPlansController {
  constructor(private readonly plans: AdminPlansService) {}

  @Get()
  @ApiOperation({
    summary: 'List subscription plans (ADMIN)',
    description:
      'All plans with their limits (maxCategories, maxTransactionsPerMonth — null = unlimited), ' +
      'price, investing access, and the number of subscribers. Cheapest first.',
  })
  @ApiOkResponse()
  list() {
    return this.plans.list();
  }

  @Post()
  @ApiOperation({
    summary: 'Create a subscription plan (ADMIN)',
    description: 'Adds a new plan variant. Name must be a unique lowercase slug.',
  })
  @ApiOkResponse()
  create(@Body() dto: CreatePlanDto) {
    return this.plans.create(dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a subscription plan (ADMIN)',
    description:
      "Change any of a plan's limits, price, name, or investing access. Omitted fields are left " +
      'unchanged; sending null on a limit makes it unlimited.',
  })
  @ApiOkResponse()
  update(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.plans.update(id, dto);
  }

  @Patch(':id/archive')
  @ApiOperation({
    summary: 'Archive a subscription plan (ADMIN)',
    description:
      'Pulls the plan from sale (hidden from new signups). Existing subscribers keep the plan and ' +
      'its functionality until their subscription expires. Reversible. The free plan cannot be archived.',
  })
  @ApiOkResponse()
  archive(@Param('id') id: string) {
    return this.plans.setArchived(id, true);
  }

  @Patch(':id/unarchive')
  @ApiOperation({
    summary: 'Unarchive a subscription plan (ADMIN)',
    description: 'Restores an archived plan, making it available for new subscriptions again.',
  })
  @ApiOkResponse()
  unarchive(@Param('id') id: string) {
    return this.plans.setArchived(id, false);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a subscription plan (ADMIN)',
    description:
      'Hard-deletes a plan. Rejected for the free plan and for any plan that still has subscribers ' +
      '(archive it instead). Use for cleaning up plans nobody is on.',
  })
  @ApiOkResponse({ description: 'The deleted plan row' })
  remove(@Param('id') id: string) {
    return this.plans.remove(id);
  }
}
