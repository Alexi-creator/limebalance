import { Module } from '@nestjs/common';
import { BybitClient } from './bybit.client';
import { InvestingController } from './investing.controller';
import { InvestingService } from './investing.service';
import { InvestingSyncService } from './investing-sync.service';
import { PriceService } from './price.service';

@Module({
  controllers: [InvestingController],
  providers: [InvestingService, InvestingSyncService, BybitClient, PriceService],
  exports: [InvestingService],
})
export class InvestingModule {}
