import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { SubscriptionsService } from '../subscriptions.service';

/**
 * Gates endpoints behind the investing / crypto section. Apply with `@UseGuards(InvestingAccessGuard)`
 * (after JwtAuthGuard, which is global). Pro and Ultra pass; free is rejected with 403.
 */
@Injectable()
export class InvestingAccessGuard implements CanActivate {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const { user } = ctx.switchToHttp().getRequest<{ user?: { id: string } }>();
    if (!user?.id || !(await this.subscriptions.hasInvestingAccess(user.id))) {
      throw new ForbiddenException('Investing section requires a Pro or Ultra plan');
    }
    return true;
  }
}
