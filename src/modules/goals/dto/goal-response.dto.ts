import { ApiProperty } from '@nestjs/swagger';

export class GoalDto {
  @ApiProperty({ example: 'b3f1…' })
  id: string;

  @ApiProperty({ example: 'Bali vacation' })
  name: string;

  @ApiProperty({ nullable: true, example: '🌴' })
  emoji: string | null;

  @ApiProperty({ example: 240000 })
  targetAmount: number;

  @ApiProperty({ example: 163200, description: 'Σ of all contributions (in the goal currency)' })
  currentAmount: number;

  @ApiProperty({ example: 'THB' })
  currency: string;

  @ApiProperty({ nullable: true, example: '2026-08-01', description: 'Deadline date or null' })
  targetDate: Date | null;

  @ApiProperty({ example: 68, description: 'Progress %, 0–100 (rounded)' })
  progress: number;

  @ApiProperty({ example: 76800, description: 'target − current, floored at 0' })
  remaining: number;

  @ApiProperty({
    nullable: true,
    example: 4,
    description: 'Whole months until the deadline, floored at 0. null if no deadline.',
  })
  monthsLeft: number | null;

  @ApiProperty({
    nullable: true,
    example: 19200,
    description: 'remaining / monthsLeft. null if no deadline.',
  })
  perMonth: number | null;

  @ApiProperty({ example: false, description: 'currentAmount >= targetAmount' })
  isCompleted: boolean;

  @ApiProperty({ example: false, description: 'Deadline passed and not yet reached' })
  isOverdue: boolean;

  @ApiProperty({ example: false })
  archived: boolean;

  @ApiProperty({ nullable: true, example: '2026-06-20T08:00:00.000Z' })
  completedAt: Date | null;

  @ApiProperty({ example: '2026-01-10T08:00:00.000Z' })
  createdAt: Date;
}

export class GoalsSummaryDto {
  @ApiProperty({ example: 'THB', description: "User's base currency for the totals below" })
  baseCurrency: string;

  @ApiProperty({ example: 4, description: 'Number of active (non-archived) goals' })
  activeCount: number;

  @ApiProperty({
    nullable: true,
    example: 913200,
    description:
      'Total saved across active goals, converted to the base currency. null if rates are unavailable.',
  })
  totalSaved: number | null;

  @ApiProperty({
    nullable: true,
    example: 3420000,
    description: 'Total target across active goals, in the base currency.',
  })
  totalTarget: number | null;

  @ApiProperty({
    nullable: true,
    example: 2506800,
    description: 'totalTarget − totalSaved, floored at 0',
  })
  totalRemaining: number | null;

  @ApiProperty({ nullable: true, example: 27, description: 'Overall progress %, 0–100' })
  overallProgress: number | null;
}

export class GoalsResponseDto {
  @ApiProperty({ type: [GoalDto] })
  items: GoalDto[];

  @ApiProperty({ type: GoalsSummaryDto })
  summary: GoalsSummaryDto;
}

export class ContributionDto {
  @ApiProperty({ example: 'a1b2…' })
  id: string;

  @ApiProperty({ example: 19200, description: 'In the goal currency. Negative = withdrawal.' })
  amount: number;

  @ApiProperty({ nullable: true, example: 'Payday stash' })
  note: string | null;

  @ApiProperty({ example: '2026-06-20' })
  date: Date;

  @ApiProperty({ example: '2026-06-20T08:00:00.000Z' })
  createdAt: Date;
}
