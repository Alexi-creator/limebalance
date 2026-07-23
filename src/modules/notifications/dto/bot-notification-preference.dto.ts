import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class BotNotificationPreferenceDto {
  @ApiProperty({ example: 'monthly_digest', description: 'Notification type this toggle controls' })
  type: string;

  @ApiProperty({ example: true, description: 'Whether this type is pushed to the Telegram chat' })
  enabled: boolean;
}

export class UpdateBotNotificationPreferenceDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  enabled: boolean;
}
