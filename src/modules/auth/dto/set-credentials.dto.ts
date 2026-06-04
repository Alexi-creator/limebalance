import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class SetCredentialsDto {
  @ApiPropertyOptional({
    example: 'ilia@example.com',
    description: 'Обязателен, если у аккаунта ещё нет почты. Если почта уже есть — менять нельзя.',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    example: 'password123',
    minLength: 8,
    description:
      'Если почты нет — обязателен (задаётся вместе с email). Если почта есть — необязателен, передаётся только для смены пароля.',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiPropertyOptional({
    example: 'oldpassword123',
    description: 'Текущий пароль. Обязателен при смене пароля, если у аккаунта пароль уже задан.',
  })
  @IsOptional()
  @IsString()
  currentPassword?: string;
}
