import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateContributionDto } from './dto/create-contribution.dto';
import { CreateGoalDto } from './dto/create-goal.dto';
import { GoalDto, GoalsResponseDto } from './dto/goal-response.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';
import { GoalsService } from './goals.service';

@ApiTags('goals')
@Controller('goals')
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  @Get()
  @ApiOperation({
    summary: 'Goals page',
    description:
      'Active (non-archived) goals with computed fields (progress, remaining, months left, ' +
      'per-month) plus the top aggregate card (total saved/target/remaining in the base currency).',
  })
  @ApiOkResponse({ type: GoalsResponseDto })
  list(@CurrentUser() user: { id: string }) {
    return this.goalsService.list(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a goal' })
  @ApiOkResponse({ type: GoalDto })
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateGoalDto) {
    return this.goalsService.create(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a goal (also archive/unarchive)' })
  @ApiOkResponse({ type: GoalDto })
  update(@CurrentUser() user: { id: string }, @Param('id') id: string, @Body() dto: UpdateGoalDto) {
    return this.goalsService.update(user.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a goal with its contributions' })
  remove(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.goalsService.remove(user.id, id);
  }

  @Post(':id/contributions')
  @ApiOperation({
    summary: '"+ Add funds" — add a contribution',
    description:
      'Adds money to the goal (in the goal currency; negative = withdrawal). On first reaching the ' +
      'target it sends the "goal completed" notification. Returns the recomputed goal.',
  })
  @ApiOkResponse({ type: GoalDto })
  contribute(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: CreateContributionDto,
  ) {
    return this.goalsService.contribute(user.id, id, dto);
  }

  @Get(':id/contributions')
  @ApiOperation({ summary: '"History" — contribution history of a goal' })
  listContributions(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.goalsService.listContributions(user.id, id);
  }

  @Delete(':id/contributions/:contributionId')
  @ApiOperation({ summary: 'Delete a single contribution (history correction)' })
  removeContribution(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Param('contributionId') contributionId: string,
  ) {
    return this.goalsService.removeContribution(user.id, id, contributionId);
  }
}
