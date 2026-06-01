import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty()
  @IsUUID()
  token: string;

  @ApiProperty({ example: 'newPassword123' })
  @IsString()
  @MinLength(8)
  password: string;
}
