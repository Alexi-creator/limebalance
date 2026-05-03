import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional } from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'new@example.com' })
  @IsEmail()
  @IsOptional()
  email?: string;
}
