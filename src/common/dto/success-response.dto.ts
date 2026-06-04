import { ApiProperty } from '@nestjs/swagger';

export class SuccessResponseDto {
  @ApiProperty({ example: true, description: 'Признак успешной операции' })
  success: boolean;
}
