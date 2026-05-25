import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type Step =
  | 'idle'
  | 'addcategory:expense:waiting_name'
  | 'addcategory:income:waiting_name'
  | 'addexpense:waiting_amount'
  | 'addexpense:waiting_description'
  | 'addincome:waiting_amount'
  | 'addincome:waiting_description'
  | 'stat:expense:waiting_for_period'
  | 'stat:income:waiting_for_period'
  | 'stat:expense:waiting_for_details'
  | 'stat:income:waiting_for_details';

@Injectable()
export class StateService {
  constructor(private readonly prisma: PrismaService) {}

  async getStep(userId: string): Promise<Step> {
    const state = await this.prisma.userState.findUnique({ where: { userId } });
    return (state?.step as Step) ?? 'idle';
  }

  async get(userId: string) {
    return this.prisma.userState.findUnique({ where: { userId } });
  }

  async set(
    userId: string,
    data: {
      step: Step;
      categoryId?: string;
      categoryName?: string;
      amount?: number;
      description?: string;
      period?: string;
      isDetails?: boolean;
    },
  ) {
    await this.prisma.userState.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }

  async reset(userId: string) {
    await this.prisma.userState.deleteMany({ where: { userId } });
  }
}
