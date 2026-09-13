import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTransferDto {
  @ApiProperty({
    example: 500,
    description:
      'In the account currency. Positive = deposit into the account, negative = withdraw back to ' +
      'the ledger. Must not be zero, and a withdrawal cannot exceed what the account has free.',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  amount: number;

  @ApiPropertyOptional({ example: '2026-09-13T00:00:00', description: 'Defaults to today' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  date?: Date;

  @ApiPropertyOptional({ example: 'пополнение с карты' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class TransferDto {
  @ApiProperty() id: string;
  @ApiProperty() accountId: string;
  @ApiProperty({ example: 500, description: '+ deposited, − withdrawn' }) amount: number;
  @ApiProperty({ example: 'USD' }) currency: string;
  @ApiProperty({ example: 'пополнение с карты', nullable: true }) note: string | null;
  @ApiProperty() date: Date;
}
