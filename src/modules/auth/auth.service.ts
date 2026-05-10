import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, createHmac } from 'node:crypto';
import { UsersService } from '../users/users.service';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { TelegramAuthDto } from './dto/telegram-auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async loginWithGoogle(dto: GoogleAuthDto) {
    const email = await this.verifyGoogleToken(dto.credential);
    const { user } = await this.usersService.findOrCreateByEmail(email);
    return this.issueToken(user.id);
  }

  async loginWithTelegram(dto: TelegramAuthDto) {
    this.verifyTelegramHash(dto);
    const { user } = await this.usersService.findOrCreateByTelegramId(BigInt(dto.id));
    return this.issueToken(user.id);
  }

  async linkGoogle(userId: string, dto: GoogleAuthDto) {
    const email = await this.verifyGoogleToken(dto.credential);
    const existing = await this.usersService.findByEmail(email);
    if (existing && existing.id !== userId) {
      throw new ConflictException('Email already linked to another account');
    }
    await this.usersService.setEmail(userId, email);
    return { success: true };
  }

  async linkTelegram(userId: string, dto: TelegramAuthDto) {
    this.verifyTelegramHash(dto);
    const existing = await this.usersService.findByTelegramId(BigInt(dto.id));
    if (existing && existing.id !== userId) {
      throw new ConflictException('Telegram account already linked to another user');
    }
    await this.usersService.setTelegramId(userId, BigInt(dto.id));
    return { success: true };
  }

  private async verifyGoogleToken(credential: string): Promise<string> {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId) throw new UnauthorizedException('Google OAuth not configured');

    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`,
    );
    if (!response.ok) throw new UnauthorizedException('Invalid Google token');

    const data = (await response.json()) as { aud?: string; email?: string; email_verified?: string };

    if (data.aud !== clientId) throw new UnauthorizedException('Token audience mismatch');
    if (!data.email || data.email_verified !== 'true') {
      throw new UnauthorizedException('Email not verified');
    }

    return data.email;
  }

  private verifyTelegramHash(dto: TelegramAuthDto) {
    const { hash, ...fields } = dto;
    const botToken = this.config.get<string>('BOT_TOKEN') ?? '';

    const secretKey = createHash('sha256').update(botToken).digest();
    const dataCheckString = Object.entries(fields)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (hash !== expectedHash) throw new UnauthorizedException('Invalid Telegram signature');

    if (Date.now() / 1000 - dto.auth_date > 86400) {
      throw new UnauthorizedException('Telegram auth data expired');
    }
  }

  issueToken(userId: string) {
    return { access_token: this.jwtService.sign({ sub: userId }) };
  }
}
