import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class SetCredentialsDto {
  @ApiPropertyOptional({
    example: 'ilia@example.com',
    description:
      "Required if the account has no email yet. If an email already exists — it can't be changed.",
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    example: 'password123',
    minLength: 8,
    description:
      'If there is no email — required (set together with email). If an email exists — optional, sent only to change the password.',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiPropertyOptional({
    example: 'oldpassword123',
    description:
      'The current password. Required when changing the password if the account already has one set.',
  })
  @IsOptional()
  @IsString()
  currentPassword?: string;
}
