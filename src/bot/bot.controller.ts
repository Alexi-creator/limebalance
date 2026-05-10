import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
import { Public } from '../modules/auth/decorators/public.decorator';
import { BotService } from './bot.service';

@Controller('bot')
export class BotController {
  private readonly logger = new Logger(BotController.name);

  constructor(private readonly botService: BotService) {}

  @Post('webhook')
  @Public()
  @HttpCode(200)
  async handleWebhook(@Body() update: object) {
    const u = update as Record<string, unknown>;
    const type = Object.keys(u).find((k) => k !== 'update_id') ?? 'unknown';
    this.logger.log(`update #${u.update_id} type=${type}`);
    try {
      await this.botService.handleUpdate(update);
    } catch (err) {
      this.logger.error('handleUpdate error', err);
    }
  }
}
