import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { SuccessResponseDto } from '../../common/dto/success-response.dto';
import '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ProfileResponseDto } from '../users/dto/profile-response.dto';
import { UpdateProfileDto } from '../users/dto/update-profile.dto';
import { UsersService } from '../users/users.service';
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS } from './auth.constants';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SetCredentialsDto } from './dto/set-credentials.dto';
import { TelegramAuthDto } from './dto/telegram-auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

const ACCESS_COOKIE = 'access_token';
const REFRESH_COOKIE = 'refresh_token';

@Throttle({ default: { ttl: 60_000, limit: 10 } })
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Post('register')
  @Public()
  @ApiOperation({
    summary: 'Регистрация по email и паролю',
    description:
      'Создаёт нового пользователя по email + паролю и сразу логинит его. ' +
      'Access- и refresh-токены возвращаются не в теле, а ставятся в httpOnly cookie — ' +
      'фронту достаточно сделать запрос с credentials: "include", вручную токены хранить не нужно. ' +
      'Имя не запрашивается (по умолчанию пустая строка), валюта выводится из timezone или USD. ' +
      'Если email уже занят — 409.',
  })
  @ApiCreatedResponse({
    type: SuccessResponseDto,
    description: 'Токены ставятся в httpOnly cookie',
  })
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: FastifyReply) {
    const tokens = await this.authService.register(dto);
    this.setTokenCookies(res, tokens.accessToken, tokens.refreshToken);
    return { success: true };
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Вход по email и паролю',
    description:
      'Проверяет пару email + пароль и при успехе ставит access/refresh-токены в httpOnly cookie. ' +
      'Неверные данные или вход в аккаунт без пароля (зарегистрированный только через Google/Telegram) → 401. ' +
      'Эндпоинт под rate-limit (10 запросов/мин на IP).',
  })
  @ApiOkResponse({ type: SuccessResponseDto, description: 'Токены ставятся в httpOnly cookie' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: FastifyReply) {
    const tokens = await this.authService.login(dto);
    this.setTokenCookies(res, tokens.accessToken, tokens.refreshToken);
    return { success: true };
  }

  @Post('google')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Вход через Google',
    description:
      'Принимает Google ID token (credential), полученный на фронте от Google Identity Services. ' +
      'Бэкенд верифицирует токен в Google, затем: если пользователь с таким googleId есть — логинит; ' +
      'если есть аккаунт с тем же email — привязывает к нему Google; иначе создаёт нового пользователя. ' +
      'Токены ставятся в httpOnly cookie. Поле timezone — подсказка браузера, применяется только при создании нового аккаунта.',
  })
  @ApiOkResponse({ type: SuccessResponseDto })
  async loginGoogle(@Body() dto: GoogleAuthDto, @Res({ passthrough: true }) res: FastifyReply) {
    const tokens = await this.authService.loginWithGoogle(dto);
    this.setTokenCookies(res, tokens.accessToken, tokens.refreshToken);
    return { success: true };
  }

  @Post('telegram')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Вход через Telegram Login Widget',
    description:
      'Принимает данные от Telegram Login Widget (id, hash и пр.). Бэкенд проверяет подпись (hash) ботовым токеном — ' +
      'так подтверждается, что данные действительно от Telegram. Дальше логика как у Google: найти по telegramId, ' +
      'привязать или создать пользователя. Токены ставятся в httpOnly cookie. ' +
      'timezone здесь — неподписанная подсказка браузера, применяется только при создании аккаунта.',
  })
  @ApiOkResponse({ type: SuccessResponseDto })
  async loginTelegram(@Body() dto: TelegramAuthDto, @Res({ passthrough: true }) res: FastifyReply) {
    const tokens = await this.authService.loginWithTelegram(dto);
    this.setTokenCookies(res, tokens.accessToken, tokens.refreshToken);
    return { success: true };
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Обновить access-токен по refresh-токену',
    description:
      'Когда access-токен протух, фронт дёргает этот эндпоинт. Refresh-токен берётся из httpOnly cookie (тело не нужно). ' +
      'Старый refresh-токен инвалидируется, выдаётся новая пара (ротация токенов) и заново ставится в cookie. ' +
      'Если refresh-токена нет, он истёк или невалиден — 401 (нужен повторный логин).',
  })
  @ApiOkResponse({ type: SuccessResponseDto })
  async refresh(@Req() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    if (!refreshToken) throw new UnauthorizedException('No refresh token');

    const tokens = await this.authService.refresh(refreshToken);
    this.setTokenCookies(res, tokens.accessToken, tokens.refreshToken);
    return { success: true };
  }

  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Выход',
    description:
      'Удаляет refresh-токен из БД (чтобы им больше нельзя было воспользоваться) и чистит обе cookie — ' +
      'access и refresh. Всегда возвращает success, даже если cookie уже не было.',
  })
  @ApiOkResponse({ type: SuccessResponseDto })
  async logout(@Req() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    if (refreshToken) await this.authService.logout(refreshToken);
    res.clearCookie(ACCESS_COOKIE, { path: '/' });
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    return { success: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Профиль текущего пользователя',
    description:
      'Возвращает данные залогиненного пользователя: email, name, telegramId, валюту, таймзону, ' +
      'флаг hasPassword (задан ли пароль) и подписку. Пользователь определяется по access-токену из cookie. ' +
      'Удобно дёргать на старте приложения, чтобы понять, кто залогинен и что показывать в UI.',
  })
  @ApiOkResponse({ type: ProfileResponseDto })
  me(@CurrentUser() user: { id: string }) {
    return this.usersService.findMe(user.id);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Обновить свой профиль',
    description:
      'Частичное обновление профиля: name, currency, timezone. Все поля опциональны — ' +
      'присылайте только то, что меняете (PATCH-семантика). name может быть пустой строкой. ' +
      'currency — 3-буквенный ISO 4217 код, timezone — валидное IANA-имя. Возвращает обновлённый профиль.',
  })
  @ApiOkResponse({ type: ProfileResponseDto })
  updateMe(@CurrentUser() user: { id: string }, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.id, dto);
  }

  @Post('me/credentials')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Задать или сменить пароль',
    description:
      'Двойное назначение в зависимости от состояния аккаунта. ' +
      'Если у пользователя ещё нет email (зашёл через Telegram) — нужно прислать email + password, оба обязательны: ' +
      'так аккаунту впервые задаются почта и пароль. ' +
      'Если email уже есть — это смена пароля: меняется только password, поменять email через этот эндпоинт нельзя. ' +
      'После этого в профиле hasPassword станет true.',
  })
  @ApiOkResponse({ type: SuccessResponseDto })
  setCredentials(@CurrentUser() user: { id: string }, @Body() dto: SetCredentialsDto) {
    return this.authService.setCredentials(user.id, dto);
  }

  @Post('forgot-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Запросить сброс пароля',
    description:
      'Принимает email и, если такой пользователь есть, генерирует токен сброса и отправляет письмо со ссылкой. ' +
      'В ответ всегда отдаётся success независимо от того, существует email или нет — ' +
      'это специально, чтобы нельзя было перебором узнать, какие почты зарегистрированы. ' +
      'Дальше пользователь переходит по ссылке и вызывает POST /auth/reset-password.',
  })
  @ApiOkResponse({
    type: SuccessResponseDto,
    description: 'Всегда success (не раскрываем наличие email)',
  })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Сбросить пароль по токену',
    description:
      'Завершает сценарий сброса: принимает token из письма (см. /auth/forgot-password) и новый password. ' +
      'Если токен валиден и не истёк — пароль меняется, токен гасится (одноразовый). Иначе — ошибка.',
  })
  @ApiOkResponse({ type: SuccessResponseDto })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  @Post('link/google')
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({ type: SuccessResponseDto })
  @ApiOperation({
    summary: 'Привязать Google к текущему аккаунту',
    description:
      'Для уже залогиненного пользователя: привязывает Google (по ID token) к его аккаунту, ' +
      'чтобы дальше можно было входить и через Google. В отличие от POST /auth/google, не создаёт нового пользователя — ' +
      'добавляет googleId к текущему. Если этот Google уже привязан к другому аккаунту — ошибка.',
  })
  linkGoogle(@CurrentUser() user: { id: string }, @Body() dto: GoogleAuthDto) {
    return this.authService.linkGoogle(user.id, dto);
  }

  @Post('link/telegram')
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({ type: SuccessResponseDto })
  @ApiOperation({
    summary: 'Привязать Telegram к текущему аккаунту',
    description:
      'Для уже залогиненного пользователя: проверяет подпись данных Telegram Login Widget и привязывает telegramId ' +
      'к его аккаунту, чтобы можно было входить и через Telegram. Нового пользователя не создаёт. ' +
      'Если этот Telegram уже привязан к другому аккаунту — ошибка.',
  })
  linkTelegram(@CurrentUser() user: { id: string }, @Body() dto: TelegramAuthDto) {
    return this.authService.linkTelegram(user.id, dto);
  }

  private setTokenCookies(res: FastifyReply, accessToken: string, refreshToken: string) {
    const secure = process.env.NODE_ENV === 'production';
    res.setCookie(ACCESS_COOKIE, accessToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: ACCESS_TOKEN_TTL_SECONDS,
    });
    res.setCookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: REFRESH_TOKEN_TTL_SECONDS,
    });
  }
}
