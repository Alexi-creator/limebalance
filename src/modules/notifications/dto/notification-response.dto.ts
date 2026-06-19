import { ApiProperty } from '@nestjs/swagger';

export class NotificationDto {
  @ApiProperty({ example: 'b3f1…', description: 'Notification id' })
  id: string;

  @ApiProperty({
    example: 'monthly_summary',
    description: 'Notification kind. Drives the icon and how the frontend renders the payload.',
  })
  type: string;

  @ApiProperty({ example: 'Итоги месяца', description: 'Server-rendered title (fallback text)' })
  title: string;

  @ApiProperty({
    example: 'Июнь: доход 120 000, расход 95 000, отложено 25 000. Топ-категория — Рестораны.',
    description: 'Server-rendered body (fallback text)',
  })
  body: string;

  @ApiProperty({
    nullable: true,
    description:
      'Structured data behind the notification (amounts, category, period…). ' +
      'The frontend can render/localize from this instead of title/body.',
    example: {
      period: '2026-06',
      baseCurrency: 'RUB',
      income: 120000,
      expense: 95000,
      net: 25000,
      topCategory: { name: 'Рестораны', emoji: '🍽️' },
    },
  })
  payload: unknown | null;

  @ApiProperty({ example: false, description: 'Whether the user has already read it' })
  isRead: boolean;

  @ApiProperty({ example: '2026-06-20T08:00:00.000Z' })
  createdAt: Date;
}

export class NotificationsResponseDto {
  @ApiProperty({ type: [NotificationDto] })
  items: NotificationDto[];

  @ApiProperty({ example: 3, description: 'Number of unread notifications (for the bell badge)' })
  unreadCount: number;
}
