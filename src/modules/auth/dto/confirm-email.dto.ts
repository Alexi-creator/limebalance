import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ConfirmEmailDto {
  @ApiProperty({ description: 'Token from the confirmation email (see POST /auth/me/credentials)' })
  @IsUUID()
  token: string;
}
