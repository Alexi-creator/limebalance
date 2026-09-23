import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateExchangeAccountDto {
  @ApiPropertyOptional({ example: 'Main account', description: 'New display label' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  label?: string;

  @ApiPropertyOptional({
    example: true,
    description:
      'Record every completed P2P order from now on as a transfer between your wallet and this ' +
      'account: a buy takes the fiat out of the wallet, a sell puts it back. Orders placed ' +
      'before it was turned on are left alone. Turning it off keeps what was already recorded.',
  })
  @IsOptional()
  @IsBoolean()
  p2pAutoRecord?: boolean;
}
