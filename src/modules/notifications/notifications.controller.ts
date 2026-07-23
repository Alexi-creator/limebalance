import { BadRequestException, Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  BotNotificationPreferenceDto,
  UpdateBotNotificationPreferenceDto,
} from './dto/bot-notification-preference.dto';
import { NotificationsResponseDto } from './dto/notification-response.dto';
import {
  BOT_NOTIFICATION_TYPES,
  BotNotificationType,
  NotificationsService,
} from './notifications.service';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: 'Notifications for the bell dropdown',
    description:
      'Fetched when the user opens the app / the bell. Recomputes the current-month summary from ' +
      "the latest income and expenses (so it reflects recent changes) and returns the user's " +
      'notifications, newest first, together with the unread count for the badge.',
  })
  @ApiOkResponse({ type: NotificationsResponseDto })
  list(@CurrentUser() user: { id: string }) {
    return this.notificationsService.list(user.id);
  }

  @Post(':id/read')
  @ApiOperation({
    summary: 'Mark one notification read',
    description: 'Persists the read state on the backend. Returns the updated unread count.',
  })
  markRead(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.notificationsService.markRead(user.id, id);
  }

  @Post('read-all')
  @ApiOperation({
    summary: 'Mark all notifications read',
    description: 'Marks every unread notification of the user read. Returns unreadCount = 0.',
  })
  markAllRead(@CurrentUser() user: { id: string }) {
    return this.notificationsService.markAllRead(user.id);
  }

  @Get('preferences')
  @ApiOperation({
    summary: 'Bot push preferences',
    description:
      'Every known proactive Telegram notification type for this user, with its current on/off ' +
      'state (a type with no stored override defaults to enabled).',
  })
  @ApiOkResponse({ type: [BotNotificationPreferenceDto] })
  listPreferences(@CurrentUser() user: { id: string }) {
    return this.notificationsService.listBotNotificationPreferences(user.id);
  }

  @Patch('preferences/:type')
  @ApiOperation({
    summary: 'Toggle a bot push type',
    description: 'Enables or disables one proactive Telegram notification type for this user.',
  })
  setPreference(
    @CurrentUser() user: { id: string },
    @Param('type') type: string,
    @Body() dto: UpdateBotNotificationPreferenceDto,
  ) {
    if (!BOT_NOTIFICATION_TYPES.includes(type as BotNotificationType)) {
      throw new BadRequestException(`Unknown notification type: ${type}`);
    }
    return this.notificationsService.setBotNotificationPreference(
      user.id,
      type as BotNotificationType,
      dto.enabled,
    );
  }
}
