import { Module } from '@nestjs/common';
import { BotModule } from '../../bot/bot.module';
import { MonthlyDigestService } from './monthly-digest.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [BotModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, MonthlyDigestService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
