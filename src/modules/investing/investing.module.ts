import { Module } from '@nestjs/common';
import { BotModule } from '../../bot/bot.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BybitClient } from './bybit.client';
import { CoinIconService } from './coin-icon.service';
import { InvestingController } from './investing.controller';
import { InvestingService } from './investing.service';
import { InvestingSyncService } from './investing-sync.service';
import { PriceService } from './price.service';
import { TradeCloseNotifierService } from './trade-close-notifier.service';

@Module({
  imports: [BotModule, NotificationsModule],
  controllers: [InvestingController],
  providers: [
    InvestingService,
    InvestingSyncService,
    BybitClient,
    PriceService,
    CoinIconService,
    TradeCloseNotifierService,
  ],
  exports: [InvestingService],
})
export class InvestingModule {}
