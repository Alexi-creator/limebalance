import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ConfirmEmailDto {
  @ApiProperty({ description: 'Токен из письма-подтверждения (см. POST /auth/me/credentials)' })
  @IsUUID()
  token: string;
}
