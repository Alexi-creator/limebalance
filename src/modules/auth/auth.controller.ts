import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { TelegramAuthDto } from './dto/telegram-auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('google')
  @Public()
  @ApiOperation({ summary: 'Войти через Google (передать ID token)' })
  loginGoogle(@Body() dto: GoogleAuthDto) {
    return this.authService.loginWithGoogle(dto);
  }

  @Post('telegram')
  @Public()
  @ApiOperation({ summary: 'Войти через Telegram Login Widget' })
  loginTelegram(@Body() dto: TelegramAuthDto) {
    return this.authService.loginWithTelegram(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Получить текущего пользователя' })
  me(@CurrentUser() user: { id: string }) {
    return user;
  }

  @Post('link/google')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Привязать Google к аккаунту' })
  linkGoogle(@CurrentUser() user: { id: string }, @Body() dto: GoogleAuthDto) {
    return this.authService.linkGoogle(user.id, dto);
  }

  @Post('link/telegram')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Привязать Telegram к аккаунту' })
  linkTelegram(@CurrentUser() user: { id: string }, @Body() dto: TelegramAuthDto) {
    return this.authService.linkTelegram(user.id, dto);
  }
}
