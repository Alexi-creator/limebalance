import { Module } from '@nestjs/common';
import { InvestingAccessGuard } from './guards/investing-access.guard';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  providers: [SubscriptionsService, InvestingAccessGuard],
  exports: [SubscriptionsService, InvestingAccessGuard],
})
export class SubscriptionsModule {}
