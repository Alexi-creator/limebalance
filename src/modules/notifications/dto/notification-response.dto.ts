import { ApiProperty } from '@nestjs/swagger';

export class NotificationDto {
  @ApiProperty({ example: 'b3f1…', description: 'Notification id' })
  id: string;

  @ApiProperty({
    example: 'monthly_summary',
    description: 'Notification kind. Drives the icon and how the frontend renders the payload.',
  })
  type: string;

  @ApiProperty({
    nullable: true,
    example: 'Monthly summary',
    description: 'Server-rendered title — fallback only. Localize from payload when present.',
  })
  title: string | null;

  @ApiProperty({
    nullable: true,
    example: 'June: income 120,000, expenses 95,000, saved 25,000. Top category — Restaurants.',
    description: 'Server-rendered body — fallback only. Localize from payload when present.',
  })
  body: string | null;

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
      topCategory: { name: 'Restaurants', emoji: '🍽️' },
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
