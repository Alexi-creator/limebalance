import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
import { BotService } from './bot.service';

@Controller('bot')
export class BotController {
  private readonly logger = new Logger(BotController.name);

  constructor(private readonly botService: BotService) {}

  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(@Body() update: object) {
    try {
      await this.botService.handleUpdate(update);
    } catch (err) {
      this.logger.error('handleUpdate error', err);
    }
  }
}
