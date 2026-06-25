import { Global, Module } from '@nestjs/common';
import { InvestingAccessGuard } from './guards/investing-access.guard';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Global()
@Module({
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, InvestingAccessGuard],
  exports: [SubscriptionsService, InvestingAccessGuard],
})
export class SubscriptionsModule {}
