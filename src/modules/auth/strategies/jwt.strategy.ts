import '@fastify/cookie';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { FastifyRequest } from 'fastify';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: FastifyRequest) => req.cookies?.access_token ?? null,
      ]),
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: { sub: string }) {
    // Reject blocked accounts here, at the global JWT layer, so a block takes effect on the very
    // next request for every route — including ones outside the admin module.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { blockedAt: true },
    });
    if (user?.blockedAt) throw new ForbiddenException('Account is blocked');
    return { id: payload.sub };
  }
}
