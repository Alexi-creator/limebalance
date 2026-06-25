import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UsageResponseDto } from './dto/usage-response.dto';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get('usage')
  @ApiOperation({
    summary: 'Current plan usage and remaining limits',
    description:
      'Used / limit / remaining for categories (lifetime total) and transactions (current month). ' +
      'limit and remaining are null on unlimited plans. Refetch after creating a record.',
  })
  @ApiOkResponse({ type: UsageResponseDto })
  usage(@CurrentUser() user: { id: string }) {
    return this.subscriptions.getUsage(user.id);
  }
}
