import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class MergeExpenseCategoryDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440002',
    description: 'The expense category that takes over all operations of the merged one',
  })
  @IsUUID()
  targetId: string;
}
