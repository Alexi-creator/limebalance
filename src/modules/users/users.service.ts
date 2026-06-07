import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserDto } from './dto/update-user.dto';

// Поля, безопасные для отдачи наружу: без password и без BigInt telegramId
const PUBLIC_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  currency: true,
  timezone: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateUserDto) {
    return this.prisma.user.create({ data: dto, select: PUBLIC_USER_SELECT });
  }

  findAll() {
    return this.prisma.user.findMany({ select: PUBLIC_USER_SELECT });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: PUBLIC_USER_SELECT,
    });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);
    return this.prisma.user.update({ where: { id }, data: dto, select: PUBLIC_USER_SELECT });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.user.delete({ where: { id }, select: PUBLIC_USER_SELECT });
  }

  findByTelegramId(telegramId: bigint) {
    return this.prisma.user.findUnique({ where: { telegramId } });
  }

  async findOrCreateByTelegramId(telegramId: bigint) {
    const existing = await this.prisma.user.findUnique({ where: { telegramId } });
    if (existing) return { user: existing, isNew: false };
    const user = await this.prisma.user.create({ data: { telegramId } });
    return { user, isNew: true };
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findOrCreateByEmail(email: string) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) return { user: existing, isNew: false };
    const user = await this.prisma.user.create({ data: { email } });
    return { user, isNew: true };
  }

  setEmail(userId: string, email: string) {
    return this.prisma.user.update({ where: { id: userId }, data: { email } });
  }

  findByGoogleId(googleId: string) {
    return this.prisma.user.findUnique({ where: { googleId } });
  }

  async findOrCreateByGoogle(googleId: string, email: string) {
    const byGoogleId = await this.prisma.user.findUnique({ where: { googleId } });
    if (byGoogleId) return { user: byGoogleId, isNew: false };

    // Аккаунт с такой почтой уже есть (например, регистрировался паролем) — привязываем Google.
    const byEmail = await this.prisma.user.findUnique({ where: { email } });
    if (byEmail) {
      const user = await this.prisma.user.update({
        where: { id: byEmail.id },
        data: { googleId },
      });
      return { user, isNew: false };
    }

    const user = await this.prisma.user.create({ data: { email, googleId } });
    return { user, isNew: true };
  }

  setGoogleId(userId: string, googleId: string) {
    return this.prisma.user.update({ where: { id: userId }, data: { googleId } });
  }

  setTelegramId(userId: string, telegramId: bigint) {
    return this.prisma.user.update({ where: { id: userId }, data: { telegramId } });
  }

  async getTimezone(id: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { timezone: true },
    });
    return user?.timezone ?? 'UTC';
  }

  async updateProfile(id: string, dto: UpdateProfileDto) {
    await this.findOne(id);
    await this.prisma.user.update({ where: { id }, data: dto });
    return this.findMe(id);
  }

  async findMe(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        email: true,
        name: true,
        telegramId: true,
        password: true,
        currency: true,
        timezone: true,
        subscription: {
          select: {
            plan: true,
            expiresAt: true,
          },
        },
      },
    });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    const { password, ...rest } = user;
    return {
      ...rest,
      telegramId: user.telegramId?.toString() ?? null,
      hasPassword: !!password,
    };
  }
}
