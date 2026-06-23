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
import { ConfirmEmailDto } from './dto/confirm-email.dto';
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
    summary: 'Register with email and password',
    description:
      'Creates a new user from email + password and logs them in immediately. ' +
      'Access and refresh tokens are not returned in the body but set as httpOnly cookies — ' +
      'the frontend only needs to send requests with credentials: "include", no manual token storage. ' +
      'The name is not requested (defaults to an empty string), the currency is derived from the timezone or USD. ' +
      'If the email is already taken — 409.',
  })
  @ApiCreatedResponse({
    type: SuccessResponseDto,
    description: 'Tokens are set as httpOnly cookies',
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
    summary: 'Log in with email and password',
    description:
      'Verifies the email + password pair and, on success, sets access/refresh tokens as httpOnly cookies. ' +
      'Invalid credentials or logging into an account without a password (registered only via Google/Telegram) → 401. ' +
      'The endpoint is rate-limited (10 requests/min per IP).',
  })
  @ApiOkResponse({ type: SuccessResponseDto, description: 'Tokens are set as httpOnly cookies' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: FastifyReply) {
    const tokens = await this.authService.login(dto);
    this.setTokenCookies(res, tokens.accessToken, tokens.refreshToken);
    return { success: true };
  }

  @Post('google')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in with Google',
    description:
      'Accepts a Google ID token (credential) obtained on the frontend from Google Identity Services. ' +
      'The backend verifies the token with Google, then: if a user with that googleId exists — logs them in; ' +
      'if an account with the same email exists — links Google to it; otherwise creates a new user. ' +
      'Tokens are set as httpOnly cookies. The timezone field is a browser hint, applied only when creating a new account.',
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
    summary: 'Log in via the Telegram Login Widget',
    description:
      'Accepts data from the Telegram Login Widget (id, hash, etc.). The backend verifies the signature (hash) with the bot token — ' +
      'this confirms the data really came from Telegram. From there the logic mirrors Google: look up by telegramId, ' +
      'link or create the user. Tokens are set as httpOnly cookies. ' +
      'timezone here is an unsigned browser hint, applied only when creating an account.',
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
    summary: 'Refresh the access token using the refresh token',
    description:
      'When the access token expires, the frontend calls this endpoint. The refresh token is read from the httpOnly cookie (no body needed). ' +
      'The old refresh token is invalidated, a new pair is issued (token rotation) and set as cookies again. ' +
      'If the refresh token is missing, expired or invalid — 401 (re-login required).',
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
    summary: 'Log out',
    description:
      'Deletes the refresh token from the DB (so it can no longer be used) and clears both cookies — ' +
      'access and refresh. Always returns success, even if the cookies were already absent.',
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
    summary: "Current user's profile",
    description:
      'Returns the logged-in user data: email, name, telegramId, currency, timezone, ' +
      'the hasPassword flag (whether a password is set) and the subscription. The user is identified by the access token from the cookie. ' +
      'Handy to call on app startup to know who is logged in and what to show in the UI.',
  })
  @ApiOkResponse({ type: ProfileResponseDto })
  me(@CurrentUser() user: { id: string }) {
    return this.usersService.findMe(user.id);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Update your profile',
    description:
      'Partial profile update: name, currency, timezone. All fields are optional — ' +
      'send only what you change (PATCH semantics). name may be an empty string. ' +
      'currency is a 3-letter ISO 4217 code, timezone is a valid IANA name. Returns the updated profile.',
  })
  @ApiOkResponse({ type: ProfileResponseDto })
  updateMe(@CurrentUser() user: { id: string }, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.id, dto);
  }

  @Post('me/credentials')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set or change the password',
    description:
      'Dual purpose depending on the account state. ' +
      'If the user has no email yet (signed in via Telegram) — send email + password, both required. ' +
      'The email is NOT linked right away: a confirmation link is sent to the given email, ' +
      'and the email and password appear on the account only after following it (POST /auth/confirm-email). ' +
      'The response contains pendingConfirmation: true. ' +
      'If an email already exists — this is a password change: only password changes, the email cannot be changed via this endpoint. ' +
      'After a password change, hasPassword in the profile becomes true.',
  })
  @ApiOkResponse({ type: SuccessResponseDto })
  setCredentials(@CurrentUser() user: { id: string }, @Body() dto: SetCredentialsDto) {
    return this.authService.setCredentials(user.id, dto);
  }

  @Post('confirm-email')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm email linking',
    description:
      'Completes linking an email to an account created via Telegram: accepts the token from the email ' +
      '(see POST /auth/me/credentials) and writes the pending email and password onto the account. ' +
      'The token is one-time and lives for 24 hours. If the link has expired, the email is already linked, ' +
      'or the email was meanwhile taken by someone else — an error.',
  })
  @ApiOkResponse({ type: SuccessResponseDto })
  confirmEmail(@Body() dto: ConfirmEmailDto) {
    return this.authService.confirmEmail(dto.token);
  }

  @Post('resend-email-confirmation')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resend the email confirmation link',
    description:
      'Sends a fresh confirmation link to the email awaiting confirmation (set earlier via ' +
      'POST /auth/me/credentials), reusing the already-stored email and password — no need to ' +
      'resubmit them. Refreshes the token and its 24-hour expiry. Errors if the account already ' +
      'has an email or has nothing awaiting confirmation.',
  })
  @ApiOkResponse({ type: SuccessResponseDto })
  resendEmailConfirmation(@CurrentUser() user: { id: string }) {
    return this.authService.resendEmailConfirmation(user.id);
  }

  @Post('forgot-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request a password reset',
    description:
      'Accepts an email and, if such a user exists, generates a reset token and sends an email with a link. ' +
      'The response is always success regardless of whether the email exists — ' +
      'this is intentional, so registered emails cannot be discovered by enumeration. ' +
      'The user then follows the link and calls POST /auth/reset-password.',
  })
  @ApiOkResponse({
    type: SuccessResponseDto,
    description: "Always success (don't reveal whether the email exists)",
  })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset the password using a token',
    description:
      'Completes the reset flow: accepts the token from the email (see /auth/forgot-password) and a new password. ' +
      'If the token is valid and not expired — the password is changed and the token is consumed (one-time). Otherwise — an error.',
  })
  @ApiOkResponse({ type: SuccessResponseDto })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  @Post('link/google')
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({ type: SuccessResponseDto })
  @ApiOperation({
    summary: 'Link Google to the current account',
    description:
      'For an already logged-in user: links Google (by ID token) to their account, ' +
      'so they can also sign in via Google. Unlike POST /auth/google, it does not create a new user — ' +
      'it adds googleId to the current one. If this Google is already linked to another account — an error.',
  })
  linkGoogle(@CurrentUser() user: { id: string }, @Body() dto: GoogleAuthDto) {
    return this.authService.linkGoogle(user.id, dto);
  }

  @Post('link/telegram')
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({ type: SuccessResponseDto })
  @ApiOperation({
    summary: 'Link Telegram to the current account',
    description:
      'For an already logged-in user: verifies the Telegram Login Widget data signature and links telegramId ' +
      'to their account, so they can also sign in via Telegram. Does not create a new user. ' +
      'If this Telegram is already linked to another account — an error.',
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
