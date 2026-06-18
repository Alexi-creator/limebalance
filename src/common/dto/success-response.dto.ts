import { ApiProperty } from '@nestjs/swagger';

export class SuccessResponseDto {
  @ApiProperty({ example: true, description: 'Whether the operation succeeded' })
  success: boolean;
}
