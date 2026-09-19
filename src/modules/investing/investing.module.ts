import { Module } from '@nestjs/common';
import { BotModule } from '../../bot/bot.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BybitClient } from './bybit.client';
import { CoinIconService } from './coin-icon.service';
import { InvestingController } from './investing.controller';
import { InvestingService } from './investing.service';
import { InvestingMovementsService } from './investing-movements.service';
import { InvestingP2pService } from './investing-p2p.service';
import { InvestingSyncService } from './investing-sync.service';
import { InvestingTransfersService } from './investing-transfers.service';
import { InvestingVenuesService } from './investing-venues.service';
import { PriceService } from './price.service';
import { TradeCloseNotifierService } from './trade-close-notifier.service';

@Module({
  imports: [BotModule, NotificationsModule],
  controllers: [InvestingController],
  providers: [
    InvestingService,
    InvestingTransfersService,
    InvestingVenuesService,
    InvestingMovementsService,
    InvestingP2pService,
    InvestingSyncService,
    BybitClient,
    PriceService,
    CoinIconService,
    TradeCloseNotifierService,
  ],
  // The transfers service is exported for the balance: deposits leave the free balance.
  exports: [InvestingService, InvestingTransfersService],
})
export class InvestingModule {}
