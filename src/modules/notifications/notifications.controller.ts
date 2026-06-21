import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { NotificationsResponseDto } from './dto/notification-response.dto';
import { NotificationsService } from './notifications.service';

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
}
