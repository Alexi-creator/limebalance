import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class MergeIncomeCategoryDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440002',
    description: 'The income category that takes over all operations of the merged one',
  })
  @IsUUID()
  targetId: string;
}
